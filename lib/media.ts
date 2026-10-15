import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import type { MediaInfo } from "./types";
const exec = promisify(execFile);
const ff = () => process.env.FFMPEG_PATH || ffmpeg!;
const probePath = () => process.env.FFPROBE_PATH || ffprobe.path;
export async function workspace<T>(fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "phosor-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function runFF(args: string[]) {
  return exec(ff(), ["-nostdin", "-hide_banner", "-y", ...args], {
    timeout: 240000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
export async function probe(path: string) {
  const r = await exec(
    probePath(),
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
    { timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(r.stdout);
}
export async function normalizeAudio(data: Buffer) {
  return workspace(async (dir) => {
    const input = join(dir, "input"),
      output = join(dir, "audio.mp3");
    await writeFile(input, data);
    const p = await probe(input);
    if (
      !p.streams.some(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ) ||
      p.streams.some(
        (s: { codec_type: string; disposition?: { attached_pic?: number } }) =>
          s.codec_type === "video" && s.disposition?.attached_pic !== 1,
      )
    )
      throw new Error("Tệp cần chỉ chứa âm thanh hoặc ảnh bìa nhúng.");
    const duration = Number(p.format.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 65)
      throw new Error("Âm thanh phải dài từ 1 đến 65 giây.");
    await runFF([
      "-i",
      input,
      "-map",
      "0:a:0",
      "-vn",
      "-map_metadata",
      "-1",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      output,
    ]);
    return {
      data: await readFile(output),
      duration: Number((await probe(output)).format.duration),
    };
  });
}
export async function pauses(data: Buffer): Promise<number[]> {
  return workspace(async (dir) => {
    const path = join(dir, "audio.mp3");
    await writeFile(path, data);
    const r = await runFF([
      "-i",
      path,
      "-af",
      "silencedetect=noise=-32dB:d=0.18",
      "-f",
      "null",
      "-",
    ]);
    const found: number[] = [];
    const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
    let m;
    while ((m = re.exec(r.stderr)))
      found.push((Number(m[1]) + Number(m[2])) / 2);
    return found;
  });
}
export async function cutAudio(data: Buffer, start: number, seconds: number) {
  return workspace(async (dir) => {
    const input = join(dir, "audio.mp3"),
      output = join(dir, "cut.wav");
    await writeFile(input, data);
    await runFF([
      "-i",
      input,
      "-ss",
      String(start),
      "-t",
      String(seconds),
      "-ac",
      "1",
      "-ar",
      "16000",
      output,
    ]);
    return readFile(output);
  });
}
export async function endingFrame(data: Buffer) {
  return workspace(async (dir) => {
    const input = join(dir, "clip.mp4"),
      output = join(dir, "last.jpg");
    await writeFile(input, data);
    await runFF([
      "-sseof",
      "-0.08",
      "-i",
      input,
      "-frames:v",
      "1",
      "-update",
      "1",
      output,
    ]);
    return readFile(output);
  });
}
export async function verifyVideo(
  path: string,
  expected: number,
): Promise<MediaInfo> {
  const p = await probe(path);
  const v = p.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    ),
    a = p.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  if (!v || !a) throw new Error("MP4 thiếu hình hoặc tiếng.");
  const vd = Number(v.duration),
    ad = Number(a.duration),
    d = Number(p.format.duration);
  if (
    [d, vd, ad].some((n) => !Number.isFinite(n) || Math.abs(n - expected) > 0.2)
  )
    throw new Error("Thời lượng MP4 chưa đạt sai số ±0,2 giây.");
  if (
    v.codec_name !== "h264" ||
    a.codec_name !== "aac" ||
    v.pix_fmt !== "yuv420p"
  )
    throw new Error("Codec chưa đạt yêu cầu MP4 tương thích.");
  await runFF(["-v", "error", "-i", path, "-f", "null", "-"]);
  const [n, b] = v.avg_frame_rate.split("/").map(Number);
  return {
    duration: d,
    videoDuration: vd,
    audioDuration: ad,
    videoCodec: v.codec_name,
    audioCodec: a.codec_name,
    pixelFormat: v.pix_fmt,
    width: v.width,
    height: v.height,
    fps: n / b,
  };
}
export async function mergeVideo(
  clips: { data: Buffer; seconds: number }[],
  audio: Buffer,
  duration: number,
) {
  return workspace(async (dir) => {
    const normalized: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const path = join(dir, `source${i}.mp4`),
        out = join(dir, `part${i}.mp4`);
      await writeFile(path, clips[i].data);
      const p = await probe(path);
      if (Number(p.format.duration) < clips[i].seconds - 0.15)
        throw new Error(
          "Đoạn video ngắn hơn yêu cầu; cần kiểm tra Phosor, không lặp cảnh để bù.",
        );
      await runFF([
        "-i",
        path,
        "-t",
        String(clips[i].seconds),
        "-an",
        "-vf",
        "scale=576:1024:force_original_aspect_ratio=decrease,pad=576:1024:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-video_track_timescale",
        "24000",
        out,
      ]);
      normalized.push(out);
    }
    const list = join(dir, "parts.txt"),
      voice = join(dir, "voice.mp3"),
      output = join(dir, "final.mp4");
    await writeFile(list, normalized.map((p) => `file '${p}'`).join("\n"));
    await writeFile(voice, audio);
    // Full narration is preserved. Padding is silence after a finished sentence, at most 3 seconds.
    await runFF([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-i",
      voice,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-af",
      `apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-t",
      String(duration),
      output,
    ]);
    const media = await verifyVideo(output, duration);
    return { data: await readFile(output), media };
  });
}
