import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { formatReport, runPublish, type Deps, type DriveFile } from "./publish.ts";

// Fakes mirror the producers' e.g. examples; SUPERLITE_REAL is not wired
// because the producers are exercised by their own tests.
let appDir = "", cacheDir = "", normalizeCalls = 0, uploads: Map<string, Buffer>[] = [];
const face = (code: string, extra = {}) => ({ code, landscape: false, ...extra });

function fakes(over: Partial<Deps> = {}, packs: Record<string, Record<string, string>> = {}): Deps {
  const files: DriveFile[] = Object.keys(packs).map((n) => ({ id: n, name: `${n} - x.o8c`, number: Number(n) }));
  return {
    fetchText: async () => "html",
    parseListing: () => files,
    selectOfficial: (f) => [...f].reverse(), // out of order on purpose
    fetchPack: async (f) => f.id,
    readImages: async (zip) => new Map(Object.entries(packs[zip] ?? {}).map(([k, v]) => [k, Buffer.from(v)])),
    normalize: async (b) => { normalizeCalls++; return Buffer.from("avif:" + b.toString()); },
    keyOf: (lang, code, avif) => `${lang}/${code}.${avif.toString().length}.avif`,
    pickEnglish: async (f, en) => {
      const b = en.get((f as any).octgn);
      return b ? { bytes: b, from: "octgn" } : null;
    },
    pickFrench: () => null,
    fetchImage: async (u) => Buffer.from("img:" + u),
    listKeys: async () => new Set(),
    uploadMissing: async (_c, _b, f, ex) => { uploads.push(f); return [...f.keys()].filter((k) => !ex.has(k)); },
    ...over,
  };
}
const opts = () => ({ appDir, cacheDir, client: {} as never, bucket: "b", assets: { "back-player": "http://a/p.jpg", "first-player": "http://a/t.png" } });
const manifestPath = () => join(appDir, "packs/images/manifest.json");

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "pub-"));
  appDir = join(root, "app"); cacheDir = join(root, "cache");
  await mkdir(join(appDir, "packs/images"), { recursive: true });
  await writeFile(join(appDir, "packs/images/sources.json"), JSON.stringify({ version: 1, faces: [face("001", { octgn: "g1" })] }));
  normalizeCalls = 0; uploads = [];
});

describe("publish", () => {
  it("errata wins", async () => {
    await runPublish(fakes({}, { "001": { g1: "first" }, "990": { g1: "errata" } }), opts());
    const m = JSON.parse(await readFile(manifestPath(), "utf8"));
    expect(m.faces["001"].en.key).toBe("en/001." + "avif:errata".length + ".avif");
    expect([...uploads[0].get(m.faces["001"].en.key)!.toString()].join("")).toBe("avif:errata");
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
    expect(uploads[0].has("assets/back-player.avif")).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "base"');
  });
});

describe("report", () => {
  it("groups french gaps by pack and lists the rest", () => {
    const lines = formatReport({
      faces: { en: 5, fr: 2 }, from: { cerebro: 3, octgn: 4 },
      frenchGaps: ["12001a", "12001b", "01097b"], noEnglish: ["62001a"],
      uploaded: ["k"], encoded: 0,
    }, 9);
    expect(lines).toEqual([
      "faces: en 5, fr 2",
      "from cerebro: 3",
      "from octgn: 4",
      "french gaps: 3",
      "  pack 01: 1",
      "  pack 12: 2",
      "no english image: 1 (62001a)",
      "uploaded: 1 of 9 keys",
    ]);
  });
});
