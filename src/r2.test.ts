import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Writes each body to a temporary file and returns the key to path map. */
function onDisk(bodies: Record<string, string>): Map<string, string> {
  const dir = mkdtempSync(join(tmpdir(), "r2-"));
  const files = new Map<string, string>();
  for (const [key, body] of Object.entries(bodies)) {
    const path = join(dir, key.replaceAll("/", "_"));
    writeFileSync(path, body);
    files.set(key, path);
  }
  return files;
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
    await uploadMissing(client, "bk", onDisk({ "cards/en/a.1.avif": "x" }), new Set());
    expect(calls[0].input).toEqual({
      Bucket: "bk",
      Key: "cards/en/a.1.avif",
      Body: Buffer.from("x"),
      ContentType: "image/avif",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("uploads only missing, sorted", async () => {
    const { client, calls } = fake(() => ({}));
    const files = onDisk({ "cards/en/b.2.avif": "b", "cards/en/a.1.avif": "a", "cards/en/c.3.avif": "c" });
    const out = await uploadMissing(client, "b", files, new Set(["cards/en/a.1.avif"]));
    expect(out).toEqual(["cards/en/b.2.avif", "cards/en/c.3.avif"]);
    expect(calls.map((c) => c.constructor.name).every((n) => n === "PutObjectCommand")).toBe(true);
  });

  it("failed PUT rejects", async () => {
    const { client } = fake(() => {
      throw new Error("boom");
    });
    await expect(
      uploadMissing(client, "b", onDisk({ k: "x" }), new Set()),
    ).rejects.toThrow("boom");
  });

  it("createClient targets R2", async () => {
    const c = createClient({ R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" });
    expect(await c.config.region()).toBe("auto");
    const ep = await c.config.endpoint!();
    expect(ep.hostname).toBe("acc.r2.cloudflarestorage.com");
  });
});
