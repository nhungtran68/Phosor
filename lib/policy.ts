import type { Duration, VideoKind, Segment } from "./types";
export const DURATIONS = [30, 40, 60] as const;
export const MODEL_MOTION = "minimax/h3/image-to-video";
export const MODEL_TALKING = "wan/v2.2-a14b/speech-to-video";
export const MAX_IMAGE = 20 * 1024 * 1024;
export const MAX_AUDIO = 20 * 1024 * 1024;
export function assertDuration(d: unknown): asserts d is Duration {
  if (!DURATIONS.includes(d as Duration))
    throw new Error("Chọn thời lượng 30, 40 hoặc 60 giây.");
}
export function timingError(seconds: number, target: Duration): string | null {
  if (!Number.isFinite(seconds) || seconds < 1)
    return "Không đọc được thời lượng âm thanh.";
  if (seconds > target - 0.3)
    return `Giọng đọc dài ${seconds.toFixed(1)} giây. Hãy rút ngắn còn tối đa ${(target - 0.3).toFixed(1)} giây để giữ trọn câu và phần kết.`;
  if (seconds < target - 3)
    return `Giọng đọc dài ${seconds.toFixed(1)} giây, ngắn hơn thời lượng đã chọn. Hãy bổ sung nội dung hoặc chọn thời lượng khác; hệ thống không kéo giọng hay lặp cảnh để bù.`;
  return null;
}
export function planSegments(
  duration: Duration,
  kind: VideoKind,
  pauses: number[] = [],
): Segment[] {
  let points: number[] = [];
  if (kind === "motion") {
    const n = Math.ceil(duration / 15);
    for (let i = 1; i < n; i++) points.push(Math.round((i * duration) / n));
  } else {
    let last = 0;
    while (duration - last > 9.8) {
      const options = pauses.filter(
        (p) => p >= last + 3.0 && p <= last + 9.8 && duration - p >= 3,
      );
      if (!options.length)
        throw new Error(
          "Giọng đọc cần khoảng nghỉ giữa câu mỗi 3–9,8 giây để chia đoạn nhép miệng. Hãy thêm ngắt nghỉ hoặc dùng video ảnh chuyển động.",
        );
      const next = options.reduce((a, b) =>
        Math.abs(b - (last + 8)) < Math.abs(a - (last + 8)) ? b : a,
      );
      points.push(next);
      last = next;
    }
  }
  points = [0, ...points, duration];
  const shots = [
    "a slow and subtle camera push in",
    "a gentle camera move to the right",
    "a restrained close detail view",
    "a slow camera pull back",
    "a subtle camera move to the left",
    "a calm closing view",
  ];
  return points
    .slice(1)
    .map((end, i) => ({
      start: points[i],
      seconds: Math.round((end - points[i]) * 1000) / 1000,
      state: "pending",
      prompt: `Same subject and identity as the reference image, same clothing, setting, lighting and colors. ${kind === "talking" ? "The single adult speaks naturally in sync with the supplied audio, subtle expressions, head and shoulders visible." : shots[i % shots.length] + ", natural small movements, no speaking or lip movement."} Preserve all product details. No text, no logos, no new objects, no scene changes.`,
    }));
}
export function billableFrames(seconds: number): number {
  return 1 + 4 * Math.ceil((seconds * 16 - 1) / 4);
}
export function videoCost(
  segments: Segment[],
  kind: VideoKind,
  rate: number,
): number {
  return segments.reduce(
    (sum, s) =>
      sum + (kind === "motion" ? s.seconds : billableFrames(s.seconds)) * rate,
    0,
  );
}
export function reservation(videoUsd: number, infraUsd: number): number {
  return Math.ceil((videoUsd + infraUsd) * 1e6) / 1e6;
}
export function positiveNumber(s: string | undefined, fallback = 0): number {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
