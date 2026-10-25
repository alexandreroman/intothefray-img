import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { S3Client } from "@aws-sdk/client-s3";
import { fetchListing, fetchPack, packPath, parseListing, selectOfficial, type DriveFile } from "./drive.ts";
import { isLandscape, keyOf, normalize, SETTINGS_VERSION } from "./encode.ts";
import { fetchImage } from "./http.ts";
import { readImages } from "./o8c.ts";
import { createClient, listKeys, missingKeys, uploadMissing } from "./r2.ts";
import { pickEnglish, pickFrench, type Picked } from "./resolve.ts";
import type { Encoded, Manifest, SourceFace } from "./types.ts";

export type Deps = {
  fetchText: (url: string) => Promise<string>;
  parseListing: (html: string) => DriveFile[];
  selectOfficial: (files: DriveFile[]) => DriveFile[];
  fetchPack: (file: DriveFile, cacheDir: string) => Promise<string>;
  readImages: (zipPath: string) => Promise<Map<string, Buffer>>;
  normalize: (input: Buffer, landscape: boolean) => Promise<Buffer>;
  isLandscape: (input: Buffer) => Promise<boolean>;
  keyOf: (lang: string, code: string, avif: Buffer) => string;
  pickEnglish: (
    face: SourceFace,
    octgnEn: Map<string, Buffer>,
    load: (url: string) => Promise<Buffer | null>,
  ) => Promise<Picked | null>;
  pickFrench: (face: SourceFace, octgnFr: Map<string, Buffer>) => Picked | null;
  fetchImage: (url: string, cacheDir: string) => Promise<Buffer | null>;
  listKeys: (client: S3Client, bucket: string) => Promise<Set<string>>;
  /** `files` maps each key to the local path of its AVIF file. */
  uploadMissing: (
    client: S3Client,
    bucket: string,
    files: Map<string, string>,
    existing: Set<string>,
  ) => Promise<string[]>;
};

export type Opts = {
  appDir: string;
  cacheDir: string;
  client: S3Client;
  bucket: string;
  drive?: { en: string; fr: string };
  assets?: Record<string, string>;
  /** Runs everything but the uploads and the manifest write, and logs the keys to upload. */
  dryRun?: boolean;
  log?: (line: string) => void;
};

export type DownloadOpts = {
  cacheDir: string;
  langs: readonly Lang[];
  /** Only this pack number, downloaded again even when cached. Without it, every missing pack. */
  pack?: number;
  drive?: { en: string; fr: string };
  log?: (line: string) => void;
};

export type Lang = "en" | "fr";
const LANGS: readonly Lang[] = ["en", "fr"];

/** At most this many faces are resolved and encoded at once; http.ts caps downloads separately. */
const FACE_CONCURRENCY = 4;
const BASE_URL = "https://img.intothefray.xyz/";
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
  faces: Record<Lang, number>;
  from: Record<Lang, Record<string, number>>;
  frenchGaps: string[];
  noEnglish: string[];
  /** `<lang>/<code>` of each portrait face whose image is landscape (reported, not turned). */
  landscapeOnPortrait: string[];
  /** Keys the bucket lacks: uploaded by a real run, only listed by a dry run. */
  toUpload: string[];
  encoded: number;
};

/** One encoded image of a face, with its AVIF file in the encode cache. */
type FaceImage = Encoded & { path: string; landscapeOnPortrait: boolean };
type FaceResult = { code: string; en: FaceImage | null; fr: FaceImage | null };

async function readSources(appDir: string): Promise<SourceFace[]> {
  const path = join(appDir, "packs/images/sources.json");
  const sources = JSON.parse(await readFile(path, "utf8")) as { version?: unknown; faces: SourceFace[] };
  if (sources.version !== 1) {
    throw new Error(`${path}: unsupported version ${JSON.stringify(sources.version)}, expected 1`);
  }
  return sources.faces;
}

type DriveDeps = Pick<Deps, "fetchText" | "parseListing" | "selectOfficial" | "fetchPack">;

/** The official packs of a Drive folder, sorted by number. An empty listing throws. */
async function listPacks(deps: DriveDeps, lang: Lang, folder: string): Promise<DriveFile[]> {
  const files = deps.selectOfficial(deps.parseListing(await deps.fetchText(listingUrl(folder))));
  if (files.length === 0) {
    throw new Error(`no official ${lang} pack in Drive folder ${folder}: listing empty or unreadable`);
  }
  return files;
}

async function loadPacks(deps: Deps, lang: Lang, folder: string, cacheDir: string): Promise<Map<string, Buffer>> {
  const files = await listPacks(deps, lang, folder);
  const merged = new Map<string, Buffer>();
  // selectOfficial sorts by pack number, so a later pack (the 990 errata) overrides earlier ones.
  for (const file of files) {
    const zip = await deps.fetchPack(file, join(cacheDir, "o8c"));
    for (const [stem, bytes] of await deps.readImages(zip)) merged.set(stem, bytes);
  }
  return merged;
}

