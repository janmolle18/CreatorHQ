import { db, clips } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streamt den gerenderten 9:16-Clip aus MinIO über das Dashboard (gleicher Origin).
// Aus ClipPilot übernommen, plus: Auth-Guard und presignte URL statt offenem Bucket.
// WICHTIG: Range-Requests durchreichen und Content-Length/-Range spiegeln,
// sonst spielen Browser das <video> nicht ab bzw. können nicht spulen.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getSession())) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { id } = await params;
  const [clip] = await db.select().from(clips).where(eq(clips.id, id));
  if (!clip?.renderedPath) {
    return new Response("Clip noch nicht gerendert", { status: 404 });
  }

  const url = await presignGet(clip.renderedPath);
  const range = req.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetch(url, range ? { headers: { range } } : {});
  } catch (error) {
    return new Response(`Storage nicht erreichbar: ${String(error)}`, { status: 502 });
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    return new Response(`Storage-Fehler ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  // ?download=1 → Browser lädt statt abzuspielen (Manual-Fallback).
  if (req.url.includes("download=1")) {
    headers.set("content-disposition", `attachment; filename="creatorhq-clip-${id}.mp4"`);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  return new Response(upstream.body, { status: upstream.status, headers });
}
