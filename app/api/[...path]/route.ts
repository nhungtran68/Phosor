import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { get, head, del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { start, getRun } from "workflow/api";
import { configuration, requireGeneration } from "@/lib/config";
import { requireStorage } from "@/lib/storage-config";
import {
  authenticated,
  requireAuth,
  sameOrigin,
  passwordOK,
  sessionToken,
  COOKIE,
} from "@/lib/auth";
import {
  db,
  key,
  asset,
  job,
  saveAsset,
  saveQuote,
  getQuote,
  reserveJob,
  saveJob,
  reserveAux,
} from "@/lib/store";
import { readPrivate, writePrivate } from "@/lib/blob";
import { normalizeAudio, pauses } from "@/lib/media";
import { liveCatalog, catalogRate } from "@/lib/phosor";
import {
  assertDuration,
  timingError,
  planSegments,
  videoCost,
  reservation,
  MODEL_MOTION,
  MODEL_TALKING,
  MAX_IMAGE,
  MAX_AUDIO,
} from "@/lib/policy";
import type { Asset, Job, Quote, VideoKind } from "@/lib/types";
import { createVideo } from "@/workflows/video";
export const runtime = "nodejs";
export const maxDuration = 120;
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const localLogins = new Map<string, { count: number; until: number }>();
async function streamFile(
  req: NextRequest,
  path: string,
  mime: string,
  download = false,
) {
  const range = req.headers.get("range");
  const result = await get(path, {
    access: "private",
    headers: range ? { Range: range } : undefined,
  });
  if (!result || result.statusCode !== 200)
    return json({ error: "Tệp không còn khả dụng." }, 404);
  const headers = new Headers({
    "Content-Type": mime,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  for (const name of ["content-length", "content-range"]) {
    const v = result.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (download)
    headers.set(
      "Content-Disposition",
      'attachment; filename="phosor-video.mp4"',
    );
  return new Response(result.stream, {
    status: headers.has("content-range") ? 206 : 200,
    headers,
  });
}
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await ctx.params).path,
      c = configuration();
    if (p[0] === "config")
      return json({ ...c, authenticated: authenticated(req) });
    requireAuth(req);
    if (!c.storage) return json({ error: "Chưa cấu hình lưu trữ." }, 503);
    if (p[0] === "jobs") {
      if (p[1]) {
        const j = await job(p[1]);
        if (!j) return json({ error: "Không tìm thấy video." }, 404);
        if (p[2] === "video" && j.outputPath)
          return streamFile(
            req,
            j.outputPath,
            "video/mp4",
            req.nextUrl.searchParams.has("download"),
          );
        return json(j);
      }
      const ids = await db().lrange<string>(key("jobs"), 0, 49);
      const jobs = await Promise.all(ids.map(job));
      return json({ jobs: jobs.filter(Boolean) });
    }
    if (p[0] === "assets" && p[1]) {
      const a = await asset(p[1]);
      return streamFile(req, a.path, a.mime);
    }
    return json({ error: "Không tìm thấy." }, 404);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Yêu cầu chưa hoàn tất." },
      401,
    );
  }
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await ctx.params).path;
    // Blob's authenticated completion callback has no browser cookie/origin.
    if (p[0] === "upload") {
      const body = (await req.json()) as HandleUploadBody;
      if (body.type === "blob.generate-client-token") {
        sameOrigin(req);
        requireAuth(req);
        requireStorage();
      }
      const result = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          sameOrigin(req);
          requireAuth(req);
          requireStorage();
          if (
            !/^uploads\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp3|wav|m4a|aac|ogg|flac)$/.test(
              pathname,
            )
          )
            throw new Error("Tên tệp không hợp lệ.");
          const count = await db().incr(
            key("uploads:" + new Date().toISOString().slice(0, 10)),
          );
          if (count === 1)
            await db().expire(
              key("uploads:" + new Date().toISOString().slice(0, 10)),
              86400,
            );
          if (count > 50)
            throw new Error("Đã đạt giới hạn 50 tệp tải lên/ngày.");
          await db().set(key("upload:" + pathname), true, { ex: 1800 });
          return {
            allowedContentTypes: [
              "image/jpeg",
              "image/png",
              "image/webp",
              "audio/mpeg",
              "audio/mp3",
              "audio/wav",
              "audio/x-wav",
              "audio/mp4",
              "audio/aac",
              "audio/ogg",
              "audio/flac",
              "audio/x-m4a",
            ],
            maximumSizeInBytes: MAX_IMAGE,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: Date.now() + 15 * 60000,
          };
        },
      });
      return json(result);
    }
    sameOrigin(req);
    if (p[0] === "login") {
      if (!configuration().access)
        return json(
          { error: "Chưa cấu hình mật khẩu và khóa phiên ở máy chủ." },
          503,
        );
      const ip = digest(
        Buffer.from(
          req.headers.get("x-forwarded-for")?.split(",")[0] || "local",
        ),
      );
      if (configuration().storage) {
        const k = key("login:" + ip);
        const n = await db().incr(k);
        if (n === 1) await db().expire(k, 900);
        if (n > 10)
          return json({ error: "Thử đăng nhập quá nhiều. Chờ 15 phút." }, 429);
      } else {
        const r = localLogins.get(ip);
        const next =
          !r || r.until < Date.now()
            ? { count: 1, until: Date.now() + 900000 }
            : { ...r, count: r.count + 1 };
        localLogins.set(ip, next);
        if (next.count > 10)
          return json({ error: "Thử đăng nhập quá nhiều. Chờ 15 phút." }, 429);
      }
      const { password } = await req.json();
      if (
        typeof password !== "string" ||
        password.length > 256 ||
        !passwordOK(password)
      )
        return json({ error: "Mật khẩu chưa đúng." }, 401);
      const r = json({ ok: true });
      r.cookies.set(COOKIE, sessionToken(), {
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 86400,
      });
      return r;
    }
    if (p[0] === "logout") {
      const r = json({ ok: true });
      r.cookies.delete(COOKIE);
      return r;
    }
    requireAuth(req);
    if (p[0] === "verify-upload") {
      requireStorage();
      const { pathname, kind } = await req.json();
      if (
        typeof pathname !== "string" ||
        !["image", "audio"].includes(kind) ||
        !(await db().get(key("upload:" + pathname)))
      )
        throw new Error("Tệp tải lên không được cấp quyền hoặc đã hết hạn.");
      const h = await head(pathname);
      if (h.size > (kind === "image" ? MAX_IMAGE : MAX_AUDIO))
        throw new Error("Tệp vượt 20 MB.");
      const data = await readPrivate(pathname);
      let a: Asset;
      if (kind === "image") {
        const meta = await sharp(data, {
          limitInputPixels: 40000000,
        }).metadata();
        if (
          !["jpeg", "png", "webp"].includes(meta.format || "") ||
          (meta.pages && meta.pages > 1)
        )
          throw new Error("Chỉ chấp nhận ảnh JPEG, PNG, WebP tĩnh.");
        if (
          !meta.width ||
          !meta.height ||
          Math.min(meta.width, meta.height) < 320
        )
          throw new Error("Ảnh cần có cạnh ngắn tối thiểu 320 px.");
        const cleaned = await sharp(data, { limitInputPixels: 40000000 })
          .rotate()
          .resize({
            width: 1536,
            height: 1536,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 92 })
          .toBuffer({ resolveWithObject: true });
        const id = randomUUID(),
          path = await writePrivate(
            `assets/${id}.jpg`,
            cleaned.data,
            "image/jpeg",
          );
        a = {
          id,
          kind,
          path,
          mime: "image/jpeg",
          bytes: cleaned.data.length,
          hash: digest(cleaned.data),
          width: cleaned.info.width,
          height: cleaned.info.height,
        };
      } else {
        // Decode with ffprobe/ffmpeg; browser MIME/extensions are not trusted.
        const normalized = await normalizeAudio(data),
          id = randomUUID();
        const path = await writePrivate(
          `assets/${id}.mp3`,
          normalized.data,
          "audio/mpeg",
        );
        a = {
          id,
          kind,
          path,
          mime: "audio/mpeg",
          bytes: normalized.data.length,
          hash: digest(normalized.data),
          duration: normalized.duration,
        };
      }
      await saveAsset(a);
      await del(pathname);
      await db().del(key("upload:" + pathname));
      return json(a);
    }
    if (p[0] === "script") {
      requireGeneration();
      if (!configuration().script)
        throw new Error("Chưa cấu hình công cụ viết lời thoại.");
      const { topic, duration, requestKey } = await req.json();
      assertDuration(duration);
      if (
        typeof topic !== "string" ||
        topic.trim().length < 5 ||
        topic.length > 1500
      )
        throw new Error("Nhập chủ đề từ 5 đến 1.500 ký tự.");
      const cacheKey = key("script:" + digest(Buffer.from(topic + duration)));
      const cached = await db().get(cacheKey);
      if (cached) return json(cached);
      if (
        !(await db().set(cacheKey + ":inflight", "pending", {
          nx: true,
          ex: 3600,
        }))
      )
        throw new Error(
          "Lời thoại này đang được tạo hoặc cần kiểm tra kết quả trước khi tạo lại.",
        );
      if (
        typeof requestKey !== "string" ||
        !(await db().set(key("aux:" + requestKey), "pending", {
          nx: true,
          ex: 3600,
        }))
      )
        throw new Error("Yêu cầu đã được gửi; hãy chờ kết quả.");
      await reserveAux(0.003);
      const response = await fetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-flash",
            thinking: { type: "disabled" },
            max_tokens: 1000,
            messages: [
              {
                role: "system",
                content: `Viết lời thoại tiếng Việt tự nhiên khoảng ${Math.round((duration - 2) * 3.0)} tiếng (đơn vị cách nhau bằng dấu cách), để đọc trong khoảng ${duration - 2} giây. Chỉ xuất lời thoại, có dấu câu, mỗi câu dưới 22 tiếng. Giữ đúng thông tin người dùng, không bịa giá, chứng nhận hoặc lợi ích sức khỏe. Kết thúc trọn câu, không tiêu đề, không chỉ dẫn sân khấu.`,
              },
              { role: "user", content: topic },
            ],
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Công cụ viết trả HTTP ${response.status}; không tự gọi lại có phí.`,
        );
      const result = await response.json(),
        text = result.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim())
        throw new Error("Công cụ viết chưa trả nội dung.");
      const receiptId = randomUUID();
      await db().set(key("preparation:" + receiptId), 0.003);
      const out = {
        text,
        receiptId,
        estimatedUsd: 0.003,
        usage: result.usage || null,
      };
      await db().set(cacheKey, out, { ex: 86400 });
      return json(out);
    }
    if (p[0] === "voice") {
      requireGeneration();
      if (!configuration().voice)
        throw new Error(
          "Chưa cấu hình giọng đọc tiếng Việt. Bạn có thể tải tệp giọng đọc.",
        );
      const { text, voice, requestKey } = await req.json();
      if (
        typeof text !== "string" ||
        !text.trim() ||
        Buffer.byteLength(text, "utf8") > 4000
      )
        throw new Error("Lời thoại cần từ 1 đến 4.000 byte UTF-8.");
      if (!["vi-VN-Standard-A", "vi-VN-Standard-B"].includes(voice))
        throw new Error("Giọng đọc không hợp lệ.");
      const hash = digest(Buffer.from(text + voice)),
        cached = await db().get<string>(key("voice:" + hash));
      if (cached) return json(await asset(cached));
      if (
        !(await db().set(key("voice:" + hash + ":inflight"), "pending", {
          nx: true,
          ex: 3600,
        }))
      )
        throw new Error(
          "Giọng này đang được tạo hoặc cần đối chiếu trước khi tạo lại.",
        );
      if (
        typeof requestKey !== "string" ||
        !(await db().set(key("aux:" + requestKey), "pending", {
          nx: true,
          ex: 3600,
        }))
      )
        throw new Error("Yêu cầu đã được gửi; hãy chờ kết quả.");
      await reserveAux([...text].length * 0.000004);
      const response = await fetch(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_TTS_API_KEY!,
          },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: "vi-VN", name: voice },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Giọng đọc trả HTTP ${response.status}; không tự gọi lại có phí.`,
        );
      const result = await response.json();
      if (typeof result.audioContent !== "string")
        throw new Error("Không có dữ liệu âm thanh.");
      const normalized = await normalizeAudio(
          Buffer.from(result.audioContent, "base64"),
        ),
        id = randomUUID(),
        path = await writePrivate(
          `assets/${id}.mp3`,
          normalized.data,
          "audio/mpeg",
        );
      const a: Asset = {
        id,
        kind: "audio",
        path,
        mime: "audio/mpeg",
        bytes: normalized.data.length,
        hash: digest(normalized.data),
        duration: normalized.duration,
        preparationUsd: [...text].length * 0.000004,
      };
      await saveAsset(a);
      await db().set(key("voice:" + hash), id, { ex: 86400 });
      return json(a);
    }
    if (p[0] === "quote") {
      requireGeneration();
      const { imageId, audioId, duration, kind, script, scriptReceipt } =
        await req.json();
      assertDuration(duration);
      if (!["motion", "talking"].includes(kind))
        throw new Error("Chọn loại video.");
      const image = await asset(imageId),
        audio = await asset(audioId);
      if (image.kind !== "image" || audio.kind !== "audio")
        throw new Error("Tệp chưa đúng loại.");
      const problem = timingError(audio.duration!, duration);
      if (problem) throw new Error(problem);
      const segments = planSegments(
        duration,
        kind as VideoKind,
        kind === "talking" ? await pauses(await readPrivate(audio.path)) : [],
      );
      const catalog = await liveCatalog(),
        rate = catalogRate(catalog, kind),
        cost = videoCost(segments, kind, rate),
        c = configuration();
      const prepared =
        (audio.preparationUsd || 0) +
        (typeof scriptReceipt === "string"
          ? (await db().get<number>(key("preparation:" + scriptReceipt))) || 0
          : 0);
      const q: Quote = {
        id: randomUUID(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
        imageId,
        audioId,
        duration,
        kind,
        model: kind === "motion" ? MODEL_MOTION : MODEL_TALKING,
        segments,
        videoUsd: cost,
        infraUsd: c.infraUsd,
        reserveUsd: reservation(cost, c.infraUsd),
        estimateUsd: cost + c.infraUsd + prepared,
        preparedCostsUsd: prepared,
        fx: c.fx,
        source: "live",
        rate,
        script: typeof script === "string" ? script.slice(0, 5000) : "",
      };
      await saveQuote(q);
      return json(q);
    }
    if (p[0] === "jobs" && p[1] && p[2] === "resume") {
      requireGeneration();
      const j = await job(p[1]);
      if (!j || j.stage !== "failed")
        throw new Error(
          "Chỉ tiếp tục tác vụ đã dừng và không có yêu cầu mơ hồ.",
        );
      if (
        j.segments.some(
          (s) => s.state === "unknown" || s.state === "submitting",
        )
      )
        throw new Error("Cần đối chiếu yêu cầu Phosor trước khi tiếp tục.");
      const runId = await db().get<string>(key("run:" + j.id));
      if (
        !runId ||
        !["completed", "failed", "cancelled", "canceled"].includes(
          await getRun(runId).status,
        )
      )
        throw new Error(
          "Workflow trước chưa xác nhận kết thúc. Hãy chờ rồi thử lại.",
        );
      const ok = await db().eval<unknown[], number>(
        `if redis.call('GET',KEYS[1]) then return 0 end;if redis.call('EXISTS',KEYS[2])==1 then return 0 end;redis.call('SET',KEYS[1],ARGV[1]);redis.call('SET',KEYS[2],'1');return 1`,
        [key("active"), key("resume:" + runId)],
        [j.id],
      );
      if (!ok)
        throw new Error("Tác vụ đã được tiếp tục hoặc đang có video khác.");
      j.stage = "queued";
      j.error = undefined;
      j.message = "Tiếp tục từ các đoạn đã lưu";
      await saveJob(j);
      try {
        const run = await start(createVideo, [j.id]);
        await db().set(key("run:" + j.id), run.runId);
      } catch {
        j.stage = "unknown";
        j.error = "Cần đối chiếu Workflow trước khi khởi chạy lại.";
        await saveJob(j);
      }
      return json(await job(j.id), 202);
    }
    if (p[0] === "jobs") {
      requireGeneration();
      const { quoteId, idempotencyKey, consent } = await req.json();
      if (
        typeof idempotencyKey !== "string" ||
        !/^[a-f0-9-]{36}$/.test(idempotencyKey) ||
        consent !== true
      )
        throw new Error("Cần duyệt quyền sử dụng ảnh, giọng và chi phí.");
      const existing = await db().get<string>(key("idem:" + idempotencyKey));
      if (existing) return json(await job(existing));
      const q = await getQuote(quoteId);
      if (!q || q.expiresAt < Date.now())
        throw new Error("Dự toán đã hết hạn. Hãy xem lại chi phí.");
      if (catalogRate(await liveCatalog(), q.kind) > q.rate + 1e-10)
        throw new Error("Giá đã thay đổi. Hãy xem lại dự toán.");
      const j: Job = {
        id: randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        quote: q,
        stage: "queued",
        progress: 0,
        message: "Đã xếp hàng",
        segments: q.segments,
        actualUsd: null,
        costNote: "Đang dùng dự toán. Chưa có số tiền thực tế từ nhà cung cấp.",
      };
      const id = await reserveJob(j, idempotencyKey);
      if (id !== j.id) return json(await job(id));
      try {
        const run = await start(createVideo, [j.id]);
        await db().set(key("run:" + j.id), run.runId);
      } catch {
        const current = await job(j.id);
        if (current) {
          current.stage = "unknown";
          current.error =
            "Chưa xác định Workflow đã nhận tác vụ hay chưa. Không tự khởi chạy lại.";
          await saveJob(current);
        }
      }
      return json(await job(j.id), 202);
    }
    return json({ error: "Không tìm thấy." }, 404);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Yêu cầu chưa hoàn tất." },
      400,
    );
  }
}
