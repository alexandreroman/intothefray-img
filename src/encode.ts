import { createHash } from "node:crypto";
import sharp from "sharp";

export const SETTINGS_VERSION = "avif-q55-e6-s600-v1";
const MAX_SHORT_EDGE = 600;

export async function normalize(input: Buffer, landscape: boolean): Promise<Buffer> {
  // Apply EXIF rotation first, then read the real orientation.
  const oriented = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;
  let img = sharp(oriented.data);
  let w = width;
  let h = height;
  if (landscape && h > w) {
    img = sharp(await img.rotate(90).toBuffer());
    [w, h] = [h, w];
  }
  const short = Math.min(w, h);
  if (short > MAX_SHORT_EDGE) {
    const scale = MAX_SHORT_EDGE / short;
    img = img.resize(Math.round(w * scale), Math.round(h * scale), { fit: "fill" });
  }
  return img
    .toColourspace("srgb")
    .avif({ quality: 55, effort: 6 })
    .toBuffer();
}

export function keyOf(lang: string, code: string, avif: Buffer): string {
  const hash = createHash("sha256").update(avif).digest("hex").slice(0, 12);
  return `${lang}/${code}.${hash}.avif`;
}
