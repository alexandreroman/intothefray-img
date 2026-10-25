import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const UA = "intothefray-img (+https://github.com/alexandreroman/intothefray)";
const MAX_IN_FLIGHT = 8;
/** Waits between attempts on a 429 or 5xx answer; one more attempt than delays. */
export const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];
/** Answers that mean the source has no image, so the next source is tried. */
const NOT_FOUND = new Set([403, 404, 410]);

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

type Attempt =
  | { outcome: "image"; bytes: Buffer }
  | { outcome: "absent" }
  | { outcome: "retry"; status: number };

async function attempt(url: string, fetchFn: typeof fetch): Promise<Attempt> {
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  const isImage = (res.headers.get("content-type") ?? "").startsWith("image/");
  if (res.status === 200 && isImage) {
    return { outcome: "image", bytes: Buffer.from(await res.arrayBuffer()) };
  }
  await res.body?.cancel();
  if (res.status === 200 || NOT_FOUND.has(res.status)) return { outcome: "absent" };
  if (res.status === 429 || res.status >= 500) return { outcome: "retry", status: res.status };
  throw new Error(`GET ${url}: HTTP ${res.status}`);
}

/**
 * Downloads an image, cached by URL hash. Returns null when the source has no image
 * (403, 404, 410, or a 200 that is not an image). Retries 429 and 5xx answers, then throws,
 * so a transient failure never silently falls back to another source.
 */
export async function fetchImage(
  url: string,
  cacheDir: string,
  fetchFn: typeof fetch,
  retryDelaysMs: readonly number[] = RETRY_DELAYS_MS,
): Promise<Buffer | null> {
  const path = join(cacheDir, createHash("sha256").update(url).digest("hex"));
  try {
    return await readFile(path);
  } catch {}
  for (let tries = 1; ; tries++) {
    // The limiter covers each attempt only, so a backoff wait does not hold a download slot.
    const result = await limited(() => attempt(url, fetchFn));
    if (result.outcome === "absent") return null;
    if (result.outcome === "image") {
      await mkdir(cacheDir, { recursive: true });
      // A unique temporary name: concurrent faces may download the same URL.
      const tmp = `${path}.${randomUUID()}.tmp`;
      await writeFile(tmp, result.bytes);
      await rename(tmp, path);
      return result.bytes;
    }
    const delay = retryDelaysMs[tries - 1];
    if (delay === undefined) {
      throw new Error(`GET ${url}: HTTP ${result.status} after ${tries} attempts`);
    }
    await sleep(delay);
  }
}
