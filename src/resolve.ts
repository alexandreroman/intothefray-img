import type { Source, SourceFace } from "./types.ts";

export type Picked = { bytes: Buffer; from: Source };

/**
 * English is the first source that loads: Cerebro, the OCTGN EN scan, then the record.
 * A `load` failure (as opposed to null, "no image") rejects instead of falling back,
 * so a transient error never changes which source a face uses.
 */
export async function pickEnglish(
  face: SourceFace,
  octgnEn: Map<string, Buffer>,
  load: (url: string) => Promise<Buffer | null>,
): Promise<Picked | null> {
  if (face.cerebro) {
    const bytes = await load(face.cerebro);
    if (bytes) return { bytes, from: "cerebro" };
  }
  const o = face.octgn ? octgnEn.get(face.octgn) : undefined;
  if (o) return { bytes: o, from: "octgn" };
  if (face.record) {
    const bytes = await load(face.record);
    if (bytes) return { bytes, from: "record" };
  }
  return null;
}

export function pickFrench(face: SourceFace, octgnFr: Map<string, Buffer>): Picked | null {
  const o = face.octgn ? octgnFr.get(face.octgn) : undefined;
  return o ? { bytes: o, from: "octgn" } : null;
}
