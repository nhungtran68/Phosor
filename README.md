# Phosor Studio

Website cá nhân tiếng Việt: **tải ảnh → chọn lời thoại → 30/40/60 giây → duyệt nội dung và chi phí → tạo → xem và tải MP4**.

**Trạng thái 15/10/2026:** mã nguồn build được. GitHub đã nhận trạng thái Vercel “Deployment has completed” cho bản đầu ở workspace `dai-tai`; quyền API cấu hình/log vẫn trả **403 Forbidden**, nên chưa nghiệm thu upload và tạo video AI trên bản chạy thật. Không mặc định các khóa đã đúng, đủ số dư hoặc ngân sách đã được cấp. Hệ thống mặc định chặn mọi thao tác tạo có phí. Không dùng kết quả giả làm video đã tạo.

**Bản sửa tải ảnh:** cho phép chọn và xem ảnh trên thiết bị trước khi đăng nhập/cấu hình cloud, phân biệt rõ ảnh chưa lưu và đã lưu. Chỉ ảnh lưu/kiểm tra thành công mới được gửi tạo video. Hiển thị chính xác lỗi cấp quyền upload và tên cấu hình còn thiếu; hỗ trợ Redis được Vercel đặt tên `KV_REST_API_URL`/`KV_REST_API_TOKEN`.

## Tính năng

- Hai lựa chọn lời thoại chính: **Hệ thống tự tạo** bằng chủ đề (DeepSeek Flash, cho sửa trước TTS); **Dùng lời thoại có sẵn** bằng văn bản hoặc tệp âm thanh.
- Giọng Việt Google Standard; tải âm thanh dùng chính giọng trong tệp, không gọi TTS.
- Phân biệt **ảnh chuyển động + thuyết minh** và **chân dung nói nhép miệng**; không gọi ghép tiếng là lip-sync.
- 30, 40, 60 giây. H3 chia clip 4–15 giây; lấy khung cuối clip trước làm đầu vào tiếp để giảm nhảy cảnh. Wan S2V chia tại khoảng nghỉ đã đo, tối đa 161 frame/clip.
- Trình xem ảnh, nghe giọng trước, đo thời lượng thật, từ chối audio quá dài/ngắn. Không time-stretch; chỉ thêm tối đa 3 giây im lặng ở cuối. Không lặp video để bù thiếu.
- Video nguồn 480p; xuất **576×1024** dọc 9:16 có thay đổi kích thước/padding, **không quảng cáo là HD gốc**. MP4 H.264/yuv420p, AAC 48 kHz, 24 fps CFR, faststart. Kiểm hình/tiếng/thời lượng ±0,2s và full decode.
- Tải trực tiếp lên Vercel Blob riêng tư (20 MB), kiểm nội dung thật ở máy chủ. Ảnh được loại metadata; audio được decode và chuẩn hóa.
- Tiến trình/lịch sử trong Redis, Workflow bền; tải lại hoặc đóng trang không hủy tác vụ. Tệp kết quả được sao chép khỏi URL tạm Phosor.
- Mật khẩu riêng, cookie HttpOnly/SameSite, kiểm origin, rate limit đăng nhập, giới hạn 50 upload/ngày. Một render đang hoạt động cho tài khoản.
- Redis Lua giữ ngân sách ngày, hạn mức từng video, khóa idempotency trước gửi, giá live trước duyệt và từng đoạn. Không tự mua gói/nạp tiền/chuyển model.
- Submit Phosor **không tự retry**. Timeout mơ hồ thành `unknown`, giữ khóa để đối chiếu. Chỉ retry đọc 2 lần và ghép 1 lần. Giữ đoạn thành công; tác vụ dừng có thể tiếp tục mà không tạo lại các đoạn đã có request_id.

## Chạy trên máy

Node.js 22 hoặc 24, FFmpeg/FFprobe đóng gói trong dependency. Chỉ dùng `.env.local` tại máy hoặc secret trên Vercel; không commit.

```bash
npm ci
cp .env.example .env.local
npm run typecheck
npm test
npm run build
npm run dev
```

Kiểm file MP4 bằng nội dung tổng hợp không mất tiền AI:

```bash
# Linux có FFmpeg hệ thống; đặt đường dẫn tương ứng nếu hệ điều hành khác.
FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe npm run test:media
```

## Triển khai

