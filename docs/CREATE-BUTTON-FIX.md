# Sửa luồng nút tạo video — 15/10/2026

Chế độ: triển khai theo phản hồi chủ Studio. Phạm vi: trang tạo video, giải thích điều kiện còn thiếu và đường dẫn thiết lập. Repository `nhungtran68/Phosor`, Vercel project `phosor`, workspace `dai-tai`, production `https://phosor.vercel.app`.

## Bằng chứng trước sửa

- Ảnh người dùng gửi thể hiện ảnh mới xem trước/chưa lưu, chế độ tự viết, loại chân dung nói, lời thoại trống. Chỉ có nút “Kiểm tra nội dung & chi phí” màu xám; không có nút tạo hiển thị.
- Source ở commit `13cfa87c26751bf6eb8563371a11382cbaeade64` chỉ render nút Tạo video khi đã có quote; nút lấy quote lại disabled nếu thiếu cấu hình/ảnh/âm thanh. Kết quả: người dùng gặp ngõ cụt.
- GET production `/` và `/api/config` trả HTTP 200. Config xác nhận `phosor=true`; `access`, `storage`, `script`, `voice`, `spend`, `ready`, `authenticated` đều false. Hạn mức ngày/video bằng 0.
- Vercel metadata môi trường production, đọc với `decrypt=false`, chỉ có tên `PHOSOR_API_KEY`. Không đọc giá trị khóa. Các truy vấn project ID không thêm scope đã thành công; lỗi 403 của lần trước không còn là lý do thiếu thông tin cấu hình.
- Không có quyền chi phí mới hoặc hạn mức kiểm thử AI được cấp. Không gọi AI trả phí.

## Thay đổi

- Nút Tạo video nổi bật trong ô chi phí và thanh cố định cuối màn hình, không bị giấu khi chưa có quote. Chỉ khóa ngắn hạn khi đang thực hiện thao tác.
- Bấm nút mở cửa sổ có các mục còn thiếu, với thao tác đến đúng phần đăng nhập, thiết lập, ảnh, lời thoại, giọng hoặc thời lượng. Không tự mua bước viết lời thoại/giọng chỉ vì bấm nút này.
- Khi đủ điều kiện, tải giá và mở dự toán. Chỉ nút Xác nhận tạo video sau khi tích đồng ý mới gọi API jobs. Dự toán hết hạn được lấy lại, cần duyệt lại. Tác vụ đang chạy hoặc trạng thái chưa rõ dẫn về tiến trình thay vì gửi thêm.
- Khóa thao tác đồng bộ bằng ref để tránh hai sự kiện nhanh vượt qua state update. Giữ nguyên idempotency, kiểm quyền, ngân sách và xử lý tác vụ trên máy chủ.
- Các nút viết/tạo giọng/tải giọng trả hướng dẫn rõ thay vì disabled âm thầm. Reset input âm thanh để có thể chọn lại cùng tệp sau lỗi.
- Thiết lập có danh sách biến, mục đích, hướng dẫn môi trường Production/Redeploy, link Vercel và nút đọc lại trạng thái. Không có ô nhập secret trên trang công khai.
- CSS riêng cho dock/dialog. Dock khớp breakpoint sidebar 1200/900/720px, có khoảng trống cuối trang và safe-area. Dialog có nhãn, đóng bằng nút/Escape, cuộn nội dung; dùng hành vi focus/modal bản địa.

## Kiểm tra và giới hạn

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| TypeScript | Đạt `npm run typecheck` |
| Kiểm thử tự động | Đạt 21/21: 14 kiểm tra đã có + 7 kiểm tra luồng tạo |
| Build production | Đạt `npm run build`; 22 Workflow steps/1 workflow giữ nguyên |
| Nút luôn có | SSR xác nhận nút trong dock và ô chi phí có mặt, không disabled khi chưa config/ảnh/quote |
| Các điều kiện chặn | Kiểm tra cấu hình production quan sát được, đăng nhập, ảnh chưa lưu, văn bản chưa có giọng và thời lượng sai |
| Hai chế độ × ba thời lượng | Kiểm thử preflight auto/existing cho 30/40/60 giây với audio đúng thời lượng |
| Tệp giọng có sẵn | Không bắt buộc DeepSeek/Google TTS khi đã có audio hợp lệ |
| Đồng ý phí | Nút xác nhận không xuất hiện khi có blocker, không có quote hoặc đang có tác vụ; khóa trước khi đồng ý và khi đang gửi |
| Giao diện trên trình duyệt/mobile | Chưa thực hiện được QA trình duyệt; kiểm mã/SSR không thay cho thao tác DOM hoặc ảnh sau sửa |
| Upload/AI production | Chưa kiểm được do thiếu các kết nối và hạn mức nêu trên; chưa xác nhận khóa Phosor hợp lệ |
| CapCut/thiết bị thật | Chưa kiểm trong lần sửa này |
| URL/SEO | Không đổi route, metadata, robots, liên kết kết quả hoặc API máy chủ; URL production đã xác minh trước sửa |
| Hiệu năng | Chưa đo lab/CWV. Không thêm dependency/font/ảnh/dịch vụ trong bản sửa |

Kiểm tra sau khi push: đợi Vercel READY trên đúng commit, GET trang và config, xác nhận HTML/CSS có dock/nút mới. Bằng chứng triển khai/HTTP được báo riêng, không coi đó là bằng chứng bấm tạo video thật thành công.

## Hoàn tác

Mốc trước: commit `13cfa87c26751bf6eb8563371a11382cbaeade64`. Có thể revert riêng commit sửa nút tạo; xem diff và head mới trước khi revert, giữ thay đổi người dùng phát sinh sau. Không đổi môi trường, store, dữ liệu, khóa hoặc ngân sách của tài khoản trong bản sửa này.
