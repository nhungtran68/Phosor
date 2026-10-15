import type { configuration } from "./config";
import { timingError } from "./policy";
import type { Asset, Duration } from "./types";

export type StudioConfig = ReturnType<typeof configuration> & {
  authenticated: boolean;
};
export type CreateIssue = {
  id: string;
  message: string;
  action: "settings" | "login" | "image" | "topic" | "script" | "voice" | "audio" | "duration" | "refresh";
  label: string;
};
export type CreateDraft = {
  image: Asset | null;
  audio: Asset | null;
  hasLocalImage: boolean;
  mode: "auto" | "existing";
  source: "text" | "audio";
  text: string;
  duration: Duration;
};

/** Read-only preflight. Choosing the create button must never buy preparation. */
export function creationIssues(config: StudioConfig | null, draft: CreateDraft): CreateIssue[] {
  const issues: CreateIssue[] = [];
  const setting = (id: string, message: string) =>
    issues.push({ id, message, action: "settings", label: "Mở thiết lập" });
  if (!config) {
    issues.push({ id: "config", message: "Chưa đọc được trạng thái kết nối của Studio.", action: "refresh", label: "Kiểm tra lại" });
  } else {
    if (!config.access) setting("access", "Chưa thiết lập mật khẩu để bảo vệ Studio.");
    else if (!config.authenticated)
      issues.push({ id: "login", message: "Đăng nhập Studio để lưu ảnh và tạo video.", action: "login", label: "Đăng nhập" });
    if (!config.storage) setting("storage", "Chưa kết nối nơi lưu ảnh, âm thanh và tiến trình.");
    if (!config.phosor) setting("phosor", "Chưa kết nối khóa API Phosor để tạo video.");
    if (!config.spend) setting("spend", "Chưa đặt hạn mức chi phí và mở tạo video.");
    if (!draft.audio && !(draft.mode === "existing" && draft.source === "audio")) {
      if (draft.mode === "auto" && !draft.text.trim() && !config.script)
        setting("script-api", "Chế độ tự viết lời thoại cần kết nối DeepSeek.");
      if (!config.voice) setting("voice-api", "Tạo giọng từ văn bản cần kết nối ElevenLabs. Bạn cũng có thể tải giọng đọc có sẵn.");
    }
  }
  if (!draft.image)
    issues.push({ id: "image", message: draft.hasLocalImage ? "Ảnh mới được xem trước, chưa lưu lên máy chủ." : "Bạn chưa chọn ảnh cho video.", action: "image", label: draft.hasLocalImage ? "Đến bước lưu ảnh" : "Chọn ảnh" });
  if (!draft.audio) {
    if (draft.mode === "existing" && draft.source === "audio")
      issues.push({ id: "audio", message: "Bạn chưa tải tệp giọng đọc.", action: "audio", label: "Đến bước tải giọng" });
    else if (!draft.text.trim())
      issues.push({ id: "script", message: "Cần có lời thoại trước khi tạo giọng đọc.", action: draft.mode === "auto" ? "topic" : "script", label: "Chuẩn bị lời thoại" });
    else
      issues.push({ id: "voice", message: "Lời thoại đã có. Hãy tạo giọng và nghe thử trước.", action: "voice", label: "Đến bước tạo giọng" });
  } else {
    const timing = timingError(draft.audio.duration ?? 0, draft.duration);
    if (timing) issues.push({ id: "timing", message: timing, action: "duration", label: "Chỉnh giọng hoặc thời lượng" });
  }
  return issues;
}
