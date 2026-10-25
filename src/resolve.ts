import type { SourceFace } from "./types.ts";

type Pick = { bytes: Buffer; from: string };

export async function pickEnglish(
  face: SourceFace,
  octgnEn: Map<string, Buffer>,
  load: (url: string) => Promise<Buffer | null>,
): Promise<Pick | null> {
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

export function pickFrench(face: SourceFace, octgnFr: Map<string, Buffer>): Pick | null {
  const o = face.octgn ? octgnFr.get(face.octgn) : undefined;
  return o ? { bytes: o, from: "octgn" } : null;
}
