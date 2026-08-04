import { clips, withTenant } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Vorschau-Standbild eines Kandidaten aus MinIO (gleicher Origin, Auth-Guard).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  // Wie bei der Video-Route: Die Mandantengrenze IST die Zugriffsprüfung.
  const { id } = await params;
  const thumbPath = await withTenant(session.tenantId, async (db) => {
    const [clip] = await db
      .select({ thumbPath: clips.thumbPath })
      .from(clips)
      .where(eq(clips.id, id));
    return clip?.thumbPath ?? null;
  });
  if (!thumbPath) {
    return new Response("Kein Vorschaubild", { status: 404 });
  }

  const url = await presignGet(thumbPath);
  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch (error) {
    return new Response(`Storage nicht erreichbar: ${String(error)}`, { status: 502 });
  }
  if (upstream.status !== 200) {
    return new Response(`Storage-Fehler ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", "image/jpeg");
  // Standbilder sind unveränderlich je Clip-Id → kurz cachen entlastet das Board.
  headers.set("cache-control", "private, max-age=3600");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);

  return new Response(upstream.body, { status: 200, headers });
}
