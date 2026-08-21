import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { env } from "../env.ts";
import { logger } from "../logger.ts";

export const TMP_DIR = env.paths.tmpDir;

const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  forcePathStyle: env.s3.forcePathStyle,
  credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
});

/** Bucket anlegen, falls nicht vorhanden (idempotent beim Worker-Start). */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.s3.bucket }));
    logger.info({ bucket: env.s3.bucket }, "S3-Bucket angelegt");
  }
}

/** Lokale Datei nach S3 hochladen, gibt den Key zurück. */
export async function uploadFile(localPath: string, key: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: createReadStream(localPath),
    })
  );
  return key;
}

/** S3-Objekt in eine lokale tmp-Datei laden, gibt den lokalen Pfad zurück. */
export async function downloadKeyToTmp(key: string, fileName?: string): Promise<string> {
  await mkdir(TMP_DIR, { recursive: true });
  const local = path.join(TMP_DIR, fileName ?? path.basename(key));
  const res = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(local));
  return local;
}

/** Presigned GET-URL (z. B. für Player oder PULL_FROM_URL-Uploads). */
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
    expiresIn,
  });
}

/**
 * Objekt entfernen. Scheitert leise: eine nicht gelöschte Datei kostet Platz,
 * darf aber keinen Job kippen.
 */
export async function deleteObject(key: string): Promise<boolean> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return true;
  } catch (err) {
    logger.warn({ err, key }, "storage: Objekt nicht entfernt");
    return false;
  }
}
