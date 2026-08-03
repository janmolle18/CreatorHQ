import { NextResponse, type NextRequest } from "next/server";
import { verifyMediaSignature } from "@creatorhq/shared";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

// ÖFFENTLICHE Route (Middleware-Ausnahme) für Instagram-video_url:
// nur mit gültiger HMAC-Signatur + Ablaufzeit erreichbar — kein offener Bucket,
// keine Session nötig, nach Ablauf automatisch tot.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const storagePath = path.map(decodeURIComponent).join("/");
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const secret = process.env.APP_ENCRYPTION_KEY ?? "";

  if (!secret || !verifyMediaSignature(storagePath, exp, sig, secret)) {
    return new NextResponse("Ungültige oder abgelaufene Signatur", { status: 403 });
  }

  const url = await presignGet(storagePath);
  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(url, range ? { headers: { range } } : {});
  } catch (error) {
    return new NextResponse(`Storage nicht erreichbar: ${String(error)}`, { status: 502 });
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    return new NextResponse(`Storage-Fehler ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
