import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type DriveFile = { id: string; name: string; number: number };

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const numberOf = (name: string): number => {
  const m = /^(\d{3})\b/.exec(name);
  return m ? Number(m[1]) : 0;
};

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
    out.push({ id: m[1], name, number: numberOf(name) });
  }
  return out;
}

export function selectOfficial(files: DriveFile[]): DriveFile[] {
  return files
    .map((f) => ({ ...f, number: numberOf(f.name) }))
    .filter((f) => /^\d{3}\b/.test(f.name) && f.number < 997 && !f.name.includes(" - FM - "))
    .sort((a, b) => a.number - b.number);
}

export async function fetchPack(
  file: DriveFile,
  cacheDir: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const path = join(cacheDir, `${file.id}.o8c`);
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
