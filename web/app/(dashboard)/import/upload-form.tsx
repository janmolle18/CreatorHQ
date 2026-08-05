"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, StatusText, buttonClasses } from "@/components/ui";

interface UploadState {
  busy: boolean;
  message: string | null;
  tone: "ok" | "err";
}

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [state, setState] = useState<UploadState>({ busy: false, message: null, tone: "ok" });

  async function upload() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) {
      setState({ busy: false, message: "Bitte zuerst mp4-Dateien auswählen.", tone: "err" });
      return;
    }

    setState({ busy: true, message: null, tone: "ok" });
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);

    try {
      const response = await fetch("/api/import", { method: "POST", body: formData });
      const data = (await response.json()) as {
        imported?: number;
        results?: Array<{ file: string; ok: boolean; error?: string }>;
        error?: string;
      };
      if (!response.ok) {
        setState({ busy: false, message: data.error ?? "Upload fehlgeschlagen", tone: "err" });
        return;
      }
      const failed = (data.results ?? []).filter((r) => !r.ok);
      const summary =
        `${data.imported ?? 0} Clip(s) importiert` +
        (failed.length > 0
          ? ` — abgelehnt: ${failed.map((f) => `${f.file} (${f.error})`).join(", ")}`
          : "");
      setState({ busy: false, message: summary, tone: failed.length > 0 ? "err" : "ok" });
      if (inputRef.current) inputRef.current.value = "";
      setSelectedCount(0);
      router.refresh();
    } catch {
      setState({ busy: false, message: "Netzwerkfehler beim Upload", tone: "err" });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Die Dateiwahl war per Tastatur GAR NICHT erreichbar: `hidden` erzeugt
          display:none, und was nicht dargestellt wird, bekommt auch keinen
          Fokus. Das Etikett war kein Knopf und hatte keinen tabindex — damit
          war der ganze Import nur mit der Maus bedienbar.
          `sr-only` versteckt die Eingabe sichtbar, laesst sie aber im
          Fokuslauf; `focus-within` zeigt am Etikett, dass sie dran ist. */}
      <label
        className={buttonClasses(
          "ghost",
          "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        )}
      >
        Dateien auswählen
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,.mp4"
          multiple
          className="sr-only"
          onChange={(event) => setSelectedCount(event.target.files?.length ?? 0)}
        />
      </label>
      <span className="tnum text-sm text-ink-soft">
        {selectedCount > 0 ? `${selectedCount} Datei(en) gewählt` : "Keine Dateien gewählt"}
      </span>
      <Button type="button" onClick={upload} disabled={state.busy}>
        {state.busy ? "Lädt hoch …" : "Importieren"}
      </Button>
      {state.message && <StatusText tone={state.tone}>{state.message}</StatusText>}
    </div>
  );
}
