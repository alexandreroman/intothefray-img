import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const IMAGE = /(?:^|\/)Sets\/[^/]+\/Cards\/([^/]+)\.(?:jpe?g|png|webp)$/i;

export async function readImages(zipPath: string): Promise<Map<string, Buffer>> {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  const out = new Map<string, Buffer>();
  for (const [name, data] of Object.entries(files)) {
    const m = IMAGE.exec(name);
    if (m) out.set(m[1], Buffer.from(data));
  }
  return out;
}
