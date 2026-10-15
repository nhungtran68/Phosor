# Quyết định mô hình và chi phí — 15/10/2026, Asia/Ho_Chi_Minh

Mục tiêu: video ảnh dọc 30/40/60s có thuyết minh tiếng Việt, nguồn 480p, xuất MP4 phát được. **Chưa có ứng viên qua benchmark chất lượng thực tế**, vì chưa có khóa và ngân sách chạy có phí. H3 thường là mặc định ứng viên theo API/giá hiện hành, chưa gọi là rẻ nhất trên một đầu ra đạt chuẩn đã đo.

## Bằng chứng trực tiếp

Đã GET thành công HTTP 200 và lưu snapshot vào `docs/evidence/`:

- https://phosor.ai/api/v1/models — model IDs và metadata thực tế.
- https://phosor.ai/api/v1/pricing/config — giá thực tế, 10 credit = $1.
- https://phosor.ai/openapi.json — OpenAPI tự công bố version 0.2.0. Skill version 1.3.3 ghi API v1.2.3; không coi hai nhãn này là cùng một phiên bản.

Schema OpenAPI có điểm thiếu/khác skill: audio upload dùng multipart field `image` theo client chính thức trong skill; upload trả `s3_key` hoặc `s3_url` trong hai tài liệu; S2V audio_url có trong skill nhưng thiếu trong OpenAPI. Mã không thử endpoint tự đoán. Chưa kiểm authenticated upload/submit thực tế.

## So sánh ảnh chuyển động cùng hồ sơ

| Model | Đơn giá hiện hành | 30s, phần video | Nhận xét |
| --- | --- | --- | --- |
| `minimax/h3/image-to-video` | $0,0045/giây 480p | $0,135 | Có khung 9:16, clip 4–15s, 24 fps; ứng viên mặc định |
| `wan/v2.2-a14b/image-to-video/turbo` | $0,0003125/frame 480p | khoảng $0,151 | 16 fps, giới hạn/align frame làm tròn; giá cao hơn H3 thường ở cấu hình này |
| `wan/v2.2-a14b/image-to-video` | $0,0009375/frame 480p | khoảng $0,453 | Không có chứng cứ chất lượng tốt hơn tương xứng giá cho mẫu của người dùng |
| `ltx-video/v2.3/image-audio-to-video` | $0,0008/frame 480p | khoảng $0,578 | 24 fps, giới hạn clip/frame; có audio không tự chứng minh nhép miệng đạt |
| `minimax/h3/image-to-video/turbo` | công bố $0,004/giây 768p | Không so trực tiếp | Live metadata **chỉ 768p ngang 16:9** và benchmark một seed; không chọn giá $0,0015 ở 480p dọc từ bảng skill |

Ví dụ Wan làm 3 clip ×161 frame cho 30s cần kiểm duration thực và trim khung thừa; không suy ra chính xác 30s chỉ bằng số yêu cầu. H3 mặc định: 30s = 15+15; 40s = 13+14+13; 60s = 15×4. Tái dùng khung cuối giữ bối cảnh/nhân vật tốt hơn dùng lại ảnh gốc, nhưng chưa chứng minh tuyệt đối nhất quán.

Chưa chọn tự chạy GPU vì người dùng yêu cầu Phosor là nền tảng chính và không có benchmark tải/công suất/GPU được cấp. FFmpeg CPU được dùng cho ghép, không sinh cảnh bằng GPU chỉ để cắt/ghép.

## Nhép miệng

`wan/v2.2-a14b/speech-to-video`, 480×854, 16 fps, tối đa 161 frame, giá $0,0009375/frame. Chia audio ở khoảng im lặng 0,18s trở lên; chặn nếu không tìm được điểm chia 3–9,8s. Chưa benchmark độ khớp khẩu hình/biểu cảm tiếng Việt. Chỉ lấy audio gốc làm track hoàn chỉnh, không coi việc ghép là bằng chứng lip-sync. Giá video đơn thuần khoảng $0,45 / $0,60 / $0,90 cho 30/40/60s, cộng làm tròn frame, chuẩn bị và hạ tầng; dự toán exact theo đoạn audio khi duyệt.

## Giọng và viết lời thoại

