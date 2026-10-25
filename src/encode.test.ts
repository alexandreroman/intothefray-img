import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isLandscape, keyOf, normalize } from "./encode.ts";

function solid(w: number, h: number, rgb: [number, number, number]) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } });
}

async function jpeg(w: number, h: number): Promise<Buffer> {
  return solid(w, h, [200, 50, 50]).jpeg().toBuffer();
}

describe("normalize", () => {
  it("short edge capped", async () => {
    const out = await sharp(await normalize(await jpeg(710, 1030), false)).metadata();
    expect([out.format, out.width, out.height]).toEqual(["heif", 600, 870]);
  });

  it("no enlargement", async () => {
    const out = await sharp(await normalize(await jpeg(300, 419), false)).metadata();
    expect([out.width, out.height]).toEqual([300, 419]);
  });

  it("portrait image into landscape face turns", async () => {
    const out = await sharp(await normalize(await jpeg(492, 699), true)).metadata();
    expect([out.width, out.height]).toEqual([699, 492]);
  });

  it("landscape into portrait turns counter-clockwise", async () => {
    // left half red, right half blue: top-right (blue) must land top-left
    const left = await solid(300, 400, [255, 0, 0]).png().toBuffer();
    const right = await solid(300, 400, [0, 0, 255]).png().toBuffer();
    const src = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#000" } })
      .composite([{ input: left, top: 0, left: 0 }, { input: right, top: 0, left: 300 }])
      .png()
      .toBuffer();
    const avif = await normalize(src, false);
    const meta = await sharp(avif).metadata();
    expect([meta.width, meta.height]).toEqual([400, 600]);
    const { data } = await sharp(avif).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(150); // top-left blue
    expect(data[0]).toBeLessThan(100);
    const last = data.length - 3; // bottom-right is red
    expect(data[last]).toBeGreaterThan(150);
    expect(data[last + 2]).toBeLessThan(100);
  });

  it("portrait into landscape turns clockwise", async () => {
    // top half red, bottom half blue: bottom-left (blue) must land top-left
    const top = await solid(400, 300, [255, 0, 0]).png().toBuffer();
    const bottom = await solid(400, 300, [0, 0, 255]).png().toBuffer();
    const src = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#000" } })
      .composite([{ input: top, top: 0, left: 0 }, { input: bottom, top: 300, left: 0 }])
      .png()
      .toBuffer();
    const avif = await normalize(src, true);
    const meta = await sharp(avif).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]);
    const { data } = await sharp(avif).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(150); // top-left blue
    expect(data[0]).toBeLessThan(100);
    const last = data.length - 3; // bottom-right is red
    expect(data[last]).toBeGreaterThan(150);
    expect(data[last + 2]).toBeLessThan(100);
  });

  it("portrait into landscape turns, then caps the short edge", async () => {
    const out = await sharp(await normalize(await jpeg(700, 1000), true)).metadata();
    expect([out.width, out.height]).toEqual([857, 600]);
  });

  it("EXIF orientation applies before the landscape turn", async () => {
    // Stored 300x200, displayed 200x300: a portrait image for a landscape face.
    const turned = await solid(300, 200, [1, 2, 3]).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await sharp(await normalize(turned, true)).metadata();
    expect([out.width, out.height]).toEqual([300, 200]);
    const kept = await sharp(await normalize(turned, false)).metadata();
    expect([kept.width, kept.height]).toEqual([200, 300]);
  });

  it("CMYK fixture becomes sRGB", async () => {
    const cmyk = await solid(200, 300, [200, 50, 50]).toColourspace("cmyk").jpeg().toBuffer();
    const inMeta = await sharp(cmyk).metadata();
    expect(inMeta.space).toBe("cmyk");
    expect(inMeta.icc).toBeUndefined();
    const avif = await normalize(cmyk, false);
    const meta = await sharp(avif).metadata();
    expect(meta.space).toBe("srgb");
    const { data } = await sharp(avif).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(data[1]);
  });

  it("strips metadata", async () => {
    const withExif = await solid(100, 100, [1, 2, 3]).withExif({ IFD0: { Copyright: "x" } }).jpeg().toBuffer();
    const meta = await sharp(await normalize(withExif, false)).metadata();
    expect(meta.exif).toBeUndefined();
  });
});

describe("isLandscape", () => {
  it("compares the oriented width and height", async () => {
    expect(await isLandscape(await jpeg(699, 492))).toBe(true);
    expect(await isLandscape(await jpeg(492, 699))).toBe(false);
  });

  it("applies the EXIF orientation", async () => {
    const turned = await solid(300, 200, [1, 2, 3]).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(await isLandscape(turned)).toBe(false);
  });
});

describe("keyOf", () => {
  it("hashes the avif bytes", () => {
    expect(keyOf("en", "12001a", Buffer.from("x"))).toBe("cards/en/12001a.2d711642b726.avif");
  });
});
