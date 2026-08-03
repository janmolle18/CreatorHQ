import type { ClipProvider } from "./ClipProvider.ts";
import { FfmpegClipProvider } from "./ffmpeg.ts";
import { SmartClipProvider } from "./smart.ts";
import { env } from "../env.ts";

let cached: ClipProvider | null = null;

/**
 * Default "smart": Transkript-basierte Auswahl mit satzgenauen Grenzen.
 * CLIP_PROVIDER=ffmpeg schaltet auf den alten Lautstärke-Provider zurück.
 */
export function getClipProvider(): ClipProvider {
  cached ??=
    env.clip.provider === "ffmpeg" ? new FfmpegClipProvider() : new SmartClipProvider();
  return cached;
}

export type { ClipProvider, ClipCandidate, ClipRequest } from "./ClipProvider.ts";
