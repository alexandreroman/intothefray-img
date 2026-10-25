import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { SourceFace } from "./types.ts";

export type DriveFile = { id: string; name: string; number: number };
type Picked = { bytes: Buffer; from: string };
import type { S3Client } from "@aws-sdk/client-s3";
type S3ClientLike = S3Client;

export type Deps = {
  fetchText: (url: string) => Promise<string>;
  parseListing: (html: string) => DriveFile[];
  selectOfficial: (files: DriveFile[]) => DriveFile[];
  fetchPack: (file: DriveFile, cacheDir: string) => Promise<string>;
  readImages: (zipPath: string) => Promise<Map<string, Buffer>>;
  normalize: (input: Buffer, landscape: boolean) => Promise<Buffer>;
  keyOf: (lang: string, code: string, avif: Buffer) => string;
  pickEnglish: (
    face: SourceFace,
    octgnEn: Map<string, Buffer>,
    load: (url: string) => Promise<Buffer | null>,
  ) => Promise<Picked | null>;
  pickFrench: (face: SourceFace, octgnFr: Map<string, Buffer>) => Picked | null;
  fetchImage: (url: string, cacheDir: string) => Promise<Buffer | null>;
  listKeys: (client: S3ClientLike, bucket: string) => Promise<Set<string>>;
  uploadMissing: (
    client: S3ClientLike,
    bucket: string,
    files: Map<string, Buffer>,
    existing: Set<string>,
  ) => Promise<string[]>;
};

export type Opts = {
  appDir: string;
  cacheDir: string;
  client: S3ClientLike;
  bucket: string;
  drive?: { en: string; fr: string };
  assets?: Record<string, string>;
  log?: (line: string) => void;
};

export const SETTINGS_VERSION = "avif-q55-e6-600-v1";
const DRIVE_EN = "1tp3ue360TCW9fSlfdiJole0hBCDAkQB6";
const DRIVE_FR = "1Bjn1_GnHFpQ2LvgXXgq106dy824REEvv";
const listingUrl = (id: string) => `https://drive.google.com/embeddedfolderview?id=${id}`;
const CEREBRO = "https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/";
export const DEFAULT_ASSETS: Record<string, string> = {
  "back-player": CEREBRO + "HeroBack.jpg",
  "back-encounter": CEREBRO + "EncounterBack.jpg",
  "back-villain": CEREBRO + "VillainBack.jpg",
  "first-player": "https://card-table.app/images/table/first_player_token_marvelchampions.png",
};

export type Report = {
  faces: { en: number; fr: number };
  from: Record<string, number>;
  frenchGaps: string[];
  noEnglish: string[];
  uploaded: string[];
  encoded: number;
};

async function loadPacks(deps: Deps, folder: string, cacheDir: string): Promise<Map<string, Buffer>> {
  const files = deps.selectOfficial(deps.parseListing(await deps.fetchText(listingUrl(folder))));
  const merged = new Map<string, Buffer>();
  for (const f of [...files].sort((a, b) => a.number - b.number)) {
    const zip = await deps.fetchPack(f, join(cacheDir, "o8c"));
    for (const [k, v] of await deps.readImages(zip)) merged.set(k, v); // later packs win
  }
  return merged;
}

export function packOf(code: string): string {
  return code.replace(/\d{3}[a-z]*$/i, "");
}

export function formatReport(r: Report, total: number): string[] {
  const lines = [`faces: en ${r.faces.en}, fr ${r.faces.fr}`];
  for (const k of Object.keys(r.from).sort()) lines.push(`from ${k}: ${r.from[k]}`);
  const gaps = new Map<string, number>();
  for (const c of r.frenchGaps) gaps.set(packOf(c), (gaps.get(packOf(c)) ?? 0) + 1);
  lines.push(`french gaps: ${r.frenchGaps.length}`);
  for (const p of [...gaps.keys()].sort()) lines.push(`  pack ${p}: ${gaps.get(p)}`);
  lines.push(`no english image: ${r.noEnglish.length}${r.noEnglish.length ? " (" + r.noEnglish.join(", ") + ")" : ""}`);
  lines.push(`uploaded: ${r.uploaded.length} of ${total} keys`);
  return lines;
}

