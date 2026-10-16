# 04. Thiết kế thực nghiệm

Mục tiêu: không chỉ so "có 3D" với "không có 3D", mà xác định chính xác **phần nào** tạo ra cải thiện.

## 1. Các mô hình so sánh

| Mã | Mô hình | Vai trò |
| --- | --- | --- |
| B0 | Popularity | Đường cơ sở đơn giản nhất |
| B1 | ItemKNN | Gợi ý sản phẩm tương tự theo tương tác |
| B2 | BPR-MF chỉ dùng hành vi mua | Kiểm tra nền BPR |
| B3 | BPR đa hành vi thông thường (xem, giỏ, mua), **không có 3D** | **Đường cơ sở quan trọng nhất** |
| B4 | B3 + tín hiệu 3D thô (số lần thao tác, thời gian), trọng số đặt tay | Tín hiệu thô có ích không? |
| B5 | B3 + $q^{3D}$ đã chuẩn hoá, trọng số chọn trên tập validation | Bước biểu diễn có ích không? |
| B6 | Phương pháp đề xuất: học $q^{3D}$ đầu cuối cùng mô hình xếp hạng | Học cách dùng tín hiệu 3D cho đúng mục tiêu xếp hạng có ích không? |

Ngoài ra có hai đường cơ sở tham khảo từ tài liệu, chỉ chạy nếu kịp thời gian: một mô hình đa hành vi dạng đồ thị theo ý MBGCN [R4], và mục tiêu căn chỉnh hành vi của MBA [R5]. Mục đích là chứng minh B6 khác các cách học trọng số hành vi đã có.

Mọi cấu hình chạy trên **cùng dữ liệu, cùng tập ứng viên, cùng cách chia tập, cùng ngân sách dò siêu tham số**.

Cách đọc kết quả:

- B4 > B3: tín hiệu 3D thô có ích.
- B5 > B4: biểu diễn có điều chỉnh có ích.
- B6 > B5 ổn định qua nhiều lần chạy: có bằng chứng cho cơ chế học trọng số.

## 2. Giả thuyết kiểm định

| Mã | Giả thuyết | So sánh |
| --- | --- | --- |
| H1 | Tín hiệu 3D có giá trị gia tăng: mô hình đa hành vi có 3D xếp hạng sản phẩm sẽ mua tốt hơn cùng mô hình không có 3D | B4, B5, B6 với B3 |
| H2 | Biểu diễn 3D đã chuẩn hoá tốt hơn số đếm và thời gian thô | B5 với B4 |
| H3 | Học trọng số đặc trưng 3D đầu cuối theo mục tiêu xếp hạng tốt hơn học riêng theo mục tiêu dự đoán mua | B6 với B5 |

H3 chỉ giữ lại nếu cơ chế học trọng số thực sự là phần chính của phương pháp. Các câu hỏi mở rộng E1, E2 (xem [02-phuong-phap.md](02-phuong-phap.md) mục 4) là **phân tích phụ**, không thêm giả thuyết chính để luận văn không bị phân tán.

## 3. Độ đo

| Độ đo | Ý nghĩa | Vai trò |
| --- | --- | --- |
| NDCG@10 | Chất lượng thứ hạng, ưu tiên sản phẩm đúng ở gần đầu | **Chỉ số chính** |
| HR@10 | Tỷ lệ trường hợp sản phẩm mục tiêu nằm trong 10 gợi ý đầu | Phụ, khi mỗi người có một mục tiêu |
| Recall@10 | Tỷ lệ mục tiêu tìm thấy trong 10 gợi ý đầu | Phụ, khi mỗi người có nhiều mục tiêu |
| Catalog coverage | Mức đa dạng sản phẩm được gợi ý | Kiểm tra mô hình không chỉ đẩy hàng phổ biến |
| Độ trễ tạo gợi ý | Thời gian sinh danh sách | Kiểm tra tính khả thi khi triển khai |

Xếp hạng trên **toàn bộ danh mục**, không dùng lấy mẫu 100 ứng viên ngẫu nhiên. Danh mục ROBOTICA chỉ vài chục đến vài trăm sản phẩm nên xếp hạng toàn bộ vẫn rẻ, lại tránh được sai lệch do lấy mẫu.

## 4. Chia dữ liệu theo thời gian

- Chia theo **mốc thời gian chung** cho mọi người dùng: dữ liệu cũ để huấn luyện, giai đoạn kế tiếp để chọn tham số, giai đoạn mới nhất để kiểm tra.
- Mọi sự kiện xảy ra sau thời điểm dự đoán đều bị loại khỏi tập huấn luyện. Đặc trưng $q^{3D}$ cũng chỉ tính từ các phiên trước mốc đó.
- Không chia ngẫu nhiên: Meng và cộng sự [R13] cho thấy cách chia có thể đảo thứ hạng giữa các mô hình. Ji và cộng sự [R14] cho thấy chia không theo dòng thời gian chung làm rò rỉ thông tin tương lai, kể cả với BPR.
- Báo cáo rõ cách chia và công khai các tập đã chia.