- Phosor `qwen3-tts/text-to-speech/1.7b` live chỉ liệt kê Chinese/English/Japanese, tối đa 500 ký tự, $0,00003/ký tự. **Không dùng cho tiếng Việt** dựa vào phỏng đoán.
- Google `vi-VN-Standard-A/B`: tài liệu chính thức có tiếng Việt; giá $4/triệu ký tự = $0,000004/ký tự. Không đưa quota miễn phí vào baseline. Cần key và tài khoản có bật billing đã được chủ tài khoản thiết lập; không tự bật/nâng billing.
- DeepSeek `deepseek-flash` (V4.1-Flash theo tài liệu hiện hành), chat completions, thinking disabled, max_tokens 1000. Giá peak input cache miss $0,30/triệu token, output $1,20/triệu; giữ trước $0,003/lần chuẩn bị với input giới hạn 1500 ký tự. Token dùng thật từ API được lưu cùng response, không gọi dự toán là hóa đơn. Tiếng Việt cần nghe/đọc nghiệm thu, chưa benchmark.
- Người dùng tải giọng có sẵn: không trả phí TTS. Người dùng dán văn bản: không cần phí LLM.

Nguồn chính thức: https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types ; https://cloud.google.com/text-to-speech/pricing ; https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize ; https://api-docs.deepseek.com/quick_start/pricing/ ; https://api-docs.deepseek.com/api/create-chat-completion/ .

## Dự toán một video hoàn chỉnh

Giả định tỷ giá 26.000đ/USD (không phải tỷ giá thẻ), hạ tầng $0,01/video (ước tính chưa đo), không thuế/phí thẻ/phí nền tháng, không credit tặng. Số ký tự 500/700/1000 chỉ là kịch bản, không dùng để ép audio khớp thời lượng. Dự toán thật đếm văn bản và đo audio từng lần.

| Thời lượng | Video H3 | Có audio sẵn: video + hạ tầng | Tự viết + TTS + video + hạ tầng |
| --- | --- | --- | --- |
| 30s | $0,135 | $0,145 ≈ 3.770đ | $0,150 ≈ 3.900đ, giả định 500 ký tự |
| 40s | $0,180 | $0,190 ≈ 4.940đ | $0,1958 ≈ 5.091đ, giả định 700 ký tự |
| 60s | $0,270 | $0,280 ≈ 7.280đ | $0,287 ≈ 7.462đ, giả định 1000 ký tự |

Đây là chi phí biên tham khảo, **không phải giá thành đầy đủ hoặc chi phí đã đo cho đầu ra đạt**. 100.000đ tương đương khoảng 25 / 19 / 13 video ở ba kịch bản tự viết nếu mọi lần đều đạt và phí nền đã trả. Không cam kết sản lượng này.

Không tự retry sinh video. Retry đọc/ghép tối đa 2/1 không phát sinh lượt Phosor mới nhưng có thể tăng hạ tầng. Trường hợp cần tự tạo lại do thẩm mỹ: phải duyệt mới và tính toàn bộ đoạn cần tạo lại, không giả định được hoàn phí. Chưa có tỷ lệ lỗi thực nên không đưa con số “giá/đầu ra đạt” giả. Phí lưu lâu, tải lại nhiều, vận hành, phí gói, FX/thẻ/thuế làm tăng tổng. API chưa xác nhận có actual charge, UI luôn phân biệt dự toán với thực tế.

## Vercel

Đã kiểm https://vercel.com/docs/functions/limitations : Hobby tối đa 300s/lượt, payload 4,5MB. Vì vậy upload đi thẳng Blob bằng token giới hạn và download stream; không đặt AI chờ trong một request. Workflow dùng sleep bền; step Node thực hiện FFmpeg từng đoạn với timeout 240s, một thread. Chưa đo encode trên vCPU Vercel; nếu quá 300s cần worker CPU được duyệt, không tự nâng gói.

Workflow 5.2.2 tài liệu bundled xác nhận quản lý queue/storage/OIDC trên Vercel và cần System Environment Variables. Cần kiểm lại quota/gói thực tế trước khi mở tạo có phí. Secret luôn máy chủ, không có khóa trong bundle/mã nguồn. Chưa xác minh điều khoản SaaS/white-label của Phosor; bản này chỉ là Studio một chủ, không mở kinh doanh đa người dùng.

Giới hạn concurrent cấp tài khoản chưa xác minh: skill có hai bảng mâu thuẫn. Ứng dụng chủ động chạy **1 render / 1 clip Phosor tại một thời điểm**, gặp 429 thì dừng, không suy luận tài khoản có quota cao hơn. Chưa xác minh SLA/retention/refund của tài khoản. Quyền người trong ảnh/giọng do chủ Studio duyệt trước render.
