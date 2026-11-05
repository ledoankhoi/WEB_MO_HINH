# 02. Phương pháp

Tên làm việc: **3D Engagement-Aware Behavior-Weighted BPR**, tức BPR có trọng số đa hành vi, nhận biết mức khám phá 3D. Đây là tên tạm để mô tả hướng tiếp cận, không phải tuyên bố một thuật toán mới đã được xác lập.

Phương pháp gồm hai phần: phần A tóm tắt tương tác 3D thành một biểu diễn có kiểm soát chất lượng; phần B dùng biểu diễn đó trong mô hình xếp hạng. Mục 4 là các hướng mở rộng để khai thác tối đa đề tài.

## 1. Ký hiệu

| Ký hiệu | Nghĩa |
| --- | --- |
| $u$, $i$, $j$ | Người dùng, sản phẩm được quan tâm, sản phẩm so sánh |
| $\mathcal{B} = \{view, 3d, wishlist, cart, purchase\}$ | Các loại hành vi (yêu thích đã có trên web) |
| $s(u,i) = \mathbf{p}_u^\top \mathbf{q}_i + b_i$ | Điểm phù hợp theo phân rã ma trận |
| $\Theta$ | Toàn bộ tham số mô hình |
| $\mathcal{E}_u$ | Tập sản phẩm đã thực sự **hiển thị** cho $u$ (lượt hiển thị) |

## 2. Phần A: biểu diễn mức khám phá 3D

### 2.1. Đặc trưng thô cho mỗi cặp $(u, i)$

Tổng hợp từ các phiên xem 3D của người dùng $u$ với sản phẩm $i$ trước thời điểm dự đoán:

| Đặc trưng | Định nghĩa | Lấy từ |
| --- | --- | --- |
| $T_{active}$ | Tổng thời gian tương tác hoạt động (giây), chỉ tính khi khung 3D nằm trong màn hình, tab đang hiện, có thao tác trong 5 giây gần nhất, và mô hình đã tải xong | Sự kiện tổng hợp `viewer_session` |
| $A_{coverage}$ | Tỷ lệ ô góc nhìn đã đi qua, chia 8 hướng ngang × 3 mức cao thấp = 24 ô | Góc của camera `OrbitControls` |
| $Z_{depth}$ | Mức phóng sâu nhất đạt được, chuẩn hoá về $[0,1]$ theo `MIN_DISTANCE` và `MAX_DISTANCE` | Nút phóng to, thu nhỏ |
| $F_{form}$ | Có xem biến hình hoặc hợp thể không, số lần đổi dạng | Nút đổi dạng (`transform` trong `model-features.ts`) |
| $F_{pose}$ | Số dáng khác nhau đã chọn | Nút chọn dáng |
| $H_{click}$ | Số điểm thông tin đã mở (khi có tính năng chú thích bộ phận) | Để dành |
| $L_{load}$ | Thời gian tải mô hình, tải có thành công không | Sự kiện `model_3d_loaded` |
| $D$ | Loại thiết bị (cảm ứng hay chuột), kích thước khung nhìn | Phiên |

### 2.2. Biến đổi chống "thao tác lặp"

Người xoay 30 lần không mặc định quan tâm gấp ba người xoay 10 lần:

- Thời gian và số đếm dùng hàm bão hoà $g(x) = \log(1 + x / \tau)$, với $\tau$ là trung vị của nhóm.
- $T_{active}$ được chuẩn hoá theo thiết bị: $\tilde T = (\log T - \mu_D) / \sigma_D$, giống cách chuẩn hoá thời gian lưu lại theo ngữ cảnh trong [R7].
- Phiên tải thất bại, hoặc thời gian tải quá dài so với $T_{active}$, bị đánh dấu là không đủ chất lượng và không tính là tín hiệu.

### 2.3. Hàm tổng hợp

$$
q^{3D}_{u,i} = \sigma\left(\mathbf{w}^\top \phi(T_{active}, A_{coverage}, Z_{depth}, F_{form}, F_{pose}) + \mathbf{v}^\top \psi(D, L_{load})\right)
$$

- $\phi$ là các đặc trưng đã qua bước 2.2. $\psi$ là các biến kiểm soát (thiết bị, tải mô hình): chúng giúp mô hình phân biệt "không tương tác" với "không thể tương tác thuận tiện".
- **Cách học $\mathbf{w}$:** bắt đầu bằng hồi quy logistic dự đoán "có thêm giỏ hoặc mua trong 7 ngày sau phiên xem 3D không". Mô hình này cũng trả lời câu hỏi phụ Q1. Bước sau (mục 3.3) học $\mathbf{w}$ cùng lúc với mô hình gợi ý.
- Không bắt đầu bằng mạng nơ-ron: dữ liệu nhỏ, và mô hình tuyến tính giải thích được từng đặc trưng đóng góp bao nhiêu (đưa vào luận văn được).