export async function runPublish(deps: Deps, opts: Opts): Promise<Report> {
  const log = opts.log ?? (() => {});
  const sourcesPath = join(opts.appDir, "packs/images/sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8")) as { faces: SourceFace[] };
  const drive = opts.drive ?? { en: DRIVE_EN, fr: DRIVE_FR };
  const [octgnEn, octgnFr] = [
    await loadPacks(deps, drive.en, opts.cacheDir),
    await loadPacks(deps, drive.fr, opts.cacheDir),
  ];
  const httpDir = join(opts.cacheDir, "http");
  const avifDir = join(opts.cacheDir, "avif");
  await mkdir(avifDir, { recursive: true });
  const report: Report = { faces: { en: 0, fr: 0 }, from: {}, frenchGaps: [], noEnglish: [], uploaded: [], encoded: 0 };

  const encode = async (bytes: Buffer, landscape: boolean): Promise<Buffer> => {
    const h = createHash("sha256").update(bytes).update(`|${landscape}|${SETTINGS_VERSION}`).digest("hex");
    const p = join(avifDir, `${h}.avif`);
    if (existsSync(p)) return readFile(p);
    const out = await deps.normalize(bytes, landscape);
    await writeFile(p + ".tmp", out);
    await rename(p + ".tmp", p);
    report.encoded++;
    return out;
  };

  const files = new Map<string, Buffer>();
  const faces: Record<string, Record<string, { key: string; from: string }>> = {};
  const load = (url: string) => deps.fetchImage(url, httpDir);
  for (const face of sources.faces) {
    const entry: Record<string, { key: string; from: string }> = {};
    const en = await deps.pickEnglish(face, octgnEn, load);
    if (en) {
      const avif = await encode(en.bytes, face.landscape);
      const key = deps.keyOf("en", face.code, avif);
      files.set(key, avif);
      entry.en = { key, from: en.from };
      report.faces.en++;
      report.from[en.from] = (report.from[en.from] ?? 0) + 1;
    } else {
      report.noEnglish.push(face.code);
    }
    const fr = deps.pickFrench(face, octgnFr);
    if (fr) {
      const avif = await encode(fr.bytes, face.landscape);
      const key = deps.keyOf("fr", face.code, avif);
      files.set(key, avif);
      entry.fr = { key, from: fr.from };
      report.faces.fr++;
      report.from[fr.from] = (report.from[fr.from] ?? 0) + 1;
    } else {
      report.frenchGaps.push(face.code);
    }
    if (entry.en || entry.fr) faces[face.code] = entry;
  }

  const assets: Record<string, string> = {};
  for (const [name, url] of Object.entries(opts.assets ?? DEFAULT_ASSETS)) {
    const bytes = await deps.fetchImage(url, httpDir);
    if (!bytes) throw new Error(`asset ${name} not loadable: ${url}`);
    const avif = await encode(bytes, false);
    const key = `assets/${name}.avif`;
    files.set(key, avif);
    assets[name] = key;
  }

  const existing = await deps.listKeys(opts.client, opts.bucket);
  report.uploaded = await deps.uploadMissing(opts.client, opts.bucket, files, existing);

  // Manifest last: a failed upload above throws before this point.
  const sortObj = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const manifest = {
    version: 1,
    base: "https://img.intothefray.xyz/",
    faces: sortObj(Object.fromEntries(Object.entries(faces).map(([c, e]) => [c, sortObj(e)]))),
    assets: sortObj(assets),
  };
  const dest = join(opts.appDir, "packs/images/manifest.json");
  await writeFile(dest + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
  await rename(dest + ".tmp", dest);

  for (const line of formatReport(report, files.size)) log(line);
  return report;
}

async function loadEnv(): Promise<void> {
  try {
    for (const line of (await readFile(".env", "utf8")).split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

async function main(): Promise<void> {
  await loadEnv();
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env ${k}`);
    return v;
  };
  const [{ S3Client }, drive, o8c, encode, resolve, http, r2] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("./drive.ts"),
    import("./o8c.ts"),
    import("./encode.ts"),
    import("./resolve.ts"),
    import("./http.ts"),
    import("./r2.ts"),
  ]);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: need("R2_ACCESS_KEY_ID"), secretAccessKey: need("R2_SECRET_ACCESS_KEY") },
  });
  const deps: Deps = {
    fetchText: async (u) => (await fetch(u)).text(),
    parseListing: drive.parseListing,
    selectOfficial: drive.selectOfficial,
    fetchPack: (f, dir) => drive.fetchPack(f, dir, fetch),
    readImages: o8c.readImages,
    normalize: encode.normalize,
    keyOf: encode.keyOf,
    pickEnglish: resolve.pickEnglish,
    pickFrench: resolve.pickFrench,
    fetchImage: (u, dir) => http.fetchImage(u, dir, fetch),
    listKeys: r2.listKeys,
    uploadMissing: r2.uploadMissing,
  };
  const appDir = process.argv[2] ?? process.env.APP_DIR ?? "../../intothefray";
  await runPublish(deps, { appDir, cacheDir: ".cache", client, bucket: need("R2_BUCKET"), log: console.log });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
