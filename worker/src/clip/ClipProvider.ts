/**
 * Austauschbare Clipping-Engine (aus ClipPilot; clipsai/vizard bewusst nicht übernommen).
 *
 * Eine Implementierung bekommt eine lokale Quell-Videodatei und liefert
 * Kandidaten-Clips zurück (Start/Ende + optional Transkript/Score).
 * Ob die Implementierung selbst rendert, signalisiert `producesRenderedFile`.
 */

export interface ClipCandidate {
  startSeconds: number;
  endSeconds: number;
  /** 0..1 – wie stark ist der Highlight-Charakter */
  score?: number;
  transcript?: string;
  /** Fertige SRT-Untertitel (clip-relativ), falls der Provider sie liefert. */
  subtitlesSrt?: string;
  caption?: string;
  /** Lokaler Pfad zur fertigen 9:16-Datei, falls der Provider rendert. */
  renderedFilePath?: string;
}

export interface ClipRequest {
  /** Lokaler Pfad zur heruntergeladenen Quell-Videodatei */
  sourceFilePath: string;
  sourceVideoId: string;
  maxCandidates: number;
  durationSeconds?: number;
}

export interface ClipProvider {
  readonly name: "ffmpeg" | "smart";
  readonly producesRenderedFile: boolean;
  findClips(req: ClipRequest): Promise<ClipCandidate[]>;
}
