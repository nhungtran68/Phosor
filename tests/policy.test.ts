import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDuration,
  planSegments,
  timingError,
  billableFrames,
  videoCost,
  MODEL_MOTION,
} from "../lib/policy";
import { catalogRate, liveCatalog, downloadProvider } from "../lib/phosor";
import { configuration, requireGeneration } from "../lib/config";
import { POST, GET } from "../app/api/[...path]/route";
import { NextRequest } from "next/server";

test("30/40/60 seconds use legal H3 durations and exactly fill the timeline", () => {
  for (const duration of [30, 40, 60] as const) {
    const segments = planSegments(duration, "motion");
    assert.equal(
      segments.reduce((n, s) => n + s.seconds, 0),
      duration,
    );
    assert.ok(segments.every((s) => s.seconds >= 4 && s.seconds <= 15));
    assert.equal(videoCost(segments, "motion", 0.0045), duration * 0.0045);
    assert.equal(segments.at(-1)!.start + segments.at(-1)!.seconds, duration);
    assert.ok(new Set(segments.map((s) => s.prompt)).size === segments.length);
  }
  for (const invalid of [0, 10, 31, 120, "30", null])
    assert.throws(() => assertDuration(invalid));
});
test("narration rejects too long / short audio and never requests time stretching", () => {
  assert.equal(timingError(28.5, 30), null);
  assert.match(timingError(31, 30)!, /rút ngắn/);
  assert.match(timingError(18, 30)!, /bổ sung/);
  assert.match(timingError(NaN, 30)!, /Không đọc/);
});
test("lip sync cuts at observed pauses and rejects unsplittable speech", () => {
  for (const duration of [30, 40, 60] as const) {
    const observed = Array.from({ length: 9 }, (_, i) => (i + 1) * 7);
    const p = planSegments(duration, "talking", observed);
    assert.ok(p.every((s) => billableFrames(s.seconds) <= 161));
    assert.ok(p.slice(1).every((s) => observed.includes(s.start)));
    assert.ok(
      Math.abs(p.reduce((n, s) => n + s.seconds, 0) - duration) < 0.001,
    );
  }
  assert.throws(() => planSegments(30, "talking", []), /khoảng nghỉ/);
});
test("live API schema and portrait capability must match; no silent model upgrade", async () => {
  const original = global.fetch;
  global.fetch = async (url) =>
    new Response(
      JSON.stringify(
        String(url).endsWith("/models")
          ? {
              models: [
                {
                  model_id: MODEL_MOTION,
                  metadata: { supported_aspect_ratios: ["9:16"] },
                },
              ],
            }
          : { minimax_h3_pricing: { base_per_second: { "480p": 0.0045 } } },
      ),
      { status: 200 },
    );
  try {
    const c = await liveCatalog();
    assert.equal(catalogRate(c, "motion"), 0.0045);
    c.models[0].metadata.supported_aspect_ratios = ["16:9"];
    assert.throws(() => catalogRate(c, "motion"), /khung dọc/);
    assert.throws(() => catalogRate(c, "talking"), /không còn/);
  } finally {
    global.fetch = original;
  }
});
test("provider downloads reject arbitrary URLs before any network request", async () => {
  for (const url of [
    "http://phosor.ai/file",
    "https://127.0.0.1/file",
    "https://evil.example/file",
    "https://user:pass@phosor.ai/file",
  ])
    await assert.rejects(downloadProvider(url), /Máy chủ/);
});
test("absent configuration fails closed with no paid provider calls", async () => {
  const names = [
    "APP_PASSWORD",
    "SESSION_SECRET",
    "PHOSOR_API_KEY",
    "GENERATION_ENABLED",
    "DAILY_BUDGET_USD",
    "MAX_JOB_USD",
  ];
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  try {
    assert.equal(configuration().ready, false);
    assert.throws(requireGeneration, /Chưa mở/);
    let externalCalls = 0;
    const f = global.fetch;
    global.fetch = async () => {
      externalCalls++;
      throw new Error("No network allowed");
    };
    try {
      for (const path of [
        "script",
        "voice",
        "quote",
        "jobs",
        "verify-upload",
      ]) {
        const r = await POST(
          new NextRequest("https://studio.example/api/" + path, {
            method: "POST",
            headers: {
              origin: "https://studio.example",
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
          { params: Promise.resolve({ path: [path] }) },
        );
        assert.equal(r.status, 400);
      }
      assert.equal(externalCalls, 0);
    } finally {
      global.fetch = f;
    }
  } finally {
    for (const n of names) {
      if (old[n] === undefined) delete process.env[n];
      else process.env[n] = old[n];
    }
  }
});
test("private APIs require a cookie and mutation endpoints reject cross-origin requests", async () => {
  const r = await GET(new NextRequest("https://studio.example/api/jobs"), {
    params: Promise.resolve({ path: ["jobs"] }),
  });
  assert.equal(r.status, 401);
  const p = await POST(
    new NextRequest("https://studio.example/api/login", {
      method: "POST",
      headers: { origin: "https://other.example" },
      body: "{}",
    }),
    { params: Promise.resolve({ path: ["login"] }) },
  );
  assert.equal(p.status, 400);
  assert.match((await p.json()).error, /cùng nguồn/);
});
test("owner login creates a secure HttpOnly cookie and authenticates config", async () => {
  const password = process.env.APP_PASSWORD,
    secret = process.env.SESSION_SECRET;
  process.env.APP_PASSWORD = "test-fixture-not-a-production-password";
  process.env.SESSION_SECRET =
    "test-only-session-secret-with-more-than-32-characters";
  try {
    const r = await POST(
      new NextRequest("https://studio.example/api/login", {
        method: "POST",
        headers: {
          origin: "https://studio.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: process.env.APP_PASSWORD }),
      }),
      { params: Promise.resolve({ path: ["login"] }) },
    );
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    const c = await GET(
      new NextRequest("https://studio.example/api/config", {
        headers: { cookie: cookie.split(";")[0] },
      }),
      { params: Promise.resolve({ path: ["config"] }) },
    );
    assert.equal((await c.json()).authenticated, true);
    const bad = await POST(
      new NextRequest("https://studio.example/api/login", {
        method: "POST",
        headers: {
          origin: "https://studio.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "wrong" }),
      }),
      { params: Promise.resolve({ path: ["login"] }) },
    );
    assert.equal(bad.status, 401);
  } finally {
    if (password === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = password;
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
  }
});
