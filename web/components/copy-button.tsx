"use client";

import { useState } from "react";

/** Typografischer Copy-Button (Caption + Hashtags für den Manual-Fallback). */
export function CopyButton({ text, label = "Caption kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard kann in unsicheren Kontexten fehlen — dann manuell markieren.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
    >
      {copied ? "Kopiert" : label}
    </button>
  );
}
