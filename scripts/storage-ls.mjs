#!/usr/bin/env node
// MinIO/S3-Objekte auflisten (Verifikation). Nutzung: node scripts/storage-ls.mjs [prefix]
import "dotenv/config";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9004",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "creatorhq",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

const prefix = process.argv[2];
const res = await s3.send(
  new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET ?? "creatorhq", Prefix: prefix })
);

const objects = res.Contents ?? [];
for (const obj of objects) {
  const mb = ((obj.Size ?? 0) / 1024 / 1024).toFixed(1);
  console.log(`${String(mb).padStart(8)} MB  ${obj.Key}`);
}
console.log(`${objects.length} Objekt(e)${prefix ? ` unter ${prefix}` : ""}`);
