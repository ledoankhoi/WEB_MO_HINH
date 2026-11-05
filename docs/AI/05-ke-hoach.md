# 05. Kế hoạch

Theo yêu cầu ngày 16/10/2026, giai đoạn nghiên cứu rút từ 80 ngày còn **1 tháng (4 tuần)**. Phần còn lại dùng để xây dựng AI vào website và khai thác các hướng mở rộng.

Giả định khi lập kế hoạch:

- Mốc ngày tính từ lúc bắt đầu phần AI, chưa gắn lịch cụ thể.
- Phần quản trị và kho đang làm (nhánh `auto/quan-tri-kho`) vẫn tiếp tục. Việc ghi sự kiện (giai đoạn 0) chen vào ngay sau việc quản trị đang dở, vì dữ liệu không bù lại được (đã chốt, xem [07-ghi-chu.md](07-ghi-chu.md)).

## Giai đoạn 0: ghi sự kiện (làm ngay sau việc quản trị đang dở, 3 đến 4 ngày)

| Việc | Đầu ra |
| --- | --- |
| Sửa [docs/chuan/03-co-so-du-lieu.md](../chuan/03-co-so-du-lieu.md): mở rộng bảng `events` theo [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) | Thiết kế đã chốt |
| Migration bảng `events` (bật RLS như mọi bảng), Route Handler `/api/events` có kiểm tra đầu vào và giới hạn tần suất | Máy chủ nhận được sự kiện |
| Ghi `view_product`, `search`, `add_to_cart`, `remove_from_cart`, `purchase`, `product_impression` | Sự kiện mua sắm cơ bản |
| Gom phiên 3D ở `RobotViewer` và gửi `viewer_session`, `model_3d_loaded` | Tín hiệu 3D |
| Thông báo thu thập dữ liệu, lựa chọn từ chối | Tuân thủ Nghị định 13/2023 |
| Test cho Route Handler và hàm tính `active_ms` | `npm test` |
| Đo trước và sau theo tiêu chí ở [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) mục 6: JavaScript trang sản phẩm tăng tối đa 3 KB gzip, không gửi gì khi mô hình đang tải | Bằng chứng web không nặng thêm |

## Giai đoạn 1: nghiên cứu (1 tháng)

### Tuần 1: tổng quan tài liệu và chốt thiết kế

| Ngày | Việc | Đầu ra |
| --- | --- | --- |
| 1–3 | Tra cứu có hệ thống theo các từ khoá ở [06-nguon-tham-khao.md](06-nguon-tham-khao.md) mục 5; đọc kỹ R1, R2, R4, R5, R6, R7, R13, R14 | Bảng tổng quan: phương pháp, dữ liệu, độ đo, khác biệt với đề tài |
| 4–5 | Kết luận về tính mới; chốt câu hỏi nghiên cứu, H1 đến H3, danh sách đặc trưng 3D | Đề cương (bản nháp chương 1 và 2) |
| 6–7 | Cài môi trường theo [08-chuan-bi.md](08-chuan-bi.md); dựng thư mục `ai/`, đọc bảng `events` chỉ đọc, tải Retailrocket, viết bước làm sạch dữ liệu | Pipeline đọc dữ liệu chạy được |

### Tuần 2: dữ liệu mô phỏng và đường cơ sở

| Ngày | Việc | Đầu ra |
| --- | --- | --- |
| 8–10 | Bộ mô phỏng với tham số $\gamma$ và các kịch bản ở [04-thuc-nghiem.md](04-thuc-nghiem.md) mục 6 | Tập D-sim, có test kiểm tra phân phối |
| 11–12 | Chia tập theo thời gian, các hàm độ đo, khung đánh giá | Bộ đánh giá dùng chung cho mọi mô hình |
| 13–14 | Cài B0, B1, B2, B3 (tự viết BPR bằng NumPy); chạy trên Retailrocket và đối chiếu với BPR của Cornac | Bảng kết quả đường cơ sở đầu tiên, bằng chứng BPR tự viết đúng |

