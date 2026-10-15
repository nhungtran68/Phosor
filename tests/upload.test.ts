import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import Studio from "../app/page";
import { fileDetails, requestJSON, uploadAsset } from "../lib/client-upload";
import { storageReadiness, redisCredentials } from "../lib/storage-config";
import { sessionToken } from "../lib/auth";
import { POST } from "../app/api/[...path]/route";

const storageNames = [
  "BLOB_READ_WRITE_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];
async function withEmptyStorage(fn: () => Promise<void>) {
  const names = [...storageNames, "APP_PASSWORD", "SESSION_SECRET"];
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  try {
    await fn();
  } finally {
    for (const n of names) {
      if (old[n] === undefined) delete process.env[n];
      else process.env[n] = old[n];
    }
  }
}

test("image picker remains usable before login or storage setup", () => {
  const html = renderToStaticMarkup(createElement(Studio));
  const button = html.match(/<button[^>]*class="dropzone [^"]*"[^>]*>/)?.[0];
  assert.ok(button, "image picker button must render");
  assert.ok(
    !button.includes("disabled"),
    "local image selection must not depend on cloud configuration",
  );
});

test("camera images without a familiar extension are accepted by supported MIME", () => {
  const camera = new File([new Uint8Array([255, 216, 255])], "camera-image", {
    type: "image/jpeg",
  });
  assert.deepEqual(fileDetails(camera, "image"), {
    ext: "jpg",
    mime: "image/jpeg",
  });
  assert.throws(() => fileDetails(new File([], "empty.jpg"), "image"), /trống/);
  assert.throws(
    () =>
      fileDetails(
        new File(["heic"], "IMG.HEIC", { type: "image/heic" }),
        "image",
      ),
    /JPEG/,
  );
});

test("Vercel KV REST aliases satisfy the existing Redis dependency", async () =>
  withEmptyStorage(async () => {
    assert.equal(storageReadiness().ready, false);
    process.env.BLOB_READ_WRITE_TOKEN = "test-fixture";
    process.env.KV_REST_API_URL = "https://redis.example";
    process.env.KV_REST_API_TOKEN = "test-fixture";
    assert.deepEqual(redisCredentials(), {
      url: "https://redis.example",
      token: "test-fixture",
    });
    assert.equal(storageReadiness().ready, true);
    process.env.UPSTASH_REDIS_REST_URL = "https://preferred.example";
    assert.equal(redisCredentials().url, "https://redis.example");
    process.env.UPSTASH_REDIS_REST_TOKEN = "preferred-fixture";
    assert.equal(redisCredentials().url, "https://preferred.example");
  }));

test("upload preflight names missing configuration before calling storage services", async () =>
  withEmptyStorage(async () => {
    process.env.APP_PASSWORD = "test-fixture-password";
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
    const original = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw new Error("unexpected external request");
    };
    try {
      const response = await POST(
        new NextRequest("https://studio.example/api/upload", {
          method: "POST",
          headers: {
            origin: "https://studio.example",
            cookie: `phosor_session=${sessionToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname: "uploads/11111111-1111-1111-1111-111111111111.jpg",
              multipart: false,
            },
          }),
        }),
        { params: Promise.resolve({ path: ["upload"] }) },
      );
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.error, /BLOB_READ_WRITE_TOKEN/);
      assert.match(data.error, /UPSTASH_REDIS_REST_URL/);
      assert.equal(calls, 0);
    } finally {
      global.fetch = original;
    }
  }));

test("client preserves actionable token errors and never sends the file after a refused token", async () => {
  const original = global.fetch;
  const requests: string[] = [];
  global.fetch = async (url) => {
    requests.push(String(url));
    return Response.json(
      { error: "Chưa lưu được ảnh: còn thiếu BLOB_READ_WRITE_TOKEN." },
      { status: 400 },
    );
  };
  try {
    const photo = new File([new Uint8Array([255, 216, 255])], "photo.jpg", {
      type: "image/jpeg",
    });
    await assert.rejects(uploadAsset(photo, "image"), /BLOB_READ_WRITE_TOKEN/);
    assert.deepEqual(requests, ["/api/upload"]);
  } finally {
    global.fetch = original;
  }
});

test("HTML errors from a deployment produce a readable message", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response("<html>Payload too large</html>", { status: 413 });
  try {
    await assert.rejects(requestJSON("upload", {}), /quá lớn/);
  } finally {
    global.fetch = original;
  }
});
