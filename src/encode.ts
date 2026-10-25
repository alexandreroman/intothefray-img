import { createHash } from "node:crypto";
import sharp from "sharp";

export const SETTINGS_VERSION = "avif-q55-e6-s600-v1";
const MAX_SHORT_EDGE = 600;

/** Width and height of an image once its EXIF orientation is applied. */
async function orientedSize(input: Buffer): Promise<{ width: number; height: number }> {
  const { autoOrient } = await sharp(input).metadata();
  return autoOrient;
}

/** Whether the image, once its EXIF orientation is applied, is wider than tall. */
export async function isLandscape(input: Buffer): Promise<boolean> {
  const { width, height } = await orientedSize(input);
  return width > height;
}

export async function normalize(input: Buffer, landscape: boolean): Promise<Buffer> {
  let { width, height } = await orientedSize(input);
  // A single pipeline: no intermediate re-encode before the AVIF output.
  let img = sharp(input).autoOrient();
  if (landscape && height > width) {
    img = img.rotate(90);
    [width, height] = [height, width];
  }
  const short = Math.min(width, height);
  if (short > MAX_SHORT_EDGE) {
    const scale = MAX_SHORT_EDGE / short;
    img = img.resize(Math.round(width * scale), Math.round(height * scale), { fit: "fill" });
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
