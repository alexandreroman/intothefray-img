import { describe, expect, it } from "vitest";
import type { Manifest, SourceFace } from "./types.ts";

const sourcesExample = `{
  "version": 1,
  "faces": [
    {"code": "12001a", "landscape": false,
     "cerebro": "https://pub-d27e…r2.dev/cerebro-cards/official/12001A.jpg",
     "record": "https://marvelcdb.com/bundles/cards/12001a.png",
     "octgn": "b768a53b-cb8c-47c5-9b65-f20ed2d89837"},
    {"code": "12001b", "landscape": false, "cerebro": "…/12001B.jpg",
     "record": "…/12001b.png",
     "octgn": "b768a53b-cb8c-47c5-9b65-f20ed2d89837.b"}
  ]
}`;

describe("types", () => {
  it("parses the spec sources.json example", () => {
    const sources = JSON.parse(sourcesExample) as {
      version: number;
      faces: SourceFace[];
    };
    expect(sources.version).toBe(1);
    expect(sources.faces).toHaveLength(2);
    expect(sources.faces[0]).toEqual({
      code: "12001a",
      landscape: false,
      cerebro: "https://pub-d27e…r2.dev/cerebro-cards/official/12001A.jpg",
      record: "https://marvelcdb.com/bundles/cards/12001a.png",
      octgn: "b768a53b-cb8c-47c5-9b65-f20ed2d89837",
    });
    expect(sources.faces[1].octgn).toBe(
      "b768a53b-cb8c-47c5-9b65-f20ed2d89837.b",
    );

    const manifest: Manifest = {
      version: 1,
      base: "https://img.intothefray.xyz/",
      faces: {
        "12001a": {
          en: { key: "en/12001a.3f9ac2e1b0d4.avif", from: "cerebro" },
          fr: { key: "fr/12001a.9b1d07c4e2aa.avif", from: "octgn" },
        },
      },
      assets: { "back-player": "assets/back-player.avif" },
    };
    expect(manifest.faces["12001a"].en?.from).toBe("cerebro");
  });
});
