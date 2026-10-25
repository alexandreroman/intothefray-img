import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchPack, parseListing, selectOfficial } from "./drive.ts";

const entry = (id: string, name: string) =>
  `<div class="flip-entry" id="entry-${id}" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/file/d/${id}/view?usp=drive_web" target="_blank"><div class="flip-entry-visual"></div><div class="flip-entry-title">${name}</div></a></div><div class="flip-entry-last-modified"><div>3/26/23</div></div></div>`;
const html = `<html><body><div class="flip-entries">${entry("1l6Yw_K-az", "001 - Core Set - dea583bf.o8c")}${entry("1_Hyo", "032 - Rise &amp; Fall.o8c.o8c")}${entry("1abc", "057 - X - fr.o8c")}</div></body></html>`;

const f = (id: string, name: string, number = 0) => ({ id, name, number });

describe("parseListing", () => {
  it("reads ids and names", () => {
    expect(parseListing(html)).toEqual([
      f("1l6Yw_K-az", "001 - Core Set - dea583bf.o8c", 1),
      f("1_Hyo", "032 - Rise & Fall.o8c.o8c", 32),
      f("1abc", "057 - X - fr.o8c", 57),
    ]);
  });
});

describe("selectOfficial", () => {
  it("keeps official packs sorted by number", () => {
    const out = selectOfficial([
      f("a", "060 - Fear No Evil - 2026-08-29.o8c"),
      f("b", "998 - FM - Angela (By Odysseus) - x.o8c"),
      f("c", "990 - Errata Pack ENG - 20240502.o8c"),
      f("d", "997 - Fan.o8c"),
      f("e", "FM - nothing.o8c"),
      f("g", "010 - A - FM - B.o8c"),
    ]);
    expect(out.map((x) => [x.id, x.number])).toEqual([["a", 60], ["c", 990]]);
  });
  it(".o8c.o8c name accepted", () => {
    const out = selectOfficial([f("x", "032 - Y - z.o8c.o8c"), f("y", "057 - Q - fr.o8c")]);
    expect(out.map((x) => x.number)).toEqual([32, 57]);
  });
});

const dir = () => mkdtemp(join(tmpdir(), "drive-"));
const resp = (b: Buffer) => new Response(new Uint8Array(b));

describe("fetchPack", () => {
  const zip = Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]);
  it("downloads, checks magic and caches", async () => {
    const d = await dir();
    const fn = vi.fn(async (_u: string) => resp(zip));
    const p = await fetchPack(f("id1", "a.o8c", 1), d, fn as unknown as typeof fetch);
    expect(p).toBe(join(d, "id1.o8c"));
    expect(await readFile(p)).toEqual(zip);
    expect(fn.mock.calls[0]![0]).toBe(
      "https://drive.usercontent.google.com/download?id=id1&export=download&confirm=t",
    );
  });
  it("cache hit makes no request", async () => {
    const d = await dir();
    const fn = vi.fn(async (_u: string) => resp(zip));
    await fetchPack(f("id1", "a.o8c", 1), d, fn as unknown as typeof fetch);
    await fetchPack(f("id1", "a.o8c", 1), d, fn as unknown as typeof fetch);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("skips non-zip download", async () => {
    const d = await dir();
    const fn = vi.fn(async () => resp(Buffer.from("<html>quota</html>")));
    await expect(fetchPack(f("id2", "a.o8c", 1), d, fn as unknown as typeof fetch)).rejects.toThrow("not an .o8c");
    expect(await readdir(d)).toEqual([]);
  });
  it("throws on http error", async () => {
    const d = await dir();
    const fn = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(fetchPack(f("id3", "a.o8c", 1), d, fn as unknown as typeof fetch)).rejects.toThrow("500");
  });
});
