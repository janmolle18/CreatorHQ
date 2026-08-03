import { db, sourceVideos, type SourceTranscript, type SourceVideo } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import path from "node:path";
import { rm } from "node:fs/promises";
import { env } from "../env.ts";
import { logger } from "../logger.ts";
import { TMP_DIR } from "../integrations/storage.ts";
import { transcribeFiles } from "../integrations/transcribe.ts";
import { cuesToSrt, windowCues } from "../jobs/subtitle-cues.ts";
import { segmentsToSentences } from "./sentences.ts";
import {
  padWindow,
  selectHeuristicWindows,
  type HighlightWindow,
} from "./highlight-heuristic.ts";
import { selectClaudeHighlights, type HookedWindow } from "./llm-highlights.ts";
import { FfmpegClipProvider } from "./ffmpeg.ts";
import type { ClipCandidate, ClipProvider, ClipRequest } from "./ClipProvider.ts";

// Transkript-basierte Clip-Auswahl: Das komplette Quellvideo wird EINMAL mit
// Wort-Timestamps transkribiert (Cache in source_videos.transcript_json →
// „Erneut clippen" ist danach sofort). Clip-Grenzen liegen immer auf
// Satzgrenzen, die Auswahl trifft Claude (mit Key) oder die Satz-Heuristik.
// Untertitel entstehen aus den Wort-Timestamps des Voll-Transkripts —
// keine separaten Whisper-Läufe pro Fenster mehr.
//
// Fallback-Kette (darf NIE hart scheitern): Claude → Satz-Heuristik →
// Lautstärke-Provider. Jeder unerwartete Fehler landet im Lautstärke-Pfad.

const MIN_TRANSCRIPT_WORDS = 30;
const MIN_SENTENCES = 4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function cachedTranscript(video: SourceVideo | undefined): SourceTranscript | null {
  // jsonb ist nur compile-time typisiert → Form defensiv prüfen.
  const transcript = video?.transcriptJson;
  if (transcript && Array.isArray(transcript.segments) && transcript.segments.length > 0) {
    return transcript;
  }
  return null;
}

export class SmartClipProvider implements ClipProvider {
  readonly name = "smart" as const;
  readonly producesRenderedFile = false;
  private readonly volumeFallback = new FfmpegClipProvider();

  async findClips(req: ClipRequest): Promise<ClipCandidate[]> {
    try {
      return await this.findClipsFromTranscript(req);
    } catch (err) {
      logger.warn(
        { err, sourceVideoId: req.sourceVideoId },
        "smart: unerwarteter Fehler — Lautstärke-Fallback"
      );
      return this.volumeFallback.findClips(req);
    }
  }

  private async findClipsFromTranscript(req: ClipRequest): Promise<ClipCandidate[]> {
    const [video] = await db
      .select()
      .from(sourceVideos)
      .where(eq(sourceVideos.id, req.sourceVideoId));

    const transcript = await this.loadOrCreateTranscript(req, video);
    const sentences = transcript ? segmentsToSentences(transcript.segments) : [];
    const totalWords = sentences.reduce((sum, sentence) => sum + sentence.wordCount, 0);

    if (!transcript || sentences.length < MIN_SENTENCES || totalWords < MIN_TRANSCRIPT_WORDS) {
      logger.warn(
        { sourceVideoId: req.sourceVideoId, sentenceCount: sentences.length },
        "smart: kein brauchbares Transkript — Lautstärke-Fallback"
      );
      return this.volumeFallback.findClips(req);
    }

    const duration = req.durationSeconds ?? sentences[sentences.length - 1]!.end;
    const opts = {
      minSeconds: env.clip.lengthSeconds,
      maxSeconds: env.clip.maxSeconds,
      maxCandidates: req.maxCandidates,
    };

    const claudeWindows = await selectClaudeHighlights(sentences, {
      ...opts,
      videoTitle: video?.title ?? null,
    });
    const windows: Array<HighlightWindow | HookedWindow> =
      claudeWindows ?? selectHeuristicWindows(sentences, opts);

    if (windows.length === 0) {
      logger.warn(
        { sourceVideoId: req.sourceVideoId, durationSeconds: duration },
        "smart: kein Fenster in der Ziel-Länge (Video zu kurz?) — Lautstärke-Fallback"
      );
      return this.volumeFallback.findClips(req);
    }

    return windows.map((win) => {
      const padded = padWindow(win, duration);
      const cues = windowCues(transcript.segments, padded.start, padded.end);
      const text = cues
        .map((cue) => cue.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        startSeconds: round2(padded.start),
        endSeconds: round2(padded.end),
        score: win.score,
        transcript: text || undefined,
        subtitlesSrt: cues.length > 0 ? cuesToSrt(cues) : undefined,
        caption: "hook" in win ? win.hook : undefined,
      };
    });
  }

  private async loadOrCreateTranscript(
    req: ClipRequest,
    video: SourceVideo | undefined
  ): Promise<SourceTranscript | null> {
    const cached = cachedTranscript(video);
    if (cached) {
      logger.info({ sourceVideoId: req.sourceVideoId }, "smart: Transkript aus Cache");
      return cached;
    }
    if (!env.whisper.enabled) return null;

    // Audio einmal komplett extrahieren (16 kHz mono = Whisper-Eingangsformat).
    const wav = path.join(TMP_DIR, `full-audio-${req.sourceVideoId}.wav`);
    try {
      await execa("ffmpeg", [
        "-y", "-i", req.sourceFilePath, "-vn", "-ac", "1", "-ar", "16000", wav,
      ]);
      logger.info(
        { sourceVideoId: req.sourceVideoId, model: env.whisper.model },
        "smart: transkribiere komplettes Video (einmalig, wird gecacht)"
      );
      const [result] = await transcribeFiles([wav]);
      if (!result || result.segments.length === 0) return null;

      const transcript: SourceTranscript = {
        language: result.language,
        model: env.whisper.model,
        segments: result.segments,
      };
      try {
        await db
          .update(sourceVideos)
          .set({ transcriptJson: transcript, updatedAt: new Date() })
          .where(eq(sourceVideos.id, req.sourceVideoId));
      } catch (err) {
        // Cache-Write-Fehler darf die teure, fertige Transkription nicht verwerfen.
        logger.warn({ err, sourceVideoId: req.sourceVideoId }, "smart: Transkript-Cache nicht gespeichert");
      }
      return transcript;
    } catch (err) {
      logger.warn({ err, sourceVideoId: req.sourceVideoId }, "smart: Transkription fehlgeschlagen");
      return null;
    } finally {
      await rm(wav, { force: true });
    }
  }
}
