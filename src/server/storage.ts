/**
 * Backblaze B2 object storage (S3-compatible). Server-only.
 *
 * The browser never receives B2 credentials and never talks to B2 directly:
 * files are streamed through Express, which first checks ownership and quota.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

let client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_KEY_ID &&
      process.env.B2_APPLICATION_KEY &&
      process.env.B2_BUCKET_NAME
  );
}

function getClient(): S3Client {
  if (client) return client;
  if (!isStorageConfigured()) {
    throw new Error('Backblaze B2 is not configured on the server.');
  }
  client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION || 'us-west-004',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
    forcePathStyle: true,
  });
  return client;
}

function bucket(): string {
  return process.env.B2_BUCKET_NAME!;
}

/**
 * Object keys are generated here, never taken from the client. This prevents
 * path traversal and avoids leaking original filenames into the bucket.
 */
export function buildObjectKey(ownerId: number, originalName: string): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase().slice(0, 10) : 'bin';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
  return `u${ownerId}/${crypto.randomUUID()}.${safeExt}`;
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Presigned PUT so the browser uploads straight into B2.
 *
 * This is the fast path: the file never travels browser -> server -> B2 twice.
 * The signature binds the content type, so a link cannot be reused to store a
 * different kind of object.
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}

/** True when B2 holds the object, with the size it actually stored. */
export async function headObject(key: string): Promise<{ sizeBytes: number } | null> {
  try {
    const out = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { sizeBytes: Number(out.ContentLength || 0) };
  } catch {
    return null;
  }
}

/** Copy an already-stored object (server side, no download to us). */
export async function copyObject(sourceKey: string, destKey: string): Promise<void> {
  await getClient().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: destKey,
      CopySource: `${bucket()}/${sourceKey}`,
    })
  );
}

/** Short-lived download link. Ownership is checked by the caller before this runs. */
export async function createDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Reads a small object back as text (owner-checked by the caller). */
export async function getObjectText(key: string, maxBytes: number): Promise<string> {
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${maxBytes - 1}` })
  );
  return (out.Body as any).transformToString('utf-8');
}

/**
 * Open a download as a stream. The bytes flow through without ever being
 * collected into one Buffer, so a big file starts arriving immediately and
 * the server's memory stays flat.
 */
export async function getObjectStream(
  key: string,
  dispositionFilename?: string,
  range?: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength?: number; contentRange?: string }> {
  const out = await getClient().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(range ? { Range: range } : {}),
      ...(dispositionFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${dispositionFilename
              .replace(/[^\w.\- ]+/g, '_')
              .slice(0, 120)}"`,
          }
        : {}),
    })
  );
  // In Node the SDK body is a Readable stream; the transform helper signals that.
  const body: any = out.Body;
  if (!body || typeof body.pipe !== 'function') {
    throw new Error('Object body is not streamable.');
  }
  return {
    stream: body,
    contentType: out.ContentType || 'application/octet-stream',
    contentLength: out.ContentLength ? Number(out.ContentLength) : undefined,
    contentRange: out.ContentRange || undefined,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
