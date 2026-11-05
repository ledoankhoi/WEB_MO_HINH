# 07. Ghi chú

## Quyết định đã chốt

| Ngày | Quyết định | Căn cứ |
| --- | --- | --- |
| 12/10/2026 | AI là trọng tâm luận văn; tự xây dựng mô hình, không dùng mô hình có sẵn của bên thứ ba | [00-quyet-dinh-nen-tang.md](../chuan/00-quyet-dinh-nen-tang.md) |
| 16/10/2026 | Chọn hướng gợi ý sản phẩm dựa trên hành vi tương tác 3D | Bản phân tích của chủ dự án ([01-phan-tich-de-tai.md](01-phan-tich-de-tai.md)) |
| 16/10/2026 | Câu hỏi Q2 (3D có cải thiện gợi ý không) là trọng tâm; Q1 là cơ sở giải thích, Q3 (tác động nhân quả) để sau | 01, mục 2 |
| 16/10/2026 | Giai đoạn nghiên cứu là 1 tháng; sau đó tích hợp vào website và mở rộng | [05-ke-hoach.md](05-ke-hoach.md) |
| 16/10/2026 | Không tuyên bố tính mới trước khi có tổng quan tài liệu | 01, mục 4 |
| 16/10/2026 | **Không dùng PyTorch.** Viết toàn bộ thuật toán bằng NumPy, đạo hàm tính tay (các hàm mất mát đều có dạng đóng), kiểm tra bằng sai phân hữu hạn | Chủ dự án giao quyết định theo hướng tốt nhất. Lý do: dữ liệu nhỏ, chạy CPU đủ nhanh; tự viết đạo hàm chứng minh rõ "tự xây dựng"; bớt một phụ thuộc nặng (vài trăm MB) |
| 16/10/2026 | Phần AI viết bằng Python trong thư mục `ai/` ở gốc dự án; website chỉ đọc kết quả từ PostgreSQL, không chạy Python khi phục vụ khách | Hệ sinh thái tính toán khoa học quen thuộc với hội đồng; tách khỏi website nên không ảnh hưởng tốc độ trang |
| 16/10/2026 | Ghi sự kiện (giai đoạn 0) làm **ngay sau việc quản trị đang dở**, không chờ xong cả backlog quản trị và kho | Dữ liệu hành vi không bù lại được; ngân sách hiệu năng ở [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) mục 6 bảo đảm web không nặng thêm đáng kể |
| 16/10/2026 | Buổi dùng thử D-pilot: 20 đến 40 người, có phiếu đồng ý tham gia ngắn, dùng tài khoản thử, không thanh toán thật | Chuẩn mực tối thiểu của nghiên cứu có người tham gia |
| 17/10/2026 | Chiến lược dữ liệu nhiều tầng: D-pub (thật, không 3D), D-semi (bán tổng hợp), D-sim (mô phỏng), D-pilot (thật, có phiếu xếp hạng sở thích). Không dùng dữ liệu tác giả tự tạo hay tác tử AI làm bằng chứng | [03-du-lieu-va-su-kien.md](03-du-lieu-va-su-kien.md) mục 7 |
| 16/10/2026 | Viết bài báo là tuỳ chọn; E8 (công bố bộ dữ liệu) để ưu tiên thấp | Ưu tiên luận văn trước |

## Câu hỏi còn mở

Các câu hỏi ngày 16/10/2026 (PyTorch, ngôn ngữ, thứ tự công việc, buổi dùng thử, bài báo) đã được chốt ở bảng trên. Còn lại:

1. Nên báo giảng viên quyết định "chỉ dùng NumPy, tự viết đạo hàm" để chắc chắn khớp cách hiểu "tự xây dựng" của hội đồng.
2. Ai sẽ tham gia buổi dùng thử D-pilot, và tổ chức vào tuần nào (kế hoạch đặt ở tuần 3).

## Ghi chú kỹ thuật

- Khung xem 3D chỉ cho phóng bằng nút bấm (`enableZoom={false}` ở `OrbitControls`), không bằng lăn chuột. Số lần phóng vì thế là thao tác có chủ đích, ít nhiễu hơn lăn chuột.
- Khung 3D đã dừng vẽ khi ra khỏi màn hình (`IntersectionObserver`, `frameloop`); dùng lại đúng tín hiệu này cho điều kiện "trong màn hình" khi tính `active_ms`.
- Chế độ tự xoay bị tắt khi người dùng kéo (`onStart`), nên phân biệt được thời gian tự xoay với thời gian người dùng tự xoay.
- Danh mục mẫu khoảng 40 sản phẩm, đều có file `.glb`. Ma trận người dùng × sản phẩm sẽ nhỏ và thưa; đây là lý do dùng mô hình tuyến tính và xếp hạng trên toàn danh mục.
- Mô hình có clip biến hình hoặc hợp thể, và có danh sách dáng, được khai báo ở `src/lib/model-features.ts`. Đây là nguồn cho đặc trưng $F_{form}$, $F_{pose}$ và hướng E3.

## Ý tưởng chưa đưa vào kế hoạch

- Chú thích bộ phận trên mô hình 3D (đang để dành ở bước 3 trong `docs/chuan/`). Nếu làm, sẽ có thêm đặc trưng $H_{click}$.
- Chế độ toàn màn hình (YC-3D-03, chưa làm): nếu có, ghi thêm sự kiện mở toàn màn hình, có thể là tín hiệu quan tâm mạnh.
- Dự đoán đơn COD có nguy cơ huỷ: bài toán khác, không thuộc đề tài này.

## Nhật ký thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 17/10/2026 | Đối chiếu với mã mới: thêm hành vi yêu thích, nhãn đánh giá sao, biến thể, `order_events`; bảng trạng thái chuẩn bị ở README |
| 16/10/2026 | Thêm 08-chuan-bi.md: Python chưa cài, RAM 7,6 GB; dùng Cornac để kiểm tra chéo BPR, Retailrocket làm dữ liệu công khai chính; thêm R15 |
| 16/10/2026 | Chốt: không dùng PyTorch, Python trong ai/, làm ghi sự kiện ngay sau việc quản trị đang dở; thêm ngân sách hiệu năng cho ghi sự kiện |
| 16/10/2026 | Tạo thư mục `docs/AI` từ bản phân tích của chủ dự án; kiểm tra nguồn tham khảo; rút giai đoạn nghiên cứu còn 1 tháng; thêm các hướng mở rộng E1 đến E8 |
