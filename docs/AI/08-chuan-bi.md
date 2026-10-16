# 08. Chuẩn bị môi trường, công cụ và dữ liệu

Khảo sát ngày 16/10/2026. Nguyên tắc: **thuật toán của đề tài chỉ dùng NumPy** (xem [07-ghi-chu.md](07-ghi-chu.md)). Mọi thư viện hay repo khác dưới đây chỉ dùng để **kiểm tra chéo** hoặc làm **đường cơ sở tham khảo**, không nằm trong mô hình đề xuất.

## 1. Máy hiện có

| Thành phần | Hiện trạng | Ảnh hưởng |
| --- | --- | --- |
| CPU | Intel Core i5-12500H, 16 luồng | Đủ cho mọi thực nghiệm của đề tài |
| RAM | **Khoảng 7,6 GB** | Điểm yếu: không nạp nổi bộ Taobao đầy đủ (hơn 100 triệu dòng), phải lấy mẫu |
| GPU | NVIDIA RTX 3050 Laptop | Không cần, vì thuật toán viết bằng NumPy chạy trên CPU |
| Python | **Chưa cài** | Phải cài trước khi bắt đầu |
| Git, GitHub | Đã có repo `ledoankhoi/WEB_MO_HINH` | Không cần repo mới |

## 2. Cần cài (bắt buộc)

1. **Python 3.12** và **uv** (công cụ quản lý môi trường Python, nhanh, tự khoá phiên bản thư viện):
   ```powershell
   winget install Python.Python.3.12
   winget install astral-sh.uv
   ```
2. Môi trường riêng trong thư mục `ai/`, với các thư viện:

   | Thư viện | Dùng để |
   | --- | --- |
   | `numpy` | **Toàn bộ thuật toán** |
   | `pandas` | Đọc, làm sạch dữ liệu |
   | `scipy` | Kiểm định Wilcoxon, ma trận thưa |
   | `matplotlib` | Biểu đồ cho luận văn |
   | `psycopg` | Đọc PostgreSQL |
   | `pytest` | Kiểm tra đạo hàm, độ đo, bộ mô phỏng |

   Tổng dung lượng khoảng 150 MB, không cần PyTorch.

## 3. Nên dùng: thư viện để kiểm tra chéo

**Cornac** (`pip install cornac`): framework gợi ý có sẵn BPR, các độ đo và công cụ thực nghiệm.

- Chỉ cài vào nhóm phụ thuộc dành cho phát triển, không dùng trong mô hình.
- Chạy BPR của Cornac trên **cùng** dữ liệu và cách chia với BPR tự viết. Nếu kết quả lệch nhiều, BPR tự viết có lỗi.
- Đây là bằng chứng mạnh để trả lời câu hỏi của hội đồng "làm sao biết code tự viết là đúng?".

Bài "Revisiting BPR" [R15] cho thấy nhiều bản BPR mã nguồn mở khác bản gốc và kém tới 50%. Các chi tiết quyết định kết quả là cách lấy mẫu, độ lệch của sản phẩm (item bias) học được, bộ tối ưu, và điều chuẩn tách riêng. BPR tự viết phải làm đúng các chi tiết này và ghi rõ trong luận văn.

## 4. Nên dùng: bộ dữ liệu công khai

Dữ liệu của ROBOTICA sẽ nhỏ. Hai bộ dưới đây có **đúng các hành vi** của đường cơ sở B3, nhưng **không có tín hiệu 3D**. Không bộ công khai nào có tín hiệu 3D, và đó chính là khoảng trống đề tài nhắm tới.

