import { describe, expect, it } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { createClient, listKeys, uploadMissing } from "./r2.ts";

type Cmd = { constructor: { name: string }; input: Record<string, unknown> };

function fake(handler: (c: Cmd) => unknown) {
  const calls: Cmd[] = [];
  const client = {
    send: async (c: Cmd) => {
      calls.push(c);
      return handler(c);
    },
  } as unknown as S3Client;
  return { client, calls };
}

describe("r2", () => {
  it("paginates", async () => {
    const { client, calls } = fake((c) =>
      c.input.ContinuationToken === undefined
        ? { Contents: [{ Key: "a" }, { Key: "b" }], IsTruncated: true, NextContinuationToken: "t1" }
        : { Contents: [{ Key: "c" }], IsTruncated: false },
    );
    expect(await listKeys(client, "bk")).toEqual(new Set(["a", "b", "c"]));
    expect(calls).toHaveLength(2);
    expect(calls[1].input.ContinuationToken).toBe("t1");
    expect(calls[0].input.Bucket).toBe("bk");
  });

  it("empty bucket", async () => {
    const { client } = fake(() => ({ IsTruncated: false }));
    expect(await listKeys(client, "bk")).toEqual(new Set());
  });

  it("headers", async () => {
    const { client, calls } = fake(() => ({}));
    const body = Buffer.from("x");
    await uploadMissing(client, "bk", new Map([["en/a.1.avif", body]]), new Set());
    expect(calls[0].input).toEqual({
      Bucket: "bk",
      Key: "en/a.1.avif",
      Body: body,
      ContentType: "image/avif",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("uploads only missing, sorted", async () => {
    const { client, calls } = fake(() => ({}));
    const files = new Map([
      ["en/b.2.avif", Buffer.from("b")],
      ["en/a.1.avif", Buffer.from("a")],
      ["en/c.3.avif", Buffer.from("c")],
    ]);
    const out = await uploadMissing(client, "b", files, new Set(["en/a.1.avif"]));
    expect(out).toEqual(["en/b.2.avif", "en/c.3.avif"]);
    expect(calls.map((c) => c.constructor.name).every((n) => n === "PutObjectCommand")).toBe(true);
  });

  it("failed PUT rejects", async () => {
    const { client } = fake(() => {
      throw new Error("boom");
    });
    await expect(
      uploadMissing(client, "b", new Map([["k", Buffer.from("x")]]), new Set()),
    ).rejects.toThrow("boom");
  });

  it("createClient targets R2", async () => {
    const c = createClient({ R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" });
    expect(await c.config.region()).toBe("auto");
    const ep = await c.config.endpoint!();
    expect(ep.hostname).toBe("acc.r2.cloudflarestorage.com");
  });
});
