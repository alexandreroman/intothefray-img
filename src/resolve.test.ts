import { describe, expect, it } from "vitest";
import { pickEnglish, pickFrench } from "./resolve.ts";

const B = (s: string) => Buffer.from(s);
const face = { code: "1a", landscape: false, cerebro: "c", record: "r", octgn: "g" };

describe("pickEnglish", () => {
  it("cerebro first", async () => {
    const r = await pickEnglish(face, new Map([["g", B("o")]]), async (u) => B(u));
    expect(r).toEqual({ bytes: B("c"), from: "cerebro" });
  });
  it("cerebro 404 falls to octgn", async () => {
    const r = await pickEnglish(face, new Map([["g", B("o")]]), async (u) => (u === "c" ? null : B(u)));
    expect(r?.from).toBe("octgn");
  });
  it("then record", async () => {
    const r = await pickEnglish(face, new Map(), async (u) => (u === "r" ? B("rec") : null));
    expect(r).toEqual({ bytes: B("rec"), from: "record" });
  });
  it("load failure rejects instead of falling back", async () => {
    const load = async (u: string) => {
      if (u === "c") throw new Error("HTTP 503");
      return B(u);
    };
    await expect(pickEnglish(face, new Map([["g", B("o")]]), load)).rejects.toThrow("HTTP 503");
  });
  it("all missing is null", async () => {
    expect(await pickEnglish({ code: "x", landscape: false }, new Map(), async () => null)).toBeNull();
  });
});

describe("pickFrench", () => {
  it("octgn fr or null", () => {
    expect(pickFrench(face, new Map([["g", B("f")]]))).toEqual({ bytes: B("f"), from: "octgn" });
    expect(pickFrench(face, new Map())).toBeNull();
    expect(pickFrench({ code: "x", landscape: false }, new Map())).toBeNull();
  });
});
