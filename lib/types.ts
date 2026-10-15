export type Duration = 30 | 40 | 60;
export type VideoKind = "motion" | "talking";
export type Stage =
  | "queued"
  | "preparing"
  | "video"
  | "merging"
  | "completed"
  | "failed"
  | "unknown";
export type Asset = {
  id: string;
  kind: "image" | "audio";
  path: string;
  mime: string;
  bytes: number;
  hash: string;
  duration?: number;
  width?: number;
  height?: number;
  preparationUsd?: number;
};
export type Segment = {
  seconds: number;
  start: number;
  prompt: string;
  state: "pending" | "submitting" | "submitted" | "done" | "unknown";
  requestId?: string;
  path?: string;
  nextImageKey?: string;
};
export type Quote = {
  id: string;
  createdAt: number;
  expiresAt: number;
  imageId: string;
  audioId: string;
  duration: Duration;
  kind: VideoKind;
  model: string;
  segments: Segment[];
  videoUsd: number;
  infraUsd: number;
  reserveUsd: number;
  estimateUsd: number;
  fx: number;
  source: "live" | "snapshot";
  rate: number;
  preparedCostsUsd: number;
  script: string;
};
export type Job = {
  id: string;
  createdAt: number;
  updatedAt: number;
  quote: Quote;
  stage: Stage;
  progress: number;
  message: string;
  segments: Segment[];
  runId?: string;
  imageKey?: string;
  outputPath?: string;
  media?: MediaInfo;
  actualUsd: number | null;
  costNote: string;
  error?: string;
};
export type MediaInfo = {
  duration: number;
  videoDuration: number;
  audioDuration: number;
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  width: number;
  height: number;
  fps: number;
};
