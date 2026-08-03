import { z } from "zod";

export const PUBLISH_PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

// Typografische Kürzel für Kalender & kompakte Ansichten (keine Icons).
export const PLATFORM_SHORT: Record<PublishPlatform, string> = {
  youtube: "YT",
  instagram: "IG",
  tiktok: "TT",
};

export function isPublishPlatform(value: unknown): value is PublishPlatform {
  return (
    typeof value === "string" && (PUBLISH_PLATFORMS as readonly string[]).includes(value)
  );
}

export const publishPlatformSchema = z.enum(PUBLISH_PLATFORMS);
export const publishTargetsSchema = z
  .array(publishPlatformSchema)
  .transform((targets) => [...new Set(targets)]);
