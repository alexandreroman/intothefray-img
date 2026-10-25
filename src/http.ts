import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UA = "intothefray-img (+https://github.com/alexandreroman/intothefray)";
const MAX_IN_FLIGHT = 8;

let active = 0;
const waiting: Array<() => void> = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export async function fetchImage(
  url: string,
  cacheDir: string,
  fetchFn: typeof fetch,
): Promise<Buffer | null> {
  const path = join(cacheDir, createHash("sha256").update(url).digest("hex"));
  try {
    return await readFile(path);
  } catch {}
  const bytes = await limited(async () => {
    const res = await fetchFn(url, { headers: { "User-Agent": UA } });
    if (res.status !== 200 || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      await res.body?.cancel();
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  });
  if (!bytes) return null;
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path + ".tmp", bytes);
  await rename(path + ".tmp", path);
  return bytes;
}