/** Calls `fn` on every item with at most `limit` calls in flight. Results keep the input order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sortByKey<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Downloads the official packs into the cache, without encoding or uploading. With `pack`, only
 * that pack number is fetched, its cache file evicted first so the download is fresh.
 */
export async function runDownload(deps: DriveDeps, opts: DownloadOpts): Promise<void> {
  const log = opts.log ?? (() => {});
  const drive = opts.drive ?? { en: DRIVE_EN, fr: DRIVE_FR };
  const packDir = join(opts.cacheDir, "o8c");
  // List every language first, so an unknown pack number fails before any download.
  const todo: Array<{ lang: Lang; file: DriveFile }> = [];
  for (const lang of opts.langs) {
    const files = await listPacks(deps, lang, drive[lang]);
    const selected = opts.pack === undefined ? files : files.filter((f) => f.number === opts.pack);
    if (opts.pack !== undefined && selected.length === 0) log(`${lang}: no official pack ${formatPack(opts.pack)}`);
    for (const file of selected) todo.push({ lang, file });
  }
  if (opts.pack !== undefined && todo.length === 0) {
    throw new Error(`pack ${formatPack(opts.pack)} is not an official ${opts.langs.join(" or ")} pack`);
  }
  let cached = 0;
  for (const { lang, file } of todo) {
    const path = packPath(file, packDir);
    if (opts.pack !== undefined) {
      await rm(path, { force: true });
    } else if (existsSync(path)) {
      cached++;
      continue;
    }
    await deps.fetchPack(file, packDir);
    log(`${lang}: downloaded ${file.name}`);
  }
  log(`downloaded: ${todo.length - cached}, already cached: ${cached}`);
}

const formatPack = (pack: number): string => String(pack).padStart(3, "0");

export function packOf(code: string): string {
  return code.replace(/\d{3}[a-z]*$/i, "");
}

export function formatReport(r: Report, total: number): string[] {
  const lines = [`faces: en ${r.faces.en}, fr ${r.faces.fr}`];
  for (const lang of LANGS) {
    const counts = r.from[lang];
    for (const source of Object.keys(counts).sort()) lines.push(`${lang} from ${source}: ${counts[source]}`);
  }
  const gaps = new Map<string, number>();
  for (const code of r.frenchGaps) gaps.set(packOf(code), (gaps.get(packOf(code)) ?? 0) + 1);
  lines.push(`french gaps: ${r.frenchGaps.length}`);
  for (const pack of [...gaps.keys()].sort()) lines.push(`  pack ${pack}: ${gaps.get(pack)}`);
  lines.push(`no english image: ${withList(r.noEnglish)}`);
  lines.push(`landscape image on portrait face: ${withList(r.landscapeOnPortrait)}`);
  const inBucket = total - r.toUpload.length;
  lines.push(`to upload: ${r.toUpload.length} of ${total} keys (${inBucket} already in the bucket)`);
  return lines;
}

function withList(items: string[]): string {
  return items.length === 0 ? "0" : `${items.length} (${items.join(", ")})`;
}

