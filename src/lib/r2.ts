import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import './env';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'update-machine-releases';

export async function getObject(key: string): Promise<{ body: ReadableStream | null; contentType?: string; etag?: string } | null> {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const response = await s3.send(command);
    return {
      body: response.Body as unknown as ReadableStream | null,
      contentType: response.ContentType,
      etag: response.ETag,
    };
  } catch (e: any) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw e;
  }
}

export async function listObjects(prefix?: string): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const objects: { key: string; size: number; lastModified?: Date }[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 500,
    });
    const response = await s3.send(command);
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        objects.push({ key: obj.Key, size: obj.Size || 0, lastModified: obj.LastModified });
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function getObjectAsBuffer(key: string): Promise<Buffer | null> {
  const obj = await getObject(key);
  if (!obj || !obj.body) return null;

  const reader = (obj.body as any).transformToByteArray
    ? await (obj.body as any).transformToByteArray()
    : await streamToBuffer(obj.body);
  return Buffer.from(reader);
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export { s3, BUCKET };
