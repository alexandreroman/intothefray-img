import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const CONCURRENCY = 8;

export function createClient(env: Record<string, string | undefined>): S3Client {
  const need = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`missing env ${k}`);
    return v;
  };
  return new S3Client({
    region: "auto",
    endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: need("R2_ACCESS_KEY_ID"),
      secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function listKeys(client: S3Client, bucket: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) if (o.Key) keys.add(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function uploadMissing(
  client: S3Client,
  bucket: string,
  files: Map<string, Buffer>,
  existing: Set<string>,
): Promise<string[]> {
  const todo = [...files.keys()].filter((k) => !existing.has(k)).sort();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const key = todo[next++];
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: files.get(key)!,
          ContentType: "image/avif",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return todo;
}
