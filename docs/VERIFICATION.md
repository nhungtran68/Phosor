# Kiểm thử ngày 15/10/2026

Luồng cần xác minh: giao diện tải ảnh/lời thoại → API bảo vệ → Redis/Blob → Workflow → Phosor → FFmpeg → trình xem và tải MP4.

## Đã kiểm

- TypeScript `npm run typecheck`: qua.
- Next.js production build: qua; có trang `/`, API catch-all, Workflow flow và webhook; workflow được compiler nhận diện.
- Test chính sách/API không trả phí: 8/8 qua. Bao gồm timeline 30/40/60, giới hạn H3, frame S2V, cắt tại pause, từ chối audio lệch thời lượng, schema/model dọc, chặn URL bất kỳ, không gọi paid provider khi thiếu cấu hình, auth và origin.
- Đăng nhập: cookie Secure/HttpOnly/SameSite=Strict, đúng/sai mật khẩu và phiên được kiểm bằng request nội bộ.
- Dependency audit production sau override nanoid 5.1.16 trong @workflow/core: **0 lỗ hổng** theo npm audit.
- Dữ liệu chính thức Phosor: GET models/pricing/OpenAPI HTTP 200; chưa dùng dữ liệu model/pricing trong skill làm giá live.

## Kiểm file MP4 tổng hợp

| Mốc | Số đoạn | Track hình/tiếng | Kết quả |
| --- | --- | --- | --- |
| 30s | 2 | 30 / 30 giây | 5.748.254 byte, full decode và faststart qua |
| 40s | 3 | 40 / 40 giây | 7.677.061 byte, full decode và faststart qua |
| 60s | 4 | 60 / 60 giây | 11.512.369 byte, full decode và faststart qua |

Cả ba: H.264, AAC, yuv420p, 576×1024 đúng 9:16, 24 fps, start_time=0. Không dùng -shortest hoặc time-stretch. Tệp lớn hơn 4,5MB cho thấy cần stream/Blob, không trả MP4 bằng JSON/body buffer.

Bundle API được Next trace khoảng 190,4 MiB, gồm FFmpeg Linux và FFprobe Linux x64, dưới giới hạn thông thường 250 MB; bundle Workflow thực tế trên Vercel chưa được đóng gói/đo.

## Chưa kiểm và lý do

| Phần | Trạng thái |
| --- | --- |
| Giao diện tương tác trong trình duyệt, responsive thực tế | Chưa kiểm: môi trường thiếu browser-control được hỗ trợ cho preview; không thay thế bằng kết luận từ build |
| Upload Phosor có xác thực / submit / poll / phí thật | Chưa kiểm: không có key hoặc ngân sách |
| DeepSeek tiếng Việt và giọng Google thực tế | Chưa kiểm: không có key hoặc ngân sách |
| Upload Blob/private download/Range thực tế | Chưa kiểm: chưa có store/credentials |
| Redis Lua concurrent/idempotency và reload đang chạy | Chưa kiểm tích hợp: chưa có Redis |
| Workflow và FFmpeg trên Vercel | Chưa kiểm: quyền Vercel trả 403 |
| Hai chế độ lời thoại × ba thời lượng xuyên toàn hệ thống | Chưa kiểm live; chính sách timeline được kiểm độc lập |
| Chất lượng hình/nhép miệng/giữ nhân vật | Chưa benchmark; không có mẫu AI đã tạo |
| Phát trên iPhone/Android, CapCut/Facebook | Chưa có thiết bị/session tương ứng |

Không có video người dùng giả, kết quả mock hoặc URL triển khai giả. Các test tổng hợp chỉ chứng minh pipeline codec/thời lượng, không chứng minh chất lượng AI, lời nói hoặc tương thích CapCut.
