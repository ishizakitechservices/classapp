/**
 * One-time setup: allow the browser to upload straight into the B2 bucket.
 *
 * Direct uploads are what make saving instant — the file goes browser -> B2
 * instead of browser -> app server -> B2. That only works if the bucket accepts
 * CORS requests: a preflight OPTIONS and a PUT from this app's own origin.
 *
 * Run once (safe to re-run):
 *   npx tsx scripts/setup-b2-cors.ts
 *
 * The bucket must also have "Enable CORS" (bucket info -> CORS Rules) reachable
 * by the application key used here — normal read/write keys can set it.
 */
import dotenv from 'dotenv';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

dotenv.config();

const {
  B2_REGION = 'us-west-004',
  B2_KEY_ID,
  B2_APPLICATION_KEY,
  B2_BUCKET_NAME,
  APP_URL,
} = process.env;

if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET_NAME) {
  console.error('Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME (and optionally B2_REGION) in .env first.');
  process.exit(1);
}

/**
 * APP_URL plus localhost, so dev and production both work. APP_URL is a
 * placeholder ("MY_APP_URL") until the real host is set, so guard against it.
 */
function allowedOrigins(): string[] {
  const origins = new Set<string>(['http://localhost:3000', 'http://localhost:5173']);
  if (APP_URL && /^https?:\/\//.test(APP_URL)) origins.add(APP_URL.replace(/\/+$/, ''));
  return [...origins];
}

/** B2 regions are served from s3.<region>.backblazeb2.com. */
function endpointFor(region: string): string {
  return `https://s3.${region}.backblazeb2.com`;
}

const client = new S3Client({
  endpoint: endpointFor(B2_REGION),
  region: B2_REGION,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
  forcePathStyle: true,
});

const origins = allowedOrigins();

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: B2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            // PUT: direct upload. GET: signed downloads. HEAD is deliberately absent —
            // B2 rejects it in CORS rules, and the app never HEADs from the browser.
            AllowedMethods: ['GET', 'PUT'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  console.log(`CORS set on "${B2_BUCKET_NAME}" for: ${origins.join(', ')}`);

  const current = await client.send(new GetBucketCorsCommand({ Bucket: B2_BUCKET_NAME }));
  console.log('Now stored:', JSON.stringify(current.CORSRules, null, 2));
} catch (err) {
  console.error('Could not set CORS:', err instanceof Error ? err.message : err);
  process.exit(1);
}
