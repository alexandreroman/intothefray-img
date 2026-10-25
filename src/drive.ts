import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A file of a Drive folder listing. */
export type DriveEntry = { id: string; name: string };

/** A Drive file with its pack number, the three digits that start its name. */
export type DriveFile = DriveEntry & { number: number };

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** The pack number that starts a file name ("060 - Fear No Evil.o8c" is 60), or undefined when there is none. */
function packNumber(name: string): number | undefined {
  const match = /^(\d{3})\b/.exec(name);
  return match ? Number(match[1]) : undefined;
}

const unescape = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

export function parseListing(html: string): DriveFile[] {
  const out: DriveFile[] = [];
  const re =
    /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const name = unescape(m[2]).trim();
    out.push({ id: m[1], name, number: packNumber(name) ?? 0 });
  }
  return out;
}

/** Fetches a Drive folder's embedded listing page. An HTTP error throws. */
export async function fetchListing(url: string, fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn(url);
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`drive listing ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Official packs sorted by number. The number is read from each name, so plain `{ id, name }` entries work.
 * Unnumbered names, numbers from 997 up and fan-made (" - FM - ") packs are left out.
 */
export function selectOfficial(files: DriveEntry[]): DriveFile[] {
  const official: DriveFile[] = [];
  for (const file of files) {
    const number = packNumber(file.name);
    if (number === undefined || number >= 997 || file.name.includes(" - FM - ")) continue;
    official.push({ ...file, number });
  }
  return official.sort((a, b) => a.number - b.number);
}

/** Where {@link fetchPack} caches a pack. */
export function packPath(file: DriveFile, cacheDir: string): string {
  return join(cacheDir, `${file.id}.o8c`);
}

export async function fetchPack(
  file: DriveFile,
  cacheDir: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const path = packPath(file, cacheDir);
  try {
    const cached = await readFile(path);
    if (cached.subarray(0, 4).equals(ZIP_MAGIC)) return path;
  } catch {
    // not cached
  }
  const url = `https://drive.usercontent.google.com/download?id=${file.id}&export=download&confirm=t`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`drive download ${file.name}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw new Error(`drive download ${file.name} (${file.id}) is not an .o8c (no zip magic)`);
  }
  await mkdir(cacheDir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, body);
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  return path;
}
