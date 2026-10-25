import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchImage } from "./http.ts";

const UA = "intothefray-img (+https://github.com/alexandreroman/intothefray)";
const resp = (body: string, type: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": type } });
const dir = () => mkdtemp(join(tmpdir(), "http-"));

describe("fetchImage", () => {
  it("text/html 200 is not an image", async () => {
    const f = (async () => resp("<html>", "text/html")) as typeof fetch;
    expect(await fetchImage("http://x/a.jpg", await dir(), f)).toBeNull();
  });
  it("404 is null", async () => {
    const f = (async () => resp("no", "image/jpeg", 404)) as typeof fetch;
    expect(await fetchImage("http://x/b.jpg", await dir(), f)).toBeNull();
  });
  it("403 and 410 are null", async () => {
    for (const status of [403, 410]) {
      const f = (async () => resp("no", "text/html", status)) as typeof fetch;
      expect(await fetchImage(`http://x/${status}.jpg`, await dir(), f)).toBeNull();
    }
  });
  it("429 and 5xx retry, then load", async () => {
    const answers = [resp("slow", "text/plain", 429), resp("down", "text/plain", 503), resp("img", "image/jpeg")];
    let n = 0;
    const f = (async () => answers[n++]) as typeof fetch;
    const b = await fetchImage("http://x/retry.jpg", await dir(), f, [0, 0, 0]);
    expect(b?.toString()).toBe("img");
    expect(n).toBe(3);
  });
  it("persistent 5xx throws instead of returning null", async () => {
    let n = 0;
    const f = (async () => (n++, resp("down", "text/plain", 502))) as typeof fetch;
    await expect(fetchImage("http://x/down.jpg", await dir(), f, [0, 0])).rejects.toThrow("HTTP 502 after 3 attempts");
    expect(n).toBe(3);
  });
  it("other errors throw", async () => {
    const f = (async () => resp("no", "text/plain", 401)) as typeof fetch;
    await expect(fetchImage("http://x/auth.jpg", await dir(), f)).rejects.toThrow("HTTP 401");
  });
  it("UA sent", async () => {
    let ua: string | null = null;
    const f = (async (_u: unknown, init?: RequestInit) => {
      ua = new Headers(init?.headers).get("user-agent");
      return resp("img", "image/jpeg");
    }) as typeof fetch;
    const b = await fetchImage("http://x/c.jpg", await dir(), f);
    expect(ua).toBe(UA);
    expect(b?.toString()).toBe("img");
  });
  it("cache hit makes no request", async () => {
    const d = await dir();
    let n = 0;
    const f = (async () => (n++, resp("img", "image/png"))) as typeof fetch;
    await fetchImage("http://x/d.png", d, f);
    expect((await fetchImage("http://x/d.png", d, f))?.toString()).toBe("img");
    expect(n).toBe(1);
  });
  it("at most 8 in flight", async () => {
    const d = await dir();
    let cur = 0, max = 0;
    const f = (async () => {
      cur++; max = Math.max(max, cur);
      await new Promise((r) => setTimeout(r, 5));
      cur--;
      return resp("i", "image/jpeg");
    }) as typeof fetch;
    await Promise.all(Array.from({ length: 30 }, (_, i) => fetchImage(`http://x/${i}.jpg`, d, f)));
    expect(max).toBe(8);
  });
});
