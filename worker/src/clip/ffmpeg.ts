import { execa } from "execa";
import { logger } from "../logger.ts";
import { env } from "../env.ts";
import type { ClipProvider, ClipRequest, ClipCandidate } from "./ClipProvider.ts";

const CLIP_LEN = env.clip.lengthSeconds; // Sekunden pro Kandidat (Default ~62 = über 1 Min)

async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execa("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    // Letzte Fallback-Stufe darf nicht werfen → Dauer 0 = „keine Clips" weiter oben.
    return 0;
  }
}

/** Mittlere Lautstärke (dB) eines Fensters – grober Highlight-Indikator. */
async function meanVolume(file: string, start: number, len: number): Promise<number> {
  try {
    const { stderr } = await execa("ffmpeg", [
      "-ss", String(start),
      "-t", String(len),
      "-i", file,
      "-af", "volumedetect",
      "-f", "null", "-",
    ]);
    const match = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
    return match?.[1] ? parseFloat(match[1]) : -60;
  } catch {
    return -60;
  }
}

/**
 * Lokaler Provider ohne GPU/Drittkosten: teilt das Video in Fenster und
 * bewertet sie nach Lautstärke (lautere Stellen = wahrscheinlicher Highlight).
 * Liefert nur Zeitfenster – das Rendering (9:16 + Untertitel) macht render.ts.
 */
export class FfmpegClipProvider implements ClipProvider {
  readonly name = "ffmpeg" as const;
  readonly producesRenderedFile = false;

  async findClips(req: ClipRequest): Promise<ClipCandidate[]> {
    const duration = req.durationSeconds ?? (await probeDuration(req.sourceFilePath));
    if (duration <= 0) {
      logger.warn({ sourceVideoId: req.sourceVideoId }, "ffmpeg: Dauer 0, keine Clips");
      return [];
    }

    // Fenster über das Video verteilen (mit etwas Rand)
    const usable = Math.max(0, duration - CLIP_LEN);
    const stride = usable / Math.max(1, req.maxCandidates);
    const windows: { start: number; vol: number }[] = [];

    for (let i = 0; i < req.maxCandidates; i++) {
      const start = Math.min(usable, Math.round(i * stride));
      const vol = await meanVolume(req.sourceFilePath, start, CLIP_LEN);
      windows.push({ start, vol });
    }

    // Lautstärke (-60..0 dB) auf 0..1 normalisieren als Score
    const vols = windows.map((w) => w.vol);
    const min = Math.min(...vols);
    const max = Math.max(...vols);
    const range = max - min || 1;

    return windows
      .map((w) => ({
        startSeconds: w.start,
        endSeconds: Math.min(duration, w.start + CLIP_LEN),
        score: (w.vol - min) / range,
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}