1. Cấp quyền cho kết nối Vercel vào đúng workspace đang chứa dự án; lần tra cứu mới nhất là **dai-tai**. Không cần cấp thêm GitHub cho mã nguồn nếu repository đã truy cập được.
2. Vercel → **Add New Project → Import `nhungtran68/Phosor`**. Framework Next.js; root là thư mục gốc repository; Node 22/24; Build `npm run build`; Install `npm ci`. Repo không phải monorepo.
3. Bật **Settings → Environment Variables → Enable access to System Environment Variables**. Workflow 5 cần `VERCEL_DEPLOYMENT_ID` ở cả build và runtime; không tự đặt ID giả.
4. Kết nối một **Vercel Blob store private** và **Upstash Redis**. Không tự đổi gói. Các biến máy chủ:

| Biến | Mục đích |
| --- | --- |
| `APP_PASSWORD` | Mật khẩu chủ Studio, nên tối thiểu 16 ký tự |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự; thay sẽ đăng xuất phiên cũ |
| `PHOSOR_API_KEY` | Khóa Phosor trong Settings → API Keys |
| `BLOB_READ_WRITE_TOKEN` | Store private trên Vercel Blob |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST credential |
| `DEEPSEEK_API_KEY` | Cần cho lời thoại tự tạo; model đã kiểm tra tài liệu: `deepseek-flash` |
| `GOOGLE_TTS_API_KEY` | Cần cho văn bản → giọng Việt; hạn chế key chỉ Cloud Text-to-Speech API ở máy chủ |
| `GENERATION_ENABLED` | Mặc định `false`; chỉ chuyển `true` sau khi chủ tài khoản duyệt ngân sách |
| `DAILY_BUDGET_USD` | Trần dự toán giữ chỗ mỗi ngày giờ Việt Nam; mặc định 0 |
| `MAX_JOB_USD` | Trần dự toán tạo video mỗi tác vụ; mặc định 0 |
| `INFRA_ESTIMATE_USD` | Giả định chi phí ghép/Workflow/Redis/Blob/egress, mặc định $0,01/video; thay bằng chi phí đo được |
| `USD_VND` | Tỷ giá giả định hiển thị, mặc định 26.000; không phải tỷ giá thẻ được xác minh |

5. Không đặt bất kỳ secret nào dưới tên `NEXT_PUBLIC_*`. Không chia sẻ key trong chat/log. Chỉ cấp các biến có phí cho môi trường đã duyệt; Preview nên giữ generation tắt.
6. Deploy production. Kiểm READY/build log, mở URL, đăng nhập, xem trạng thái kết nối; chạy một mẫu thật **sau khi có ngân sách rõ ràng**, đối chiếu hóa đơn. Chưa có ngân sách không chạy test tính phí.

Chưa có URL ứng dụng được kiểm tra trực tiếp trong phiên làm việc. GitHub báo deploy thành công ở `dai-tai`; lỗi 403 là từ API cấu hình/log Vercel. Không tự tạo workspace khác để né lỗi quyền.

## Dùng Studio

1. Đăng nhập. Tải ảnh JPEG/PNG/WebP rõ nét.
2. Chọn đúng hai chế độ lời thoại. Nếu tự tạo: nhập chủ đề, chọn thời lượng, viết và sửa lời thoại. Nếu có sẵn: dán văn bản hoặc tải file giọng đọc.
3. Với văn bản, tạo giọng và nghe thử; chỉnh lại nếu thời lượng chưa phù hợp. Với tệp, xem thời lượng đã đo.
4. Chọn ảnh chuyển động hoặc chân dung nhép miệng. Kiểm chi phí trực tiếp; dự toán có hiệu lực 10 phút.
5. Duyệt quyền ảnh/giọng và chi phí còn lại, bấm Tạo video một lần. Mở Lịch sử để theo dõi và tải MP4.

## Chi phí và giới hạn đã biết

Xem [quyết định mô hình, dự toán, nguồn và giới hạn](docs/DECISIONS.md), [kết quả kiểm thử](docs/VERIFICATION.md) và [vận hành/đối chiếu](docs/OPERATIONS.md).

Chi phí giữ chỗ là **dự toán**, không phải hóa đơn thực tế. Phosor chưa được kiểm tra trực tiếp về trường usage/actual. Khóa ứng dụng không bảo đảm chặn được hóa đơn hạ tầng vượt dự toán; cần đặt spend limit tại nhà cung cấp. Không giả định credit miễn phí hay hoàn phí thất bại. Không giải phóng ngân sách đã giữ nếu chưa đối chiếu rõ.

API/ảnh/giọng và dữ liệu đều thuộc một chủ Studio. Không mở đăng ký công khai hoặc bán SaaS từ bản này. Không tự xóa tệp cũ để tránh mất kết quả ngoài ý muốn; chủ tài khoản theo dõi dung lượng và dọn theo [hướng dẫn vận hành](docs/OPERATIONS.md).
