import { FatalError } from "workflow";
import { job, saveJob, asset, db, key, releaseSlot } from "@/lib/store";
import { readPrivate, writePrivate } from "@/lib/blob";
import {
  phosor,
  uploadPhosor,
  downloadProvider,
  liveCatalog,
  catalogRate,
} from "@/lib/phosor";
import { cutAudio, endingFrame, mergeVideo } from "@/lib/media";
import { billableFrames, timingError } from "@/lib/policy";
import { configuration, requireGeneration } from "@/lib/config";
export async function prepare(id: string) {
  "use step";
  console.log("prepare", id);
  requireGeneration();
  const j = await job(id);
  if (!j) throw new FatalError("Không tìm thấy tác vụ.");
  const audio = await asset(j.quote.audioId);
  const problem = timingError(audio.duration!, j.quote.duration);
  if (problem) throw new FatalError(problem);
  j.stage = "preparing";
  j.message = "Chuẩn bị ảnh và giọng đọc đã duyệt";
  j.progress = 5;
  await saveJob(j);
  if (!j.imageKey) {
    const a = await asset(j.quote.imageId);
    j.imageKey = await uploadPhosor(
      await readPrivate(a.path),
      a.mime,
      "reference.jpg",
    );
    await saveJob(j);
  }
  return j.segments.length;
}
prepare.maxRetries = 1;
export async function submitSegment(id: string, index: number) {
  "use step";
  console.log("submit segment", id, index);
  requireGeneration();
  const j = await job(id);
  if (!j) throw new FatalError("Không tìm thấy tác vụ.");
  const s = j.segments[index];
  if (s.requestId || s.state === "done") return;
  if (s.state === "submitting" || s.state === "unknown")
    throw new FatalError(
      "Chưa rõ Phosor đã nhận yêu cầu. Cần đối chiếu lịch sử trước khi tiếp tục.",
    );
  const current = catalogRate(await liveCatalog(), j.quote.kind);
  if (current > j.quote.rate + 1e-10)
    throw new FatalError(
      "Giá Phosor tăng sau khi duyệt. Tạm dừng để tránh vượt dự toán.",
    );
  const imageKey =
    j.quote.kind === "motion" && index > 0
      ? j.segments[index - 1].nextImageKey
      : j.imageKey;
  if (!imageKey) throw new FatalError("Chưa có khung hình tham chiếu.");
  const payload: Record<string, unknown> = {
    model: j.quote.model,
    prompt: s.prompt,
    image_url: imageKey,
    seed: 20261015,
  };
  if (j.quote.kind === "motion")
    Object.assign(payload, {
      duration: s.seconds,
      resolution_tier: "480p",
      aspect_ratio: "9:16",
    });
  else {
    const a = await asset(j.quote.audioId),
      audio = await cutAudio(await readPrivate(a.path), s.start, s.seconds);
    const audioKey = await uploadPhosor(
      audio,
      "audio/wav",
      `speech-${index}.wav`,
    );
    Object.assign(payload, {
      width: 480,
      height: 854,
      frames_per_second: 16,
      num_frames: billableFrames(s.seconds),
      audio_url: audioKey,
    });
  }
  // A durable marker is written before the non-idempotent provider call.
  // A crash after this point is an UNKNOWN state, never an automatic second submit.
  const marker = await db().set(key(`submit:${id}:${index}`), "started", {
    nx: true,
  });
  if (!marker)
    throw new FatalError("Yêu cầu này đã được gửi hoặc cần đối chiếu.");
  s.state = "submitting";
  j.stage = "video";
  j.message = `Tạo đoạn ${index + 1}/${j.segments.length}`;
  j.progress = 10 + Math.floor((index / j.segments.length) * 70);
  await saveJob(j);
  try {
    const response = await phosor("/api/v1/inference/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (typeof response.request_id !== "string")
      throw new Error("Phản hồi thiếu request_id.");
    s.requestId = response.request_id;
    s.state = "submitted";
    await saveJob(j);
  } catch (e) {
    s.state = "unknown";
    j.stage = "unknown";
    j.message = "Cần đối chiếu Phosor trước khi gửi tiếp";
    await saveJob(j);
    throw new FatalError(
      e instanceof Error ? e.message : "Không xác định trạng thái gửi.",
    );
  }
}
submitSegment.maxRetries = 0;
export async function pollSegment(id: string, index: number) {
  "use step";
  const j = await job(id);
  if (!j) throw new FatalError("Không tìm thấy tác vụ.");
  const s = j.segments[index];
  if (s.state === "done") return true;
  if (!s.requestId) throw new FatalError("Thiếu request_id, cần đối chiếu.");
  const status = await phosor(
    "/api/v1/inference/status/" + encodeURIComponent(s.requestId),
  );
  if (String(status.status).toLowerCase() === "failed")
    throw new FatalError(
      "Phosor báo đoạn video thất bại. Các đoạn thành công được giữ lại. Không tự tạo lại đoạn có phí.",
    );
  if (String(status.status).toLowerCase() !== "completed") return false;
  const response = await phosor(
    "/api/v1/inference/result/" + encodeURIComponent(s.requestId),
  );
  const url = response.data?.video?.url;
  if (typeof url !== "string")
    throw new Error("Chưa có URL video trong kết quả.");
  const data = await downloadProvider(url);
  s.path = await writePrivate(
    `jobs/${id}/part-${index}.mp4`,
    data,
    "video/mp4",
  );
  if (j.quote.kind === "motion" && index < j.segments.length - 1) {
    s.nextImageKey = await uploadPhosor(
      await endingFrame(data),
      "image/jpeg",
      `continuity-${index}.jpg`,
    );
  }
  s.state = "done";
  j.progress = 10 + Math.floor(((index + 1) / j.segments.length) * 70);
  await saveJob(j);
  return true;
}
pollSegment.maxRetries = 2;
export async function merge(id: string) {
  "use step";
  console.log("merge", id);
  const j = await job(id);
  if (!j) throw new FatalError("Không tìm thấy tác vụ.");
  if (j.stage === "completed") return;
  if (j.segments.some((s) => !s.path))
    throw new FatalError("Thiếu đoạn video, chưa thể ghép.");
  j.stage = "merging";
  j.message = "Ghép hình, tiếng và kiểm tra MP4";
  j.progress = 85;
  await saveJob(j);
  const audio = await asset(j.quote.audioId);
  const clips = [];
  for (const s of j.segments)
    clips.push({ data: await readPrivate(s.path!), seconds: s.seconds });
  const result = await mergeVideo(
    clips,
    await readPrivate(audio.path),
    j.quote.duration,
  );
  j.outputPath = await writePrivate(
    `jobs/${id}/video.mp4`,
    result.data,
    "video/mp4",
  );
  j.media = result.media;
  j.stage = "completed";
  j.progress = 100;
  j.message = "Video đã hoàn tất";
  j.actualUsd = null;
  j.costNote =
    "Dự toán; API chưa được xác nhận có trường chi phí thực tế cho toàn bộ video. Đối chiếu số dư Phosor, Google, DeepSeek và Vercel.";
  await saveJob(j);
  await releaseSlot(id);
}
merge.maxRetries = 1;
export async function finishFailed(id: string, message: string) {
  "use step";
  console.log("video paused", id);
  const j = await job(id);
  if (!j) return;
  if (
    j.segments.some((s) => s.state === "unknown" || s.state === "submitting")
  ) {
    j.stage = "unknown";
    j.message = "Cần đối chiếu yêu cầu tại Phosor; không tự gửi lại";
  } else {
    j.stage = "failed";
    j.message = "Tác vụ tạm dừng, đã giữ các đoạn hoàn tất";
    await releaseSlot(id);
  }
  j.error = message;
  await saveJob(j);
}
finishFailed.maxRetries = 2;
