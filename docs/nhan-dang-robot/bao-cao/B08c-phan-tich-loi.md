# B08c. Phân tích 100 ảnh mô hình cuối đoán sai

Làm ngày 16/11/2026. Kế hoạch B8 (mục "Phân tích lỗi") định để chủ dự án gán loại cho 100 ảnh đoán sai. Theo quyết định của chủ dự án ngày 16/11/2026, Claude gán loại thay (cùng cách đã làm ở B3).

## 1. Mục tiêu

- Biết mô hình sai vì đâu: nhãn của bộ dữ liệu sai, hai robot giống nhau, ảnh khó, đúng nhân vật nhưng sai dòng, hay kiểu ảnh lạ.
- Ước lượng độ chính xác thật khi bỏ phần lỗi do nhãn.

## 2. Đầu vào, đầu ra

**Đầu vào:**
- Mô hình đang chạy trên web: `robotrec-vit-b16-clip-dff6fdbb-s44` (cấu hình F, hạt giống 44).
- Logits trên tập test (6.310 ảnh, 195 lớp) của B8; mô hình sai 1.263 ảnh (top-1 79,98%).

**Đầu ra** (ở `<ROBOTREC_DATA>/b08/ai-cham-loi/`, không vào git vì có ảnh):
- `muc.csv`: 100 ảnh được chọn (nhãn, lớp đoán, xác suất, miền ảnh).
- `to-01.jpg` … `to-25.jpg`: tờ ảnh để chấm.
- `ai.csv`: loại lỗi Claude gán kèm ghi chú; `ai-kem-muc.csv`: gộp hai file.

## 3. Công cụ và môi trường

Python 3.11, NumPy, pandas, Pillow. Script dựng tờ ảnh: `ml/scripts/b08c_phan_tich_loi.py`. Claude xem từng tờ ảnh và gán loại.

## 4. Phương pháp

- **Chọn mẫu:** rút ngẫu nhiên không lặp 100 trong 1.263 ảnh sai, `numpy.random.default_rng(42)`.
- **Tờ ảnh:** mỗi dòng gồm ảnh test, 2 ảnh huấn luyện ngẫu nhiên của robot theo nhãn và 2 ảnh của robot mô hình đoán, kèm xác suất mô hình gán.
- **Sáu loại lỗi** (giống trang chấm của B8; mỗi ảnh một nguyên nhân chính):

| Mã | Loại | Quy ước khi chấm |
| --- | --- | --- |
| nhan-sai | Nhãn sai | Ảnh không phải robot ghi trong nhãn: robot khác, bản khác cùng tên (G1 thay vì Movie), người, đồ vật; hoặc không thấy robot (chỉ phụ kiện, linh kiện, hộp đóng) |
| giong-nhau | Hai robot giống nhau | Nhãn đúng, robot đoán trông rất giống (GM và GM II, 00 và Exia), hoặc hai robot là các dạng của nhau (Thunder Ultrazord chứa Thunder Megazord) |
| anh-kho | Ảnh khó | Nhãn đúng nhưng ảnh nhỏ, mờ, tối, chỉ một phần, nhiều robot, bộ phận bày rời |
| sai-dong | Đúng nhân vật, sai dòng | Nhãn đúng, mô hình đoán cùng nhân vật ở dòng khác (Jetfire G1 → Jetfire Movie) |
| mien-la | Kiểu ảnh lạ | Nhãn đúng nhưng là tranh vẽ, nét vẽ, hộp, thẻ, trang sách, dạng xe/thú |
| khac | Khác | Không thuộc loại nào hoặc không chắc |

- **Thêm một nhận xét:** trong các ảnh nhãn sai, đếm ảnh mà lớp mô hình đoán chính là robot thật trong ảnh.
- Khoảng tin cậy 95% Wilson cho tỉ lệ.

### Giải thích bằng lời thường

Lấy ngẫu nhiên 100 ảnh mô hình trả lời sai, xem từng ảnh để hiểu vì sao sai. Mỗi ảnh đặt cạnh vài ảnh mẫu của robot đúng và robot mô hình đoán, để so sánh bằng mắt.

## 5. Kết quả

**Bảng 1. Loại lỗi trong 100 ảnh đoán sai**

| Loại | Số ảnh | KTC 95% | Xác suất mô hình gán cho lớp đoán (trung vị) |
| --- | --- | --- | --- |
| Nhãn sai | 44 | [35; 54] | 0,56 |
| Kiểu ảnh lạ | 24 | [17; 33] | 0,34 |
| Ảnh khó | 19 | [13; 28] | 0,31 |
| Hai robot giống nhau | 8 | [4; 15] | 0,67 |
| Đúng nhân vật, sai dòng | 3 | [1; 8] | 0,53 |
| Khác | 2 | [1; 7] | 0,17 |

