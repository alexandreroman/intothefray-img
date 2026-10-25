import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DriveFile } from "./drive.ts";
import { formatReport, runPublish, type Deps } from "./publish.ts";
import type { SourceFace } from "./types.ts";

// Fakes mirror the producers' e.g. examples; SUPERLITE_REAL is not wired
// because the producers are exercised by their own tests.
let appDir = "", cacheDir = "", normalizeCalls = 0, uploads: Map<string, string>[] = [];
const face = (code: string, extra: Partial<SourceFace> = {}): SourceFace => ({ code, landscape: false, ...extra });

function fakes(over: Partial<Deps> = {}, packs: Record<string, Record<string, string>> = {}): Deps {
  const files: DriveFile[] = Object.keys(packs).map((n) => ({ id: n, name: `${n} - x.o8c`, number: Number(n) }));
  return {
    fetchText: async () => "html",
    parseListing: () => files,
    selectOfficial: (f) => [...f].sort((a, b) => a.number - b.number),
    fetchPack: async (f) => f.id,
    readImages: async (zip) => new Map(Object.entries(packs[zip] ?? {}).map(([k, v]) => [k, Buffer.from(v)])),
    normalize: async (b) => { normalizeCalls++; return Buffer.from("avif:" + b.toString()); },
    isLandscape: async () => false,
    keyOf: (lang, code, avif) => `${lang}/${code}.${avif.toString().length}.avif`,
    pickEnglish: async (f, en) => {
      const b = en.get(f.octgn ?? "");
      return b ? { bytes: b, from: "octgn" } : null;
    },
    pickFrench: () => null,
    fetchImage: async (u) => Buffer.from("img:" + u),
    listKeys: async () => new Set(),
    uploadMissing: async (_c, _b, f, ex) => { uploads.push(f); return [...f.keys()].filter((k) => !ex.has(k)); },
    ...over,
  };
}
const opts = () => ({
  appDir, cacheDir, client: {} as never, bucket: "b",
  assets: { "back-player": "http://a/p.jpg", "first-player": "http://a/t.png" },
});
const manifestPath = () => join(appDir, "packs/images/manifest.json");
const writeSources = (sources: unknown) =>
  writeFile(join(appDir, "packs/images/sources.json"), JSON.stringify(sources));

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "pub-"));
  appDir = join(root, "app"); cacheDir = join(root, "cache");
  await mkdir(join(appDir, "packs/images"), { recursive: true });
  await writeSources({ version: 1, faces: [face("001", { octgn: "g1" })] });
  normalizeCalls = 0; uploads = [];
});

