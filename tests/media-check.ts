import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  workspace,
  runFF,
  mergeVideo,
  normalizeAudio,
  probe,
} from "../lib/media";
import { planSegments } from "../lib/policy";
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg";
process.env.FFPROBE_PATH = process.env.FFPROBE_PATH || "/usr/bin/ffprobe";
workspace(async (dir) => {
  for (const duration of [30, 40, 60] as const) {
    const segments = planSegments(duration, "motion");
    const clips = [];
    for (let i = 0; i < segments.length; i++) {
      const path = join(dir, `test-${duration}-${i}.mp4`);
      await runFF([
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=480x832:rate=24:duration=${segments[i].seconds}`,
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        path,
      ]);
      clips.push({ data: await readFile(path), seconds: segments[i].seconds });
    }
    const audio = join(dir, "voice.wav");
    await runFF([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=48000:duration=${duration - 1}`,
      "-ac",
      "1",
      audio,
    ]);
    const normalized = await normalizeAudio(await readFile(audio));
    const result = await mergeVideo(clips, normalized.data, duration);
    assert.ok(Math.abs(result.media.duration - duration) < 0.2);
    assert.equal(result.media.videoCodec, "h264");
    assert.equal(result.media.audioCodec, "aac");
    assert.equal(result.media.width * 16, result.media.height * 9);
    assert.equal(result.media.fps, 24);
    const output = join(dir, `final-${duration}.mp4`);
    await writeFile(output, result.data);
    const p = await probe(output);
    assert.equal(Number(p.format.start_time), 0);
    const raw = result.data;
    assert.ok(
      raw.indexOf(Buffer.from("moov")) < raw.indexOf(Buffer.from("mdat")),
      "faststart must put metadata first",
    );
    console.log(
      JSON.stringify({
        expectedSeconds: duration,
        segments: segments.length,
        bytes: result.data.length,
        ...result.media,
        fullDecode: "passed",
        faststart: "passed",
      }),
    );
  }
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
