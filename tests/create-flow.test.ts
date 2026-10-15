import test from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Studio from "../app/page";
import { CreateReview } from "../components/create-review";
import { creationIssues, type CreateDraft, type StudioConfig } from "../lib/create-flow";
import { planSegments } from "../lib/policy";
import type { Asset, Duration, Quote } from "../lib/types";

const ready: StudioConfig = {
  access: true, storage: true, storageMissing: [], phosor: true, script: true,
  voice: true, spend: true, ready: true, authenticated: true,
  dailyBudgetUsd: 0.5, maxJobUsd: 0.3, infraUsd: 0.01, fx: 26000,
};
const image: Asset = { id: "fixture-image", kind: "image", path: "fixture.jpg", mime: "image/jpeg", bytes: 1000, hash: "fixture" };
const audio: Asset = { id: "fixture-audio", kind: "audio", path: "fixture.wav", mime: "audio/wav", bytes: 1000, hash: "fixture", duration: 29 };
const draft: CreateDraft = { image, audio, hasLocalImage: false, mode: "auto", source: "text", text: "Lời thoại mẫu.", duration: 30 };
const quote: Quote = {
  id: "fixture-quote", createdAt: 1, expiresAt: Number.MAX_SAFE_INTEGER, imageId: image.id, audioId: audio.id,
  duration: 30, kind: "motion", model: "fixture", segments: planSegments(30, "motion"), videoUsd: 0.135,
  infraUsd: 0.01, reserveUsd: 0.145, estimateUsd: 0.15, fx: 26000, source: "live", rate: 0.0045,
  preparedCostsUsd: 0.005, script: "Lời thoại mẫu.",
};
const noOp = () => {};
const reviewProps: ComponentProps<typeof CreateReview> = {
  open: true, busy: "", issues: [], quote, duration: 30, consent: false, error: "", hasActiveJob: false,
  onClose: noOp, onResolve: noOp, onReview: noOp, onConsent: noOp, onCreate: noOp, onProgress: noOp,
};

test("create entry is present and clickable before configuration, assets or a quote", () => {
  const html = renderToStaticMarkup(createElement(Studio));
  const dock = html.match(/<div class="create-dock"[\s\S]*?<\/button>/)?.[0];
  assert.ok(dock);
  assert.match(dock, />Tạo video<\/button>/);
  assert.doesNotMatch(dock, /disabled/);
  const entry = html.match(/<button class="primary-button create-entry"[\s\S]*?<\/button>/)?.[0];
  assert.ok(entry);
  assert.doesNotMatch(entry, /disabled/);
});

test("the exact observed production setup lists actionable blockers instead of enabling paid creation", () => {
  const observed = { ...ready, access: false, authenticated: false, storage: false, voice: false, script: false, spend: false, ready: false };
  const issues = creationIssues(observed, { ...draft, image: null, hasLocalImage: true, audio: null, text: "" });
  assert.deepEqual(issues.map((x) => x.id), ["access", "storage", "spend", "script-api", "voice-api", "image", "script"]);
  assert.match(issues.find((x) => x.id === "image")!.message, /chưa lưu/);
  const html = renderToStaticMarkup(createElement(CreateReview, { ...reviewProps, issues }));
  assert.match(html, /Chưa gửi tạo video/);
  assert.match(html, /Mở thiết lập/);
  assert.doesNotMatch(html, /Xác nhận tạo video/);
});

test("login remains required even when every service is configured", () => {
  const issues = creationIssues({ ...ready, authenticated: false }, draft);
  assert.deepEqual(issues.map((x) => x.action), ["login"]);
});

test("both dialogue modes accept prepared audio at all three selected durations", () => {
  for (const mode of ["auto", "existing"] as const) {
    for (const duration of [30, 40, 60] as Duration[]) {
      const issues = creationIssues(ready, { ...draft, mode, duration, audio: { ...audio, duration: duration - 1 } });
      assert.deepEqual(issues, [], `${mode} / ${duration}s`);
    }
  }
});

test("uploaded narration does not require writing or speech API keys", () => {
  assert.deepEqual(creationIssues({ ...ready, voice: false, script: false }, { ...draft, mode: "existing", source: "audio", text: "" }), []);
  const missing = creationIssues(ready, { ...draft, mode: "existing", source: "audio", audio: null });
  assert.deepEqual(missing.map((x) => x.action), ["audio"]);
});

test("text alone routes to narration and mismatched timing cannot reach final confirmation", () => {
  assert.deepEqual(creationIssues(ready, { ...draft, audio: null }).map((x) => x.action), ["voice"]);
  for (const seconds of [0, 12, 31]) {
    const issues = creationIssues(ready, { ...draft, audio: { ...audio, duration: seconds } });
    assert.deepEqual(issues.map((x) => x.id), ["timing"]);
    const html = renderToStaticMarkup(createElement(CreateReview, { ...reviewProps, issues }));
    assert.doesNotMatch(html, /Xác nhận tạo video/);
  }
});

test("the paid confirmation is available only after a quote and explicit cost consent", () => {
  function confirm(props: Partial<ComponentProps<typeof CreateReview>>) {
    const html = renderToStaticMarkup(createElement(CreateReview, { ...reviewProps, ...props }));
    return html.match(/<button[^>]*class="primary-button confirm-create"[^>]*>/)?.[0];
  }
  assert.equal(confirm({ quote: null }), undefined);
  assert.match(confirm({ consent: false })!, /disabled/);
  assert.doesNotMatch(confirm({ consent: true })!, /disabled/);
  assert.match(confirm({ consent: true, busy: "render" })!, /disabled/);
  assert.equal(confirm({ consent: true, hasActiveJob: true }), undefined);
});
