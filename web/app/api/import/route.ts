import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, clips } from "@creatorhq/db";
import { getSession } from "@/lib/auth";
import { putObject } from "@/lib/storage";

export const runtime = "nodejs";

// IG-Import: fertige Clips (mp4) → MinIO → clips-Row (origin='imported').
// Die ffprobe-Validierung übernimmt der Worker (ingest-tick → validate-import).

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB je Datei

interface ImportResult {
  file: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Keine Dateien übermittelt" }, { status: 400 });
  }

  const results: ImportResult[] = [];
  for (const file of files) {
    const isMp4 =
      file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) {
      results.push({ file: file.name, ok: false, error: "Nur mp4-Dateien" });
      continue;
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      results.push({ file: file.name, ok: false, error: "Dateigröße ungültig (max. 500 MB)" });
      continue;
    }

    try {
      const clipId = randomUUID();
      const key = `imports/${clipId}.mp4`;
      const body = Buffer.from(await file.arrayBuffer());
      await putObject(key, body, "video/mp4");

      await db.insert(clips).values({
        id: clipId,
        origin: "imported",
        provider: "import",
        status: "rendered",
        renderedPath: key,
        title: file.name.replace(/\.mp4$/i, ""),
      });
      results.push({ file: file.name, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload fehlgeschlagen";
      results.push({ file: file.name, ok: false, error: message.slice(0, 200) });
    }
  }

  return NextResponse.json({
    imported: results.filter((r) => r.ok).length,
    results,
  });
}
