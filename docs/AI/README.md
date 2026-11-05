# Phần AI của ROBOTICA: gợi ý sản phẩm dựa trên hành vi tương tác 3D

Thư mục này chứa toàn bộ tài liệu nghiên cứu và kế hoạch xây dựng phần AI, là trọng tâm của luận văn (xem [docs/chuan/00-quyet-dinh-nen-tang.md](../chuan/00-quyet-dinh-nen-tang.md), mục "Bước 2: Tích hợp AI").

## Tên đề tài làm việc

**Mô hình hoá tín hiệu tương tác 3D trong hệ thống gợi ý sản phẩm thương mại điện tử dựa trên phản hồi ngầm**

Tên này cố ý không tuyên bố tính mới trước khi làm xong tổng quan tài liệu.

## Câu hỏi nghiên cứu chính

Bổ sung tín hiệu khám phá mô hình 3D vào hệ gợi ý đa hành vi có cải thiện khả năng xếp hạng những sản phẩm người dùng sẽ mua trong tương lai không? Nếu có thì cải thiện bao nhiêu, với nhóm sản phẩm và nhóm người dùng nào?

## Mục lục

| File | Nội dung |
| --- | --- |
| [01-phan-tich-de-tai.md](01-phan-tich-de-tai.md) | Phân tích đề tài: ba câu hỏi khoa học, giả thuyết, mức độ mới, rủi ro, đánh giá tổng thể |
| [02-phuong-phap.md](02-phuong-phap.md) | Phương pháp: biểu diễn mức khám phá 3D, BPR đa hành vi có trọng số học được, các hướng mở rộng |
| [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) | Bộ sự kiện cần ghi trên website, cách đo thời gian hoạt động, quyền riêng tư |
| [04-thuc-nghiem.md](04-thuc-nghiem.md) | Mô hình so sánh B0 đến B6, giả thuyết H1 đến H3, độ đo, kiểm định thống kê, bộ mô phỏng |
| [05-ke-hoach.md](05-ke-hoach.md) | Kế hoạch: 1 tháng nghiên cứu, sau đó xây dựng AI vào dự án và mở rộng |
| [06-nguon-tham-khao.md](06-nguon-tham-khao.md) | Nguồn tham khảo đã kiểm tra, các điểm đã sửa so với bản gốc, từ khoá tra cứu |
| [07-ghi-chu.md](07-ghi-chu.md) | Ghi chú, quyết định đã chốt, câu hỏi còn mở, nhật ký thay đổi |
| [08-chuan-bi.md](08-chuan-bi.md) | Môi trường cần cài, thư viện kiểm tra chéo, bộ dữ liệu công khai, công cụ nghiên cứu |

## Quan hệ với các thư mục khác

- `docs/chuan/` vẫn là nguồn đúng duy nhất về nghiệp vụ và thiết kế website. Thay đổi nào ở đây động tới CSDL hoặc website (ví dụ bảng `events`) phải được ghi vào `docs/chuan/` trước khi viết code.
- Thư mục này là tài liệu nghiên cứu: giả thuyết, phương pháp, thực nghiệm, kế hoạch. Đây cũng là bản nháp cho các chương luận văn về AI.

## Trạng thái (17/10/2026)

Phần chuẩn bị trên giấy đã xong. Phần chuẩn bị trên máy và trong mã **chưa xong**, theo thứ tự phải làm:

| # | Việc | Trạng thái |
| --- | --- | --- |
| 1 | Tài liệu nghiên cứu, phương pháp, thực nghiệm, kế hoạch, nguồn tham khảo (18 nguồn) | Xong |
| 2 | Phần quản trị và kho của website | Xong trên nhánh `auto/quan-tri-kho`, **chưa gộp vào `main`** |
| 3 | Cài Python 3.12 và uv ([08-chuan-bi.md](08-chuan-bi.md) mục 2) | Chưa: máy chưa có Python |
| 4 | Sửa `docs/chuan/03-co-so-du-lieu.md`: bảng `events` theo [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) | Chưa: thiết kế chuẩn vẫn là bản cũ (chỉ có `viewer_interact`) |
| 5 | Giai đoạn 0: bảng `events`, `/api/events`, ghi phiên 3D ở `RobotViewer` | Chưa: web chưa ghi sự kiện nào |
| 6 | Dựng thư mục `ai/`, tải Retailrocket | Chưa |
| 7 | Hỏi giảng viên về "chỉ dùng NumPy" và thủ tục buổi dùng thử | Chưa, việc của chủ dự án |

Đã có sẵn trên web và dùng được cho AI: yêu thích (`wishlist_items`), đánh giá sao (`reviews`), lịch sử đơn (`order_events`), biến thể (`product_variants`), khung 3D có đủ điểm móc để đo tương tác.
