import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Minimaler S3/MinIO-Zugriff für Web-Uploads (IG-Import).
// Der Worker hat den vollen Storage-Client; hier nur, was Uploads brauchen.

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9004",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "creatorhq",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });
  return client;
}

export function storageBucket(): string {
  return process.env.S3_BUCKET ?? "creatorhq";
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: storageBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** Objekt löschen (z. B. gerendertes Video beim Clip-Löschen). */
export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: storageBucket(), Key: key }));
}

/** Presigned GET-URL (Bucket bleibt privat; die Video-Route streamt darüber). */
export async function presignGet(key: string, expiresInSeconds = 600): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: storageBucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}
