import { config } from "dotenv";
import path from "node:path";

// .env liegt im Repo-Root; der Worker läuft mit cwd = worker/ (npm -w) bzw.
// /app/worker (Docker, dort kommt Env per env_file — fehlende Datei ist ok).
config({ path: path.resolve(process.cwd(), "..", ".env") });
config();

// Worker-Env: zentral gelesen und validiert. Muster aus ClipPilot, erweitert.
// Dev: cwd = CreatorHQ/worker (npm -w) → ../tmp; Docker: WORKDIR /app/worker → /app/tmp.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Pflicht-Env fehlt: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6380"),
  appBaseUrl: optional("APP_BASE_URL", "http://localhost:3000"),
  appEncryptionKey: required("APP_ENCRYPTION_KEY"),

  s3: {
    endpoint: optional("S3_ENDPOINT", "http://localhost:9002"),
    region: optional("S3_REGION", "us-east-1"),
    bucket: optional("S3_BUCKET", "creatorhq"),
    accessKey: optional("S3_ACCESS_KEY", "creatorhq"),
    secretKey: required("S3_SECRET_KEY"),
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  },

  paths: {
    tmpDir: optional("TMP_DIR", path.resolve(process.cwd(), "..", "tmp")),
    cookies: optional("COOKIES_PATH", path.resolve(process.cwd(), "..", "cookies.txt")),
    ytdlp: optional("YTDLP_PATH", "yt-dlp"),
  },

  youtube: {
    apiKey: optional("YOUTUBE_API_KEY"),
  },
  twitch: {
    clientId: optional("TWITCH_CLIENT_ID"),
    clientSecret: optional("TWITCH_CLIENT_SECRET"),
  },
  tiktok: {
    clientKey: optional("TIKTOK_CLIENT_KEY"),
    clientSecret: optional("TIKTOK_CLIENT_SECRET"),
    redirectUri: optional("TIKTOK_REDIRECT_URI"),
    directPost: optional("TIKTOK_DIRECT_POST", "false") === "true",
  },
  google: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    redirectUri: optional("GOOGLE_REDIRECT_URI"),
    uploadPrivacy: optional("YT_UPLOAD_PRIVACY", "private"),
  },
  instagram: {
    appId: optional("IG_APP_ID"),
    appSecret: optional("IG_APP_SECRET"),
    redirectUri: optional("IG_REDIRECT_URI"),
  },

  anthropic: {
    apiKey: optional("ANTHROPIC_API_KEY"),
    captionModel: optional("CAPTION_MODEL", "claude-haiku-4-5-20251001"),
    briefingModel: optional("BRIEFING_MODEL", "claude-sonnet-5"),
    // Highlight-Auswahl liest lange Transkripte → stärkeres Modell lohnt sich.
    clipModel: optional("CLIP_MODEL", "claude-sonnet-5"),
  },

  clip: {
    // "smart" = Transkript-basiert (satzgenaue Grenzen, Kontext); "ffmpeg" = alter Lautstärke-Fallback.
    provider: optional("CLIP_PROVIDER", "smart"),
    maxCandidates: parseInt(optional("MAX_CLIP_CANDIDATES", "8"), 10),
    // ~62 s = über 1 Minute → für Creator-Programme qualifiziert (Mindestlänge)
    lengthSeconds: parseInt(optional("CLIP_LENGTH_SECONDS", "62"), 10),
    maxSeconds: parseInt(optional("CLIP_MAX_SECONDS", "90"), 10),
  },

  whisper: {
    // "small" = bester Kompromiss in der Standard-Docker-VM (~4 GB); "base" war der
    // Kern der Ungenauigkeit. large-v3-turbo lohnt sich, sobald die VM ≥ 8 GB hat
    // (Docker Desktop → Resources) — braucht allein ~2,5 GB.
    model: optional("WHISPER_MODEL", "small"),
    // Explizite Sprache verhindert Fehl-Detektion bei Musik-Intros ("auto" möglich).
    language: optional("WHISPER_LANGUAGE", "de"),
    enabled: optional("SUBTITLES_ENABLED", "true") === "true",
  },

  pipeline: {
    discoveryCron: optional("DISCOVERY_CRON", "0 6 * * *"),
    // Fallback-Handle, solange settings.youtubeChannelId leer ist.
    defaultYoutubeHandle: optional("DEFAULT_YOUTUBE_HANDLE", "@davidvorkamera"),
  },
};
