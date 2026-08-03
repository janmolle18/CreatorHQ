// SRT → ASS mit eingebettetem TikTok-Stil.
//
// Hintergrund: ffmpeg ≥ 7 zerlegt -filter_complex auf Graph-Ebene an Kommas,
// auch innerhalb von Quotes — `subtitles=…:force_style='…,…'` bricht damit.
// Ein ASS-File trägt den Stil im Header, der Filter braucht nur noch den Pfad.
//
// Geometrie (PlayRes 384×288 auf 1080×1920 gemappt): Beim Blur-Reframe liegt
// ein 16:9-Video im Band y 656–1264 px; darunter sind 656 px Unschärfe.
// Untertitel gehören FEST in dieses untere Band und dürfen nie ins Bild
// wachsen: Größe 11 (≈73 px/Zeile), Anker unten-zentriert bei MarginV 24
// (≈160 px vom Rand) → selbst 3 Zeilen enden unterhalb der Videokante.
// BorderStyle 3 legt eine halbtransparente Box hinter den Text (feste,
// ruhige Fläche statt frei schwebender Wörter).

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TikTok,DejaVu Sans,11,&H00FFFFFF,&H00FFFFFF,&H66000000,&H66000000,-1,0,0,0,100,100,0,0,3,2,0,2,40,40,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})$/;

/** "00:01:02,345" → "0:01:02.34" (ASS: Stunden einstellig, Centisekunden). */
export function srtTimeToAss(time: string): string | null {
  const match = time.trim().match(TIME_PATTERN);
  if (!match) return null;
  const [, hh, mm, ss, msRaw] = match;
  const centis = Math.min(99, Math.round(Number(msRaw!.padEnd(3, "0")) / 10));
  return `${Number(hh)}:${mm}:${ss}.${String(centis).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  // Geschweifte Klammern wären ASS-Override-Tags → neutralisieren.
  return text.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r/g, "");
}

/**
 * Wandelt SRT-Untertitel in ein komplettes ASS-Dokument mit TikTok-Stil um.
 * Nicht parsbare Blöcke werden übersprungen (defensiv statt Render-Abbruch).
 */
export function srtToAss(srt: string): string {
  const events: string[] = [];
  for (const block of srt.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    // Zeile mit "-->" finden (Index-Zeile davor ist optional).
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;
    const [startRaw, endRaw] = lines[timingIndex]!.split("-->").map((s) => s.trim());
    const start = startRaw ? srtTimeToAss(startRaw) : null;
    const end = endRaw ? srtTimeToAss(endRaw) : null;
    if (!start || !end) continue;

    const text = lines
      .slice(timingIndex + 1)
      .map(escapeAssText)
      .join("\\N");
    if (!text) continue;

    events.push(`Dialogue: 0,${start},${end},TikTok,,0,0,0,,${text}`);
  }
  return ASS_HEADER + events.join("\n") + "\n";
}