## 3. Phần B: dùng $q^{3D}$ trong mô hình gợi ý

### 3.1. Khung nền: BPR [R2]

$$
\mathcal{L}_{BPR} = -\sum_{(u,i,j)} \log \sigma\big(s(u,i) - s(u,j)\big) + \lambda \lVert \Theta \rVert^2
$$

$i$ là sản phẩm có phản hồi tích cực, $j$ là sản phẩm chưa có phản hồi quan sát được. Đây là khung có sẵn, không phải đóng góp.

### 3.2. Mục tiêu đa hành vi

$$
\mathcal{L} = \mathcal{L}_{purchase} + \lambda_{v}\mathcal{L}_{view} + \lambda_{c}\mathcal{L}_{cart} + \lambda_{3D}\mathcal{L}_{3D} + \Omega(\Theta)
$$

Mỗi $\mathcal{L}_b$ là một hàm mất mát BPR trên các bộ ba lấy từ hành vi $b$. Riêng $\mathcal{L}_{3D}$ được làm mềm bằng mức khám phá:

$$
\mathcal{L}_{3D} = -\sum_{(u,i,j)} q^{3D}_{u,i}\,\log \sigma\big(s(u,i) - s(u,j)\big)
$$

Phiên 3D hời hợt (xoay vài giây) đóng góp ít, phiên khám phá kỹ đóng góp nhiều.

### 3.3. Ba cách đặt trọng số, tương ứng các cấu hình thực nghiệm

| Cách | $\lambda_b$ | $q^{3D}$ | Cấu hình |
| --- | --- | --- | --- |
| Cố định theo thứ tự giả định | Đặt tay: mua > giỏ > 3D > xem | Bằng 1 (tín hiệu thô) | B4 |
| Chọn trên tập kiểm định | Dò lưới trên tập validation | Dùng $q^{3D}$ từ hồi quy logistic mục 2.3 | B5 |
| Học cùng mô hình (đề xuất) | Chọn trên tập validation, như B5 | $\mathbf{w}$ học **đầu cuối** cùng mô hình xếp hạng, thay vì học riêng bằng hồi quy logistic | B6 |

Khác biệt giữa B5 và B6 nằm ở cách học $\mathbf{w}$:

- **B5:** $\mathbf{w}$ học riêng, để dự đoán "có mua trong 7 ngày không".
- **B6:** $\mathbf{w}$ học cùng lúc với $\mathbf{p}_u, \mathbf{q}_i$, để tối ưu chính mục tiêu xếp hạng. Đạo hàm của $\mathcal{L}_{3D}$ theo $\mathbf{w}$ có dạng đóng:

$$
\frac{\partial \mathcal{L}_{3D}}{\partial \mathbf{w}} = -\sum_{(u,i,j)} q^{3D}_{u,i}\,(1 - q^{3D}_{u,i})\,\phi_{u,i}\,\log \sigma\big(s(u,i) - s(u,j)\big)
$$

Nên tính tay được, không cần thư viện đạo hàm tự động.

Để tránh lời giải tầm thường (đẩy $q^{3D}$ về 0 cho mất mát nhỏ), $\mathbf{w}$ có điều chuẩn L2. Các $\lambda_b$ vẫn chọn theo NDCG@10 trên tập validation của mục tiêu mua, không học bằng mất mát huấn luyện.

Đây là điểm có thể thành đóng góp phương pháp. Nhưng phải so với cách học trọng số hành vi trong MBGCN [R4] và cách căn chỉnh hành vi phụ với hành vi đích trong MBA [R5].

### 3.4. Chọn mẫu âm có tính tới lượt hiển thị

Không có hành vi không đồng nghĩa với không thích [R1].

- Mẫu âm $j$ được ưu tiên lấy từ $\mathcal{E}_u$: sản phẩm **đã hiển thị** mà người dùng không bấm. Phần còn lại lấy ngẫu nhiên theo độ phổ biến.
- Khi đánh giá, báo cáo thêm kết quả có hiệu chỉnh xu hướng hiển thị (propensity), theo cách nhìn "gợi ý như một can thiệp" của Schnabel và cộng sự [R10]. Phần này để ở mức phân tích phụ.

### 3.5. Cài đặt

