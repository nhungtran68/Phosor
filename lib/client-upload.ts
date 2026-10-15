import { put } from "@vercel/blob/client";
import type { Asset } from "./types";

export async function requestJSON<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api/" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (response.status === 413)
      throw new Error(
        "Tệp gửi tới máy chủ quá lớn. Hãy tải lại trang rồi chọn lại ảnh.",
      );
    throw new Error(
      `Máy chủ chưa trả dữ liệu hợp lệ (HTTP ${response.status}). Hãy kiểm tra deployment và đăng nhập lại.`,
    );
  }
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? (data as { error: unknown }).error
        : null;
    throw new Error(
      typeof error === "string"
        ? error
        : `Yêu cầu chưa thành công (HTTP ${response.status}).`,
    );
  }
  return data as T;
}

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const mimes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
};
export function fileDetails(file: File, kind: "image" | "audio") {
  if (file.size === 0)
    throw new Error("Tệp đang trống. Hãy chọn lại ảnh hoặc âm thanh khác.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Dung lượng tệp tối đa 20 MB.");
  let ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (kind === "image" && imageTypes[file.type]) ext = imageTypes[file.type];
  const allowed =
    kind === "image"
      ? ["jpg", "jpeg", "png", "webp"]
      : ["mp3", "wav", "m4a", "aac", "ogg", "flac"];
  if (!allowed.includes(ext))
    throw new Error(
      kind === "image"
        ? "Chọn ảnh JPEG, PNG hoặc WebP. Với ảnh HEIC/HEIF trên iPhone, hãy xuất hoặc chia sẻ dưới dạng JPEG."
        : "Chọn tệp MP3, WAV, M4A, AAC, OGG hoặc FLAC.",
    );
  return { ext, mime: mimes[ext] };
}

export async function uploadAsset(
  file: File,
  kind: "image" | "audio",
): Promise<Asset> {
  const { ext, mime } = fileDetails(file, kind);
  const pathname = `uploads/${crypto.randomUUID()}.${ext}`;
  const multipart = file.size > 4 * 1024 * 1024;
  // Request the official SDK token event explicitly, preserving the server's
  // actionable error instead of SDK upload()'s generic "retrieve client token".
  const { clientToken } = await requestJSON<{ clientToken: string }>("upload", {
    type: "blob.generate-client-token",
    payload: { pathname, clientPayload: null, multipart },
  });
  if (
    typeof clientToken !== "string" ||
    !clientToken.startsWith("vercel_blob_client_")
  )
    throw new Error(
      "Máy chủ chưa cấp được quyền lưu ảnh. Hãy kiểm tra kết nối Vercel Blob.",
    );
  const blob = await put(pathname, file, {
    access: "private",
    token: clientToken,
    contentType: mime,
    multipart,
  });
  return requestJSON<Asset>("verify-upload", { pathname: blob.pathname, kind });
}