- Trong 44 ảnh nhãn sai, **14 ảnh** mô hình đoán đúng robot thật trong ảnh, thường với xác suất cao: Optimus Prime G1 95%, Volcanicus 100%, Zeta Gundam 99%, Gouf 92%, Supertrain Megazord 93%.
- Nhãn sai hay gặp nhất là bản khác cùng tên: Shockwave, Arcee, Smokescreen, Bumblebee, Wheeljack, Megatron bị gán sang dòng khác (G1, Movie, Prime, WFC, One).
- 89 trong 100 lỗi vẫn đúng franchise.

**Bảng 2. Ước lượng độ chính xác trên test khi tính đến nhãn sai** (suy ra từ mẫu 100 ảnh)

| Cách tính | Top-1 |
| --- | --- |
| Như B8 (tin mọi nhãn) | 79,98% |
| Tính là đúng 14% lỗi mà mô hình đoán đúng nội dung thật (≈ 177 ảnh) | ≈ 82,8% |
| Bỏ ảnh nhãn sai khỏi tập test (44% số lỗi, KTC [35; 54]%) | ≈ 87,7% [86,0; 89,7] |

## 6. Phân tích

- **Gần một nửa số lỗi đến từ nhãn của bộ dữ liệu, không phải từ mô hình.** Điều này khớp với B3: khoảng một phần tư ảnh tải về sai nhãn. Lọc tự động giữ lại nhiều ảnh sai, nên ảnh sai nằm cả trong tập test. Con số 79,98% vì vậy là **cận dưới**; trên ảnh nhãn đúng mô hình đạt khoảng 86–90%.
- **Lỗi thật của mô hình chủ yếu do ảnh ngoài kiểu thường gặp** (kiểu ảnh lạ 24, ảnh khó 19). Khi gặp những ảnh này mô hình thường không chắc (trung vị 0,31–0,34), nên luật ngưỡng ở B8 sẽ từ chối phần lớn chúng thay vì trả lời sai.
- **Nhầm giữa hai robot thật sự giống nhau ít** (8 ảnh), nhưng lúc nhầm mô hình lại khá tự tin (0,67). Các cặp hay nhầm: GM và GM II, 00 Gundam và Exia, God và Shining Gundam, các dạng ghép của cùng một Megazord.
- **Sai dòng ít** (3 ảnh). Phần lớn chuyện "cùng tên khác dòng" nằm ở nhãn sai chứ không ở mô hình.
- **Gợi ý làm sạch dữ liệu:**
  - kiểm lại các lớp cùng tên khác dòng;
  - bỏ ảnh không có robot (phụ kiện, linh kiện, người, đồ chơi lắp ghép, hộp đóng);
  - với lớp Super Sentai/Power Rangers, bỏ ảnh siêu nhân và ảnh zord rời.

## 7. Hạn chế và rủi ro

- **Người chấm là AI.** Ở B3, độ khớp giữa Claude và người trên từng ảnh chỉ ở mức trung bình (κ 0,36–0,45), dù tỉ lệ tổng gần nhau. Từng ảnh ở đây có thể bị gán khác nếu người chấm, nhất là ranh giới giữa nhãn sai, kiểu ảnh lạ và ảnh khó (ví dụ thẻ vỉ in hình robot ghép, phụ kiện của đúng robot).
- **Cỡ mẫu 100:** khoảng tin cậy rộng khoảng ±10 điểm.
- **Bảng 2 là ước lượng thô:** giả định 100 ảnh đại diện cho cả 1.263 lỗi, và chỉ xét lỗi, không xét ảnh nhãn sai mà mô hình "đoán đúng theo nhãn".
- Một số robot Super Sentai ít gặp Claude không nhận chắc chắn (2 ảnh "khác"; #74 và #98 dựa vào việc ảnh không giống ảnh mẫu của lớp).

## 8. Tái lập

```
ml/.venv/Scripts/python ml/scripts/b08c_phan_tich_loi.py    # chọn 100 ảnh sai (hạt giống 42), dựng 25 tờ ảnh, ghi muc.csv
# Chấm: xem to-01..25.jpg, ghi ai.csv (stt, ai, ghi_chu); thống kê bằng pandas, KTC Wilson
```

Các bước của script: đọc `b04_splits.csv.gz`, `robots.json`, `runs/b07/F-vit_b16_clip-s44/logits_test.npy`; xác suất `softmax(logits / 0,7758)`; ảnh sai là `argmax ≠ nhãn`; chọn bằng `default_rng(42).choice(sai, 100, replace=False)`; ảnh mẫu lấy từ tập train bằng `default_rng(7)`.
