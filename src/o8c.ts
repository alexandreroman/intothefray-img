import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const IMAGE = /(?:^|\/)Sets\/[^/]+\/Cards\/([^/]+)\.(?:jpe?g|png|webp)$/i;

/** Maps each card image stem of an `.o8c` pack to its bytes. Other entries are never inflated. */
export async function readImages(zipPath: string): Promise<Map<string, Buffer>> {
  const files = unzipSync(await readFile(zipPath), { filter: (file) => IMAGE.test(file.name) });
  const out = new Map<string, Buffer>();
  for (const [name, data] of Object.entries(files)) {
    const stem = IMAGE.exec(name)![1]!;
    // A view over the inflated bytes, not a copy.
    out.set(stem, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
  return out;
}