| Bộ | Hành vi | Quy mô | Dùng để |
| --- | --- | --- | --- |
| **Retailrocket** (Kaggle) | xem, thêm giỏ, mua | Khoảng 2,76 triệu sự kiện, 1,4 triệu khách, 4,5 tháng | **Chính:** kiểm tra B0 đến B3 và bộ đánh giá chạy đúng trên dữ liệu thật, vừa RAM |
| **Taobao UserBehavior** (Tianchi, mã 649) | xem, yêu thích, thêm giỏ, mua | Hơn 100 triệu sự kiện, khoảng 988 nghìn người dùng, 25/11 đến 3/12/2017 | Phụ: chỉ dùng một mẫu (ví dụ 50 nghìn người dùng) do giới hạn RAM |

Lợi ích cho luận văn:

1. Chứng minh khung đa hành vi và cách đánh giá cho kết quả hợp lý trên dữ liệu lớn, thật, trước khi áp dụng cho dữ liệu nhỏ của ROBOTICA.
2. Lấy phân phối hành vi thật (tỷ lệ xem → giỏ → mua, số sự kiện mỗi người) để **hiệu chỉnh bộ mô phỏng** D-sim cho giống thực tế.

Cần đọc điều khoản sử dụng của từng bộ (đều cho phép nghiên cứu phi thương mại) và trích dẫn đúng nguồn trong luận văn. Không đưa dữ liệu này vào git: để trong `data/` (đã bỏ qua trong git), như mô hình 3D.

## 5. Tuỳ chọn: repo đường cơ sở tham khảo

| Repo | Có gì | Khi nào dùng |
| --- | --- | --- |
| [akaxlh/MBRec](https://github.com/akaxlh/MBRec) | Mã của bài MBRec, dùng MBGCN làm đường cơ sở | Chỉ khi muốn so với một phương pháp đa hành vi dạng đồ thị. Cần môi trường riêng có thư viện học sâu; GPU RTX 3050 đủ chạy |
| Mã của bài MBA [R5] | Trang tổng hợp ghi là có mã, nhưng chưa tìm thấy đường dẫn | Tìm trong bài báo; nếu không có thì bỏ |
| RecBole | 73 mô hình, nhưng **không có** nhóm gợi ý đa hành vi | Không cần |

Theo [05-ke-hoach.md](05-ke-hoach.md), đây là phần được cắt đầu tiên nếu chậm tiến độ.

## 6. Công cụ cho phần nghiên cứu và viết

- **Zotero** cùng tiện ích Better BibTeX: quản lý tài liệu, xuất trích dẫn đúng chuẩn. Nhập 15 nguồn ở [06-nguon-tham-khao.md](06-nguon-tham-khao.md) ngay từ đầu.
- **Semantic Scholar**, **Connected Papers**: tìm các bài trích dẫn R5, R6, R7 để không sót công trình gần đề tài trong tuần tổng quan.
- **Mẫu luận văn của trường** (Word hoặc LaTeX trên Overleaf): hỏi khoa trước khi viết để không phải định dạng lại.

## 7. Quy ước tái lập thực nghiệm (không cần công cụ nặng)

Không cần MLflow hay Weights & Biases. Mỗi lần chạy ghi một file JSON vào `ai/results/` gồm:

- Cấu hình và hạt giống ngẫu nhiên.
- Mã commit git và mã băm của tập dữ liệu.
- Các độ đo theo từng người dùng (cần cho kiểm định Wilcoxon).

Tập đã chia cũng được lưu thành file, để mọi mô hình dùng đúng một cách chia và người khác chạy lại được.

## 8. Kiến thức nên ôn trước tuần 1

| Chủ đề | Đọc |
| --- | --- |
| Phân rã ma trận, phản hồi ngầm | R1 |
| BPR: suy ra hàm mất mát và đạo hàm | R2, R15 |
| Gợi ý đa hành vi | R6 (khảo sát), R4, R5 |
| Thời gian lưu lại làm tín hiệu | R7 |
| Đánh giá ngoại tuyến đúng cách | R13, R14 |
| Kiểm định Wilcoxon, bootstrap, hiệu chỉnh Holm | Giáo trình thống kê bất kỳ |
