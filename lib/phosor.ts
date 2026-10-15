import { MODEL_MOTION, MODEL_TALKING } from "./policy";
import type { VideoKind } from "./types";
const BASE = "https://phosor.ai";
export async function phosor(path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { ...init.headers, "X-API-Key": process.env.PHOSOR_API_KEY || "" },
    signal: AbortSignal.timeout(60000),
    redirect: "error",
    cache: "no-store",
  });
  if (!r.ok)
    throw new Error(
      `Phosor trả lỗi HTTP ${r.status}. ${r.status === 402 ? "Số dư không đủ; hệ thống không tự nạp tiền." : r.status === 429 ? "Đã chạm giới hạn tác vụ; không gửi lại tự động." : ""}`,
    );
  return r.json();
}
export async function uploadPhosor(
  data: Buffer,
  mime: string,
  name: string,
): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(data)], { type: mime }), name);
  const r = await phosor("/api/v1/storage/image/upload", {
    method: "POST",
    body: form,
  });
  if (typeof r.s3_key === "string") return r.s3_key;
  if (typeof r.s3_url === "string") {
    const path = new URL(r.s3_url).pathname.replace(/^\//, "");
    if (/^(images|audio)\//.test(path)) return path;
  }
  throw new Error(
    "Phosor không trả khóa lưu trữ đúng schema; chưa gửi tạo video.",
  );
}
export async function liveCatalog() {
  const [m, p] = await Promise.all([
    fetch(BASE + "/api/v1/models", {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    }),
    fetch(BASE + "/api/v1/pricing/config", {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    }),
  ]);
  if (!m.ok || !p.ok)
    throw new Error(
      "Không đọc được danh sách mô hình hoặc giá Phosor hiện hành.",
    );
  return {
    models: (await m.json()).models as Array<{
      model_id: string;
      metadata: Record<string, unknown>;
    }>,
    pricing: await p.json(),
    checkedAt: Date.now(),
  };
}
export function catalogRate(
  c: Awaited<ReturnType<typeof liveCatalog>>,
  kind: VideoKind,
) {
  const id = kind === "motion" ? MODEL_MOTION : MODEL_TALKING;
  const model = c.models.find((m) => m.model_id === id);
  if (!model) throw new Error("Mô hình đã chọn không còn được Phosor công bố.");
  if (kind === "motion") {
    const ratios = model.metadata.supported_aspect_ratios;
    if (!Array.isArray(ratios) || !ratios.includes("9:16"))
      throw new Error("Mô hình chưa công bố hỗ trợ khung dọc.");
  }
  const rate =
    kind === "motion"
      ? c.pricing.minimax_h3_pricing?.base_per_second?.["480p"]
      : c.pricing.frame_prices?.s2v?.["480p"];
  if (typeof rate !== "number" || rate <= 0)
    throw new Error("Schema giá Phosor thay đổi; cần kiểm tra trước khi tạo.");
  return rate;
}
// Only provider-returned URLs reach this function; never accept URLs from the browser.
export async function downloadProvider(
  url: string,
  max = 100 * 1024 * 1024,
): Promise<Buffer> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    ![
      "phosor.ai",
      ".phosor.ai",
      ".amazonaws.com",
      ".cloudfront.net",
      ".r2.cloudflarestorage.com",
    ].some((s) =>
      s.startsWith(".") ? u.hostname.endsWith(s) : u.hostname === s,
    )
  )
    throw new Error("Máy chủ kết quả chưa thuộc danh sách được phép.");
  const r = await fetch(u, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok || !r.body) throw new Error("Không tải được kết quả từ Phosor.");
  if (Number(r.headers.get("content-length")) > max)
    throw new Error("Kết quả vượt dung lượng cho phép.");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  for await (const p of r.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += p.byteLength;
    if (bytes > max) throw new Error("Kết quả vượt dung lượng cho phép.");
    parts.push(p);
  }
  return Buffer.concat(parts);
}