export async function runPublish(deps: Deps, opts: Opts): Promise<Report> {
  const log = opts.log ?? (() => {});
  const faces = await readSources(opts.appDir);
  const drive = opts.drive ?? { en: DRIVE_EN, fr: DRIVE_FR };
  const octgnEn = await loadPacks(deps, "en", drive.en, opts.cacheDir);
  const octgnFr = await loadPacks(deps, "fr", drive.fr, opts.cacheDir);
  const httpDir = join(opts.cacheDir, "http");
  const avifDir = join(opts.cacheDir, "avif");
  await mkdir(avifDir, { recursive: true });
  const report: Report = {
    faces: { en: 0, fr: 0 },
    from: { en: {}, fr: {} },
    frenchGaps: [],
    noEnglish: [],
    landscapeOnPortrait: [],
    toUpload: [],
    encoded: 0,
  };

  // Encoded files stay on disk: the cache holds the AVIF bytes, memory holds only their paths.
  // The in-flight map lets two faces with the same source share one encode.
  const encodes = new Map<string, Promise<string>>();
  const encodeToCache = async (hash: string, bytes: Buffer, landscape: boolean): Promise<string> => {
    const path = join(avifDir, `${hash}.avif`);
    if (existsSync(path)) return path;
    const avif = await deps.normalize(bytes, landscape);
    await writeFile(path + ".tmp", avif);
    await rename(path + ".tmp", path);
    report.encoded++;
    return path;
  };
  const encode = (bytes: Buffer, landscape: boolean): Promise<string> => {
    const hash = createHash("sha256").update(bytes).update(`|${landscape}|${SETTINGS_VERSION}`).digest("hex");
    let pending = encodes.get(hash);
    if (!pending) {
      pending = encodeToCache(hash, bytes, landscape);
      encodes.set(hash, pending);
    }
    return pending;
  };

  const encodeFace = async (lang: Lang, face: SourceFace, picked: Picked | null): Promise<FaceImage | null> => {
    if (!picked) return null;
    const path = await encode(picked.bytes, face.landscape);
    const key = deps.keyOf(lang, face.code, await readFile(path));
    const landscapeOnPortrait = !face.landscape && (await deps.isLandscape(picked.bytes));
    return { key, from: picked.from, path, landscapeOnPortrait };
  };

  const load = (url: string) => deps.fetchImage(url, httpDir);
  const results: FaceResult[] = await mapWithConcurrency(faces, FACE_CONCURRENCY, async (face) => ({
    code: face.code,
    en: await encodeFace("en", face, await deps.pickEnglish(face, octgnEn, load)),
    fr: await encodeFace("fr", face, deps.pickFrench(face, octgnFr)),
  }));

  // Folded in sources order, so the report does not depend on which face finished first.
  const files = new Map<string, string>();
  const manifestFaces: Manifest["faces"] = {};
  for (const result of results) {
    const entry: Manifest["faces"][string] = {};
    for (const lang of LANGS) {
      const image = result[lang];
      if (!image) continue;
      files.set(image.key, image.path);
      entry[lang] = { key: image.key, from: image.from };
      report.faces[lang]++;
      report.from[lang][image.from] = (report.from[lang][image.from] ?? 0) + 1;
      if (image.landscapeOnPortrait) report.landscapeOnPortrait.push(`${lang}/${result.code}`);
    }
    if (!result.en) report.noEnglish.push(result.code);
    if (!result.fr) report.frenchGaps.push(result.code);
    if (entry.en || entry.fr) manifestFaces[result.code] = entry;
  }

  const assets: Record<string, string> = {};
  for (const [name, url] of Object.entries(opts.assets ?? DEFAULT_ASSETS)) {
    const bytes = await deps.fetchImage(url, httpDir);
    if (!bytes) throw new Error(`asset ${name} not loadable: ${url}`);
    const key = `assets/${name}.avif`;
    files.set(key, await encode(bytes, false));
    assets[name] = key;
  }

  const existing = await deps.listKeys(opts.client, opts.bucket);
  report.toUpload = missingKeys(files.keys(), existing);
  if (opts.dryRun) {
    for (const line of formatReport(report, files.size)) log(line);
    for (const key of report.toUpload) log(`  would upload ${key}`);
    log("dry run: nothing uploaded, manifest not written");
    return report;
  }
  await deps.uploadMissing(opts.client, opts.bucket, files, existing);

  // Manifest last: a failed upload above throws before this point.
  const manifest: Manifest = {
    version: 1,
    base: BASE_URL,
    faces: sortByKey(manifestFaces),
    assets: sortByKey(assets),
  };
  const dest = join(opts.appDir, "packs/images/manifest.json");
  await writeFile(dest + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
  await rename(dest + ".tmp", dest);

  for (const line of formatReport(report, files.size)) log(line);
  return report;
}

const USAGE = `usage:
  node src/publish.ts [--app-dir <dir>] [--dry-run]
  node src/publish.ts --download [--pack <number>] [--lang en|fr]`;

function parseLangs(lang: string | undefined): Lang[] {
  if (lang === undefined) return ["en", "fr"];
  if (lang === "en" || lang === "fr") return [lang];
  throw new Error(`--lang must be en or fr, got "${lang}"\n${USAGE}`);
}

function parsePack(pack: string | undefined): number | undefined {
  if (pack === undefined) return undefined;
  if (!/^\d{1,3}$/.test(pack)) throw new Error(`--pack must be a pack number such as 060, got "${pack}"\n${USAGE}`);
  return Number(pack);
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      "app-dir": { type: "string" },
      "dry-run": { type: "boolean" },
      download: { type: "boolean" },
      pack: { type: "string" },
      lang: { type: "string" },
    },
  });
  // The single place .env is read; existing environment variables are not overridden.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const deps: Deps = {
    fetchText: (url) => fetchListing(url, fetch),
    parseListing,
    selectOfficial,
    fetchPack: (file, dir) => fetchPack(file, dir, fetch),
    readImages,
    normalize,
    isLandscape,
    keyOf,
    pickEnglish,
    pickFrench,
    fetchImage: (url, dir) => fetchImage(url, dir, fetch),
    listKeys,
    uploadMissing,
  };
  if (args.download) {
    const opts = { cacheDir: ".cache", langs: parseLangs(args.lang), pack: parsePack(args.pack), log: console.log };
    await runDownload(deps, opts);
    return;
  }
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("missing env R2_BUCKET");
  await runPublish(deps, {
    appDir: args["app-dir"] ?? process.env.APP_DIR ?? "../../intothefray",
    cacheDir: ".cache",
    client: createClient(process.env),
    bucket,
    dryRun: args["dry-run"],
    log: console.log,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