### Tuần 3: phương pháp đề xuất

| Ngày | Việc | Đầu ra |
| --- | --- | --- |
| 15–16 | Đặc trưng 3D và hàm $q^{3D}$ (hồi quy logistic) | B5 chạy được, có kết quả Q1 |
| 17–19 | B4, rồi B6 (học $q^{3D}$ đầu cuối, đạo hàm tính tay, kiểm tra bằng sai phân hữu hạn) | Mô hình đề xuất huấn luyện và suy luận được |
| 20–21 | Buổi dùng thử D-pilot với người tham gia (song song) | Dữ liệu thật đầu tiên |

### Tuần 4: thực nghiệm và viết

| Ngày | Việc | Đầu ra |
| --- | --- | --- |
| 22–24 | Chạy đủ cấu hình × kịch bản $\gamma$ × 5 hạt giống; kiểm định Wilcoxon, Holm, bootstrap | Bảng và biểu đồ kết quả chính |
| 25–26 | Phân tích phụ E1, E2, độ nhạy; chạy trên D-pilot | Kết quả bổ sung, phần giới hạn nghiên cứu |
| 27–30 | Viết chương phương pháp và thực nghiệm; rà lại số liệu; đóng gói mã để tái lập được | Bản nháp các chương AI của luận văn |

**Cắt bớt nếu chậm:** bỏ đường cơ sở tham khảo (MBGCN, MBA) trước, rồi tới phân tích độ nhạy. Không cắt kịch bản $\gamma = 0$ và kiểm định thống kê.

## Giai đoạn 2: xây dựng AI vào website (khoảng 2 tuần sau tháng nghiên cứu)

| Việc | Đầu ra |
| --- | --- |
| Bảng `recommendations` (người dùng hoặc khách, sản phẩm, điểm, `model_version`, thời điểm tạo) và `item_similarity` | Nơi lưu kết quả |
| Lệnh `npm run ai:train` (gọi Python) chạy cả quy trình: xuất dữ liệu → huấn luyện → ghi kết quả | Huấn luyện theo lô |
| Hiện gợi ý ở trang sản phẩm ("Có thể bạn cũng thích"), trang chủ, giỏ hàng; dự phòng theo độ phổ biến | Người dùng thấy gợi ý |
| Ghi `product_impression` kèm `model_version` cho mỗi ô gợi ý | Đo được hiệu quả từng mô hình |
| Trang quản trị "AI gợi ý": phiên bản mô hình, NDCG gần nhất, độ phủ, nút chạy lại | Theo dõi và quay lại bản cũ |
| Test: dự phòng khi chưa có gợi ý, không gợi ý sản phẩm đã ẩn hay hết hàng | `npm test` |

## Giai đoạn 3: khai thác tối đa đề tài (tuỳ dữ liệu và thời gian)

Theo thứ tự ưu tiên ở [02-phuong-phap.md](02-phuong-phap.md) mục 4:

1. **E3:** gợi ý theo bộ hợp thể (Bruticus và các Combaticons).
2. **E4:** đặc trưng hình học D2 từ file `.glb` cho sản phẩm mới.
3. **E5:** lời giải thích gợi ý dựa trên hành vi 3D, kèm khảo sát người dùng.
4. **E7:** thử nghiệm A/B khi website có đủ lưu lượng.
5. **E8:** công bố bộ dữ liệu đã ẩn danh và bộ mô phỏng.
6. **E6:** gợi ý theo phiên cho khách vãng lai, khi đủ số phiên.

## Mốc kiểm tra với giảng viên

| Mốc | Nội dung trình bày |
| --- | --- |
| Hết tuần 1 | Tổng quan tài liệu, kết luận về tính mới, đề cương |
| Hết tuần 2 | Bộ mô phỏng, kết quả đường cơ sở |
| Hết tuần 4 | Kết quả H1 đến H3, giới hạn nghiên cứu |
| Hết giai đoạn 2 | Bản demo trên website |
