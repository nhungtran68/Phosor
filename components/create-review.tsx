"use client";
import { useEffect, useRef } from "react";
import type { CreateIssue } from "@/lib/create-flow";
import type { Duration, Quote } from "@/lib/types";

type Props = {
  open: boolean;
  busy: string;
  issues: CreateIssue[];
  quote: Quote | null;
  duration: Duration;
  consent: boolean;
  error: string;
  hasActiveJob: boolean;
  onClose: () => void;
  onResolve: (action: CreateIssue["action"]) => void;
  onReview: () => void;
  onConsent: (value: boolean) => void;
  onCreate: () => void;
  onProgress: () => void;
};
const money = (usd: number, fx: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(usd * fx);

export function CreateReview(p: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (p.open && dialog && !dialog.open) dialog.showModal();
    if (!p.open && dialog?.open) dialog.close();
  }, [p.open]);
  const blocked = p.issues.length > 0;
  return (
    <dialog ref={ref} className="create-dialog" aria-labelledby="create-review-title" onClose={p.onClose}>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">VIDEO {p.duration} GIÂY</span>
          <h2 id="create-review-title">{p.hasActiveJob ? "Video đang được xử lý" : blocked ? "Hoàn tất các bước để tạo video" : "Xem lại và tạo video"}</h2>
        </div>
        <button className="dialog-close" aria-label="Đóng xem trước" onClick={p.onClose}>×</button>
      </div>
      {p.error && <p className="review-error" role="alert">{p.error}</p>}
      {p.hasActiveJob ? (
        <>
          <p>Studio đang giữ một tác vụ. Mở tiến trình để theo dõi; không gửi thêm tác vụ trùng.</p>
          <button className="primary-button" onClick={p.onProgress}>Xem tiến trình video</button>
        </>
      ) : blocked ? (
        <>
          <p className="dialog-description">Chưa gửi tạo video. Các mục cần hoàn tất ở bên dưới; bấm vào từng mục để sửa.</p>
          <ul className="create-issues">
            {p.issues.map((issue) => (
              <li key={issue.id}>
                <span>{issue.message}</span>
                <button className="secondary-button" disabled={!!p.busy} onClick={() => p.onResolve(issue.action)}>{issue.label}</button>
              </li>
            ))}
          </ul>
        </>
      ) : p.quote ? (
        <>
          <p className="dialog-description">Ảnh đã lưu · giọng đọc đã đo · {p.quote.segments.length} đoạn video · khung dọc 9:16.</p>
          <div className="review-total"><span>Tổng chi phí ước tính</span><strong>{money(p.quote.estimateUsd, p.quote.fx)}</strong></div>
          <p>Gồm lời thoại, giọng đọc đã chuẩn bị và phần tạo video còn lại khoảng <strong>{money(p.quote.reserveUsd, p.quote.fx)}</strong>. Đây là dự toán, chưa phải phí thực tế.</p>
          <label className="consent">
            <input type="checkbox" checked={p.consent} onChange={(e) => p.onConsent(e.target.checked)} />
            <span>Tôi có quyền dùng ảnh, giọng này và đồng ý chi phí tạo video còn lại.</span>
          </label>
          {!p.consent && <p className="consent-help">Tích ô đồng ý phía trên để mở nút xác nhận.</p>}
          <button className="primary-button confirm-create" disabled={!!p.busy || !p.consent} onClick={p.onCreate}>
            {p.busy === "render" ? "Đang gửi tác vụ…" : "Xác nhận tạo video"}
          </button>
          <p className="dialog-footnote">MP4 576 × 1024 từ nguồn 480p. Giá có hiệu lực 10 phút.</p>
        </>
      ) : (
        <>
          <p role="status">{p.busy ? "Đang kiểm tra nội dung và giá hiện tại…" : "Ảnh và giọng đã sẵn sàng. Kiểm tra giá trước khi xác nhận tạo."}</p>
          {!p.busy && <button className="primary-button" onClick={p.onReview}>Kiểm tra chi phí</button>}
        </>
      )}
    </dialog>
  );
}
