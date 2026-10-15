# Sửa tải ảnh — 15/10/2026

## Vấn đề xác minh từ mã

- Nút chọn ảnh bị disabled nếu chưa đăng nhập hoặc thiếu một trong ba biến Blob/Redis. Người dùng không thể chọn ảnh để xem trước và không biết nút đang chờ điều kiện nào.
- SDK `upload()` thay lỗi từ endpoint cấp token bằng thông báo chung “Failed to retrieve the client token”, làm mất nguyên nhân cấu hình/session.
- `Redis.fromEnv()` chỉ đọc tên UPSTASH_*, trong khi kết nối Vercel có thể dùng cặp KV_REST_API_URL/KV_REST_API_TOKEN.
- Chọn lại cùng tệp sau lỗi không phát `change` vì input cũ chưa được reset. Ảnh camera có MIME JPEG nhưng tên không có phần mở rộng quen thuộc bị loại sớm.

## Thay đổi

Cho phép chọn/xem trước ảnh trên thiết bị; hiển thị “chưa lưu” cho đến khi server xác minh xong. Lấy config mới trước lưu, giữ auth, size, MIME, xử lý ảnh và cloud upload ở máy chủ. Khi thiếu cấu hình, nêu tên biến trong Thiết lập; không hiển thị giá trị secret. Ảnh chưa lưu không mở được bước tạo có phí.

Dùng event cấp client token chính thức của Blob SDK rồi `put()` với token phạm vi tệp, để giữ thông báo lỗi JSON từ server. Tệp vẫn đi trực tiếp Blob; không đưa ảnh 20 MB qua Vercel Function. Hỗ trợ hai cặp tên Redis, chỉ dùng một cặp đầy đủ để tránh trộn URL/token khác kết nối. Reset file input sau lựa chọn và nhận JPEG/PNG/WebP bằng MIME, vẫn xác minh nội dung thật ở server.

14 kiểm tra qua, bao gồm 6 kiểm tra mới: picker chưa login/storage, MIME camera, aliases Redis, thiếu cấu hình trước external call, bảo toàn lỗi token và HTTP HTML quá dung lượng. Production build/TypeScript qua. Không chạy tạo video có phí.

## Giới hạn nghiệm thu

Chưa đọc được cấu hình hoặc log Vercel do 403 ở workspace dai-tai. Chưa có URL ứng dụng trực tiếp từ người dùng hoặc phép thử upload có session. Bản sửa giải quyết các lỗi mã xác minh được, không chứng minh store/token trên production đã được cấu hình đúng. Kiểm tra thực tế cần mở website, đăng nhập, chọn ảnh, xác nhận “Ảnh đã được lưu”, tải lại và xem lại ảnh; nếu có lỗi gửi đúng dòng thông báo để đối chiếu.
