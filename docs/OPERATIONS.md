# Vận hành và hoàn tác

- Mỗi job có quote, segment, requestId, blob path, stage và tiến trình Redis `phosor:v1:job:<id>`. Workflow run lưu riêng ở `phosor:v1:run:<id>` để tránh ghi đè stage khi worker đã chạy.
- `phosor:v1:active` không có TTL tự hết: một yêu cầu mơ hồ tuyệt đối không được tự mở khóa để gửi tiếp và tính tiền trùng. Mục tiêu ưu tiên tránh phát sinh phí hơn tự phục hồi thiếu bằng chứng.
- Nếu `unknown`: mở lịch sử Phosor bằng chính tài khoản/key, so sánh giờ gửi/ảnh/model/seed, đối chiếu Workflow run. **Không xóa submit marker và bấm lại.** Khi tìm được request_id chính xác, quản trị viên chỉ gắn request_id/state vào segment và chuyển về failed sau khi chắc chắn run trước đã terminal; sau đó dùng “Tiếp tục từ đoạn đã lưu”. Nếu không đủ bằng chứng, giữ trạng thái chờ kiểm tra.
- Khi `failed` do đọc hoặc ghép, nút tiếp tục kiểm run cũ đã kết thúc và giành lại slot atomically. Các segment có request_id được poll tiếp; segment đã done không bị submit lại. Provider báo failed vẫn được giữ request_id, không tự tạo lại phần đó. Muốn tạo lại có phí phải duyệt tác vụ/dự toán mới.
- Ngân sách ngày tính giờ Việt Nam, giữ trước theo micro-USD; LLM/TTS và render cùng dùng một ledger. Giữ chỗ **không tự hoàn trả** nếu chưa có chứng từ thực tế. Tránh giả định provider tự hoàn tiền. Đây là trần dự toán API của ứng dụng, không phải trần hóa đơn Vercel/Google/Redis.
- Xem log chỉ theo jobId/stage. Không log prompt, ảnh, giọng, key, cookie hoặc body phản hồi lỗi provider. Dashboard Workflow và Redis có nội dung riêng tư, chỉ cấp quyền cho chủ tài khoản.
- Chưa triển khai tự xóa/TTL tệp. Theo dõi Blob usage. Muốn xóa một job: dừng khi terminal, xóa các blob `jobs/<id>/...`, record Redis job/run, và list id tương ứng. Asset có thể được nhiều job tham chiếu: chỉ xóa khi không còn tham chiếu. Provider có thể có chính sách giữ dữ liệu riêng.
- Đổi APP_PASSWORD **và** SESSION_SECRET để thu hồi mọi phiên. Lưu key riêng cho Preview/Production. Giữ `GENERATION_ENABLED=false` trong preview/CI.
- Hoàn tác: Vercel promote/rollback về deployment đã xác minh hoặc revert commit GitHub rồi redeploy. Không xóa Redis/Blob khi rollback. Không đổi tên/path workflow khi còn job đang chạy; run được ghim vào deployment hiện hành lúc khởi tạo.

## Mẫu test có phí cần duyệt sau

Ảnh sản phẩm có quyền dùng + giọng đã thu: 30s H3 dự toán khoảng **3.770đ** theo giả định hạ tầng/tỷ giá hiện tại; không TTS/LLM. Thêm 1 mẫu người nói 30s khoảng **12.000–13.000đ** tùy phân đoạn. Đây là đề xuất ngân sách, chưa phải quyền chạy. Kiểm trọn video, giọng Việt, giữ nhân vật, lệch khẩu hình, thời gian xử lý, số dư trước/sau; sau đó thử tải trên Android/iPhone và import/export CapCut. Chỉ mở rộng sau khi mẫu đầu qua.
