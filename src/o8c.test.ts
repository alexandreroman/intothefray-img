import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readImages } from "./o8c.ts";

const P = "055c536f-adba-4bc2-acbf-9aefb9756046/Sets/s1/Cards/";

function pack(entries: Record<string, string>): string {
  const files: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(entries)) files[k] = Buffer.from(v);
  const path = join(mkdtempSync(join(tmpdir(), "o8c-")), "p.o8c");
  writeFileSync(path, zipSync(files));
  return path;
}

describe("o8c.readImages", () => {
  it("maps stems, including alternates and png", async () => {
    const m = await readImages(
      pack({ [`${P}g1.jpg`]: "a", [`${P}g1.b.jpg`]: "b", [`${P}g2.b.png`]: "c" }),
    );
    expect([...m.keys()].sort()).toEqual(["g1", "g1.b", "g2.b"]);
    expect(m.get("g1.b")?.toString()).toBe("b");
  });

  it("Thumbs.db skipped", async () => {
    const m = await readImages(pack({ [`${P}Thumbs.db`]: "x", [`${P}g1.jpg`]: "a" }));
    expect([...m.keys()]).toEqual(["g1"]);
  });

  it("entries outside Cards ignored", async () => {
    const m = await readImages(
      pack({
        "root/Sets/s1/Other/x.jpg": "x",
        "root/Sets/s1/Cards/sub/y.jpg": "y",
        "x.jpg": "x",
        [`${P}g1.jpg`]: "a",
      }),
    );
    expect([...m.keys()]).toEqual(["g1"]);
  });
});
