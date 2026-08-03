import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TranscriptSegment } from "@creatorhq/db";
import { env } from "../env.ts";
import { logger } from "../logger.ts";

export interface Transcription {
  text: string;
  language: string | null;
  segments: TranscriptSegment[];
}

// Host-Dev nutzt das Projekt-venv (worker/whisper/.venv), Docker das
// systemweite python3 (faster-whisper ist im Image installiert).
function resolvePython(): string {
  if (process.env.WHISPER_PYTHON) return process.env.WHISPER_PYTHON;
  const venv = path.resolve(process.cwd(), "whisper/.venv/bin/python3");
  return existsSync(venv) ? venv : "python3";
}

// large-v3-turbo auf CPU braucht Zeit; beim allerersten Lauf kommt der
// Modell-Download (~1,6 GB) dazu. Großzügig statt abgebrochener Transkripte.
const TRANSCRIBE_TIMEOUT_MS = 45 * 60_000;

/**
 * Transkribiert eine oder mehrere Audio-Dateien via faster-whisper —
 * mit Wort-Timestamps für exakte Untertitel-Cues und Satzgrenzen.
 * Ein Python-Prozess für alle Dateien → Modell wird nur einmal geladen.
 * Reihenfolge der Ergebnisse = Reihenfolge der Eingabedateien.
 */
export async function transcribeFiles(files: string[]): Promise<Transcription[]> {
  if (files.length === 0) return [];
  const script = path.resolve(process.cwd(), "whisper/transcribe.py");
  try {
    const { stdout } = await execa(
      resolvePython(),
      [script, env.whisper.model, env.whisper.language, ...files],
      { timeout: TRANSCRIBE_TIMEOUT_MS }
    );
    const parsed = JSON.parse(stdout) as Array<{
      text?: string;
      language?: string | null;
      segments?: TranscriptSegment[];
    }>;
    return parsed.map((p) => ({
      text: p.text ?? "",
      language: p.language ?? null,
      segments: p.segments ?? [],
    }));
  } catch (err) {
    logger.warn({ err }, "Transkription fehlgeschlagen – Clips ohne Untertitel");
    return files.map(() => ({ text: "", language: null, segments: [] }));
  }
}