- Viết bằng Python, chỉ dùng **NumPy**. Tự cài BPR, các mục tiêu đa hành vi và đạo hàm (đều có dạng đóng), không dùng thư viện gợi ý dựng sẵn và không dùng PyTorch. Như vậy toàn bộ thuật toán do đề tài tự viết, đúng quyết định "tự xây dựng mô hình" ở [00-quyet-dinh-nen-tang.md](../chuan/00-quyet-dinh-nen-tang.md). Lý do chọn ghi ở [07-ghi-chu.md](07-ghi-chu.md).
- Thư viện chỉ dùng cho phần hạ tầng: pandas (đọc và làm sạch dữ liệu), SciPy (kiểm định Wilcoxon), matplotlib (biểu đồ), `psycopg` (đọc PostgreSQL).
- Có một bài kiểm tra đạo hàm bằng sai phân hữu hạn cho mỗi hàm mất mát, để chứng minh đạo hàm tính tay là đúng.

## 4. Các hướng mở rộng để khai thác tối đa đề tài

Sắp theo thứ tự nên làm sau khi phần lõi (mục 2 và 3) đã có kết quả. Mỗi hướng là một câu hỏi phụ có thể thành một mục trong luận văn hoặc một bài báo riêng.

| Mã | Hướng | Câu hỏi | Vì sao đặc thù cho ROBOTICA | Công sức |
| --- | --- | --- | --- | --- |
| E1 | Tín hiệu biến hình, hợp thể, chọn dáng | Xem biến hình có là tín hiệu mạnh hơn xoay thường với khách Transformers không? | Website có clip biến hình và hợp thể thật (Bruticus và 5 Combaticons, bộ Alliance) | Thấp, có sẵn dữ liệu nếu ghi sự kiện |
| E2 | Phân tích theo nhóm | Tín hiệu 3D có ích khác nhau giữa Gundam, Transformers, Super Sentai không? | Ba dòng sản phẩm có kiểu sưu tầm khác nhau (tỷ lệ, biến hình, hợp thể) | Thấp, chỉ là cắt kết quả theo nhóm |
| E3 | Gợi ý theo bộ hợp thể | Người khám phá kỹ một thành viên có hay mua các thành viên còn lại không? Gợi ý theo bộ có tốt hơn gợi ý từng món không? | Quan hệ `members`, `combinesInto` có sẵn trong `model-features.ts` | Trung bình |
| E4 | Đặc trưng hình học 3D cho sản phẩm mới | Độ giống hình dáng giữa các file `.glb` (mô tả D2 [R11]) có giúp gợi ý sản phẩm chưa có lượt xem không? | Mọi sản phẩm đều có file `.glb` | Trung bình; danh mục nhỏ nên không huấn luyện mạng sâu |
| E5 | Gợi ý giải thích được | Lời giải thích dựa trên hành vi 3D ("vì bạn đã xem kỹ dạng xe của Optimus Prime") có được người dùng đánh giá hữu ích hơn không? | Tín hiệu 3D cụ thể, dễ diễn đạt | Trung bình, cần khảo sát người dùng |
| E6 | Gợi ý theo phiên cho khách vãng lai | Chuỗi sự kiện 3D trong phiên có dự đoán món xem tiếp theo không? | Khách chưa đăng nhập vẫn có `visitor_id` | Cao, cần nhiều phiên |
| E7 | Thử nghiệm A/B trực tuyến | Gợi ý có tín hiệu 3D có tăng tỷ lệ thêm giỏ không (câu hỏi Q3)? | Website thật đang chạy | Cao, cần lưu lượng |
| E8 | Công bố bộ dữ liệu | Bộ dữ liệu hành vi 3D đã ẩn danh, kèm bộ mô phỏng | Hiếm bộ dữ liệu công khai có tương tác 3D | Thấp nếu dữ liệu đã sạch |

**Gợi ý ưu tiên:** E1 và E2 gần như miễn phí khi phần lõi xong, và làm luận văn sâu hơn nhiều. E3 và E4 là điểm nhấn riêng của đề tài. E6 và E7 chỉ làm khi có đủ dữ liệu thật.

## 5. Kiến trúc tích hợp vào website

```
Trình duyệt ──sự kiện──▶ Route Handler /api/events ──▶ bảng events (PostgreSQL)
                                                           │
                                     xuất dữ liệu (đọc) ◀──┘
                                           │
                              ai/ (Python): làm sạch → đặc trưng q3D → huấn luyện → đánh giá
                                           │
                       ghi kết quả ──▶ bảng recommendations, item_similarity (PostgreSQL)
                                           │
Trang sản phẩm, trang chủ, giỏ hàng ◀── đọc qua src/server/repo (có dự phòng theo độ phổ biến)
```

- Huấn luyện chạy theo lô (ví dụ mỗi đêm, hoặc chạy tay khi làm thực nghiệm). Website không gọi mô hình trực tiếp, nên không cần dựng máy chủ AI riêng.
- Mỗi lần ghi kết quả có `model_version`, để trang quản trị so được các phiên bản và quay lại bản cũ khi cần.
- Người dùng chưa có lịch sử nhận gợi ý theo độ phổ biến, hoặc theo độ giống nội dung (E4).