## 5. Kiểm định thống kê

1. Tính NDCG@10 và HR@10 **cho từng người dùng** trong tập kiểm tra.
2. So từng cặp mô hình trên cùng những người dùng đó bằng kiểm định Wilcoxon có dấu và hạng (signed-rank).
3. Báo cáo chênh lệch trung bình, khoảng tin cậy 95% bằng bootstrap theo người dùng, và kích thước hiệu ứng (tương quan hạng-biserial), không chỉ báo giá trị $p$.
4. Có nhiều cặp so sánh (H1 đến H3) nên hiệu chỉnh kiểm định nhiều lần bằng phương pháp Holm.
5. Mỗi cấu hình chạy ít nhất 5 hạt giống ngẫu nhiên; báo cáo trung bình và độ lệch chuẩn.

Không chạy Wilcoxon trên hai con số NDCG trung bình; cần các quan sát ghép cặp theo từng người dùng.

## 6. Bộ mô phỏng người dùng (tập D-sim)

### 6.1. Mô hình sinh

- Mỗi người dùng có véc-tơ sở thích ẩn $\mathbf{z}_u$ trên các thuộc tính: dòng sản phẩm (Gundam, Transformers, Super Sentai...), tỷ lệ, khả năng biến hình, hợp thể, mức giá.
- Bốn kiểu người dùng mẫu:
  - Người sưu tầm Gundam: quan tâm tỷ lệ, phiên bản, độ chi tiết.
  - Người thích Transformers: quan tâm biến hình, thiết kế nhân vật.
  - Người thích Super Sentai: quan tâm màu sắc, đội hình, hợp thể.
  - Người mua theo giá: cân nhắc giá, hãng, tình trạng hàng.
- Quy trình mỗi phiên: hiển thị (phụ thuộc vị trí và độ phổ biến) → xem trang → phiên 3D → thêm giỏ → mua. Xác suất mỗi bước phụ thuộc độ hợp giữa $\mathbf{z}_u$ và sản phẩm.

### 6.2. Tham số then chốt: độ thông tin của tín hiệu 3D

Tham số $\gamma \in [0, 1]$ quyết định mức độ các đặc trưng 3D ($T_{active}$, $A_{coverage}$, $F_{form}$...) phụ thuộc vào sở thích thật, so với phụ thuộc vào nhiễu (tò mò, thiết bị, độ khó nhìn của mô hình).

| Kịch bản | $\gamma$ | Kỳ vọng nếu phương pháp đúng |
| --- | --- | --- |
| 3D không mang thông tin | 0 | B4, B5, B6 **không** hơn B3; B6 phải học được trọng số 3D gần 0 |
| 3D mang ít thông tin | 0,25 | Cải thiện nhỏ |
| Trung bình | 0,5 | Cải thiện rõ |
| 3D mang nhiều thông tin | 1 | Cải thiện lớn nhất |
| Tò mò gây nhiễu | 0,5, thêm nhóm người xoay nhiều nhưng không mua | B5, B6 bền hơn B4 |

Kịch bản $\gamma = 0$ là **kiểm tra trung thực**: nếu mô hình vẫn "thắng" khi 3D không mang thông tin, thì phương pháp hoặc cách đánh giá có lỗi. Nếu chỉ dựng kịch bản có lợi cho phương pháp, kết quả chỉ chứng minh mô hình học lại được giả định mà người tạo dữ liệu đã cài vào.

### 6.3. Kiểm tra bộ mô phỏng có thực tế không

So các phân phối của D-sim với D-pilot khi đã có: số sự kiện mỗi phiên, phân phối `active_ms`, tỷ lệ chuyển đổi xem → giỏ → mua. Nếu lệch nhiều, chỉnh tham số mô phỏng và ghi lại trong luận văn.

## 7. Dữ liệu thật

- **D-pilot:** 20 đến 40 người tham gia, mỗi người làm một kịch bản mua sắm có thưởng nhỏ (ví dụ "chọn quà cho bạn thích robot với ngân sách 1 triệu"). Đơn đặt bằng tài khoản thử, không thanh toán thật. Kết quả trình bày là **nghiên cứu thăm dò**.
- **D-live:** dùng khi website chạy công khai đủ lâu. Đây là điều kiện để làm A/B (hướng E7).

## 8. Phân tích phụ (nếu kịp)

- **E1:** đóng góp riêng của $F_{form}$ (biến hình) so với các đặc trưng 3D khác: bỏ từng đặc trưng một và đo NDCG giảm bao nhiêu.
- **E2:** cắt kết quả H1 theo dòng sản phẩm và theo thiết bị.
- **Độ nhạy:** kết quả thay đổi thế nào theo số chiều ẩn, ngưỡng 5 giây không hoạt động, số ô góc nhìn.
- **Hồi quy logistic Q1:** hệ số của từng đặc trưng 3D khi dự đoán thêm giỏ hoặc mua trong 7 ngày, có kiểm soát độ phổ biến và giá.