describe("publish", () => {
  it("errata wins", async () => {
    await runPublish(fakes({}, { "001": { g1: "first" }, "990": { g1: "errata" } }), opts());
    const m = JSON.parse(await readFile(manifestPath(), "utf8"));
    expect(m.faces["001"].en.key).toBe("en/001." + "avif:errata".length + ".avif");
    const path = uploads[0]!.get(m.faces["001"].en.key)!;
    expect(await readFile(path, "utf8")).toBe("avif:errata");
  });

  it("uploads AVIF files from the encode cache", async () => {
    await runPublish(fakes({}, { "001": { g1: "x" } }), opts());
    for (const path of uploads[0]!.values()) expect(path.startsWith(join(cacheDir, "avif"))).toBe(true);
  });

  it("manifest is written last", async () => {
    await writeFile(manifestPath(), "OLD");
    const d = fakes({ uploadMissing: async () => { throw new Error("boom"); } }, { "001": { g1: "x" } });
    await expect(runPublish(d, opts())).rejects.toThrow("boom");
    expect(await readFile(manifestPath(), "utf8")).toBe("OLD");
  });

  it("rerun encodes nothing", async () => {
    const d = fakes({}, { "001": { g1: "x" } });
    await runPublish(d, opts());
    const first = normalizeCalls;
    expect(first).toBe(3);
    const r = await runPublish(d, opts());
    expect(normalizeCalls).toBe(first);
    expect(r.encoded).toBe(0);
  });

  it("assets listed", async () => {
    await runPublish(fakes({}, { "001": { g1: "x" } }), opts());
    const text = await readFile(manifestPath(), "utf8");
    const m = JSON.parse(text);
    expect(m.assets).toEqual({ "back-player": "assets/back-player.avif", "first-player": "assets/first-player.avif" });
    expect(uploads[0]!.has("assets/back-player.avif")).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "base"');
  });

  it("a language without official packs fails before writing the manifest", async () => {
    await writeFile(manifestPath(), "OLD");
    const d = fakes({ selectOfficial: () => [] }, { "001": { g1: "x" } });
    await expect(runPublish(d, opts())).rejects.toThrow("no official en pack");
    expect(await readFile(manifestPath(), "utf8")).toBe("OLD");
  });

  it("rejects a sources.json version other than 1", async () => {
    await writeSources({ version: 2, faces: [] });
    await expect(runPublish(fakes({}, { "001": { g1: "x" } }), opts())).rejects.toThrow("unsupported version 2");
  });

  it("reports a portrait face with a landscape image", async () => {
    const faces = [face("001", { octgn: "g1" }), face("002", { octgn: "g2", landscape: true })];
    await writeSources({ version: 1, faces });
    const d = fakes({ isLandscape: async () => true }, { "001": { g1: "x", g2: "y" } });
    const r = await runPublish(d, opts());
    expect(r.landscapeOnPortrait).toEqual(["en/001"]);
  });

  it("counts sources per language", async () => {
    const d = fakes({ pickFrench: (f, fr) => ({ bytes: fr.get(f.octgn!)!, from: "octgn" }) }, { "001": { g1: "x" } });
    d.pickEnglish = async () => ({ bytes: Buffer.from("c"), from: "cerebro" });
    const r = await runPublish(d, opts());
    expect(r.from).toEqual({ en: { cerebro: 1 }, fr: { octgn: 1 } });
  });

  it("encodes faces concurrently, with a bounded pool and a sorted manifest", async () => {
    const codes = ["006", "002", "005", "001", "004", "003"];
    await writeSources({ version: 1, faces: codes.map((c) => face(c, { octgn: "g" + c })) });
    const pack = Object.fromEntries(codes.map((c) => ["g" + c, c]));
    let active = 0, peak = 0;
    const d = fakes({
      normalize: async (b) => {
        active++; peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, b[b.length - 1]! % 3));
        active--;
        return Buffer.from("avif:" + b.toString());
      },
      // No English for two faces, to check the report keeps the sources order.
      pickEnglish: async (f, en) =>
        f.code === "005" || f.code === "001" ? null : { bytes: en.get(f.octgn!)!, from: "octgn" },
    }, { "001": pack });
    const r = await runPublish(d, opts());
    expect(peak).toBe(4);
    expect(r.noEnglish).toEqual(["005", "001"]);
    const m = JSON.parse(await readFile(manifestPath(), "utf8"));
    expect(Object.keys(m.faces)).toEqual(["002", "003", "004", "006"]);
  });
});

describe("report", () => {
  it("groups french gaps by pack and lists the rest", () => {
    const lines = formatReport({
      faces: { en: 5, fr: 2 }, from: { en: { octgn: 2, cerebro: 3 }, fr: { octgn: 2 } },
      frenchGaps: ["12001a", "12001b", "01097b"], noEnglish: ["62001a"],
      landscapeOnPortrait: ["en/40001a", "fr/40001a"],
      uploaded: ["k"], encoded: 0,
    }, 9);
    expect(lines).toEqual([
      "faces: en 5, fr 2",
      "en from cerebro: 3",
      "en from octgn: 2",
      "fr from octgn: 2",
      "french gaps: 3",
      "  pack 01: 1",
      "  pack 12: 2",
      "no english image: 1 (62001a)",
      "landscape image on portrait face: 2 (en/40001a, fr/40001a)",
      "uploaded: 1 of 9 keys",
    ]);
  });

  it("prints zero counts without a list", () => {
    const lines = formatReport({
      faces: { en: 0, fr: 0 }, from: { en: {}, fr: {} }, frenchGaps: [], noEnglish: [],
      landscapeOnPortrait: [], uploaded: [], encoded: 0,
    }, 0);
    expect(lines).toContain("no english image: 0");
    expect(lines).toContain("landscape image on portrait face: 0");
  });
});
