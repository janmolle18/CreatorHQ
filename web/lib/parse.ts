// Wandelt eingefügte Links in die Identifier um, die APIs/Worker brauchen.
// Kanal-Parsing 1:1 aus ClipPilot; Video-/VOD-Parsing neu für den Quellen-Ingest.

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Twitch-Profil-Link → Login-Name (z. B. https://twitch.tv/Name → "name"). */
export function parseTwitchLogin(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.hostname.includes("twitch.tv")) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      return seg ? seg.toLowerCase() : null;
    }
  } catch {
    /* kein URL – als blanker Name behandeln */
  }
  return s.replace(/^@/, "").toLowerCase();
}

/**
 * YouTube-Kanal-Link → Identifier: Kanal-ID ("UC…") oder Handle ("@name").
 */
export function parseYoutubeChannel(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const ci = parts.indexOf("channel");
      if (ci >= 0 && parts[ci + 1]) return parts[ci + 1]!; // /channel/UC…
      const handle = parts.find((p) => p.startsWith("@"));
      if (handle) return handle; // /@name
      const ui = parts.indexOf("user");
      if (ui >= 0 && parts[ui + 1]) return "@" + parts[ui + 1]!; // /user/name (Legacy)
      const cu = parts.indexOf("c");
      if (cu >= 0 && parts[cu + 1]) return "@" + parts[cu + 1]!; // /c/name (Legacy)
    }
  } catch {
    /* kein URL – als blanken Wert behandeln */
  }
  if (s.startsWith("UC") || s.startsWith("@")) return s;
  return `@${s}`;
}

/**
 * YouTube-Video-Link → Video-ID (11 Zeichen).
 * Unterstützt watch?v=, youtu.be/, /shorts/, /live/, /embed/ und blanke IDs.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (YOUTUBE_ID_PATTERN.test(s)) return s;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const fromQuery = u.searchParams.get("v");
      if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) return fromQuery;
      const parts = u.pathname.split("/").filter(Boolean);
      for (const prefix of ["shorts", "live", "embed"]) {
        const i = parts.indexOf(prefix);
        const candidate = i >= 0 ? parts[i + 1] : undefined;
        if (candidate && YOUTUBE_ID_PATTERN.test(candidate)) return candidate;
      }
    }
  } catch {
    /* kein URL */
  }
  return null;
}

/** Twitch-VOD-Link → numerische VOD-ID (twitch.tv/videos/123…). */
export function parseTwitchVodId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{6,}$/.test(s)) return s;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.hostname.includes("twitch.tv")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("videos");
      const candidate = i >= 0 ? parts[i + 1] : undefined;
      if (candidate && /^\d+$/.test(candidate)) return candidate;
    }
  } catch {
    /* kein URL */
  }
  return null;
}
