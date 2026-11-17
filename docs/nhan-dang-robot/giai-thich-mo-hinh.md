# Giải thích các mô hình dùng để huấn luyện

Ghi ngày 15/11/2026. Tài liệu này giải thích bằng lời thường các mô hình đã dùng ở B5 và B6. Số liệu lấy từ báo cáo B05, B06, B07, B08, B09.

## Tóm tắt

Dự án **không xây mạng nơ-ron từ đầu**. Dự án lấy các mạng nổi tiếng đã được những nhóm nghiên cứu lớn huấn luyện sẵn trên hàng triệu ảnh, rồi dạy lại để chúng phân biệt 195 robot. Cách làm này gọi là **học chuyển giao** (transfer learning). Có hai nhóm mô hình, dùng ở hai bước khác nhau:

| Bước | Cách dùng mô hình | Các mô hình |
|---|---|---|
| **B5: mô hình nền** (mốc để so) | Giữ nguyên mạng có sẵn, **không sửa gì**, chỉ học một lớp phân loại rất mỏng ở cuối | CLIP ViT-B/32, CLIP ViT-B/16, CLIP ViT-L/14, DINOv2 ViT-S/14, DINOv2 ViT-B/14 |
| **B6: huấn luyện chính** | **Tinh chỉnh toàn bộ mạng** trên ảnh robot | ConvNeXt-Tiny, EfficientNetV2-S, ViT-B/16 (CLIP) |

## 1. Các khái niệm cần biết trước

- **Mô hình (mạng nơ-ron):** một hàm toán học rất lớn. Đầu vào là ảnh 224 × 224 điểm ảnh, mỗi điểm có 3 số màu. Đầu ra là 195 con số, tức xác suất của từng robot.
- **Tham số (trọng số):** các con số bên trong hàm đó. Huấn luyện là chỉnh dần các con số này để mô hình đoán đúng hơn. Ví dụ: ConvNeXt-Tiny có 28 triệu tham số, ViT-B/16 có 86 triệu.
- **Huấn luyện sẵn (pretrained):** mạng đã học trên một tập ảnh khổng lồ, nên đã biết nhận ra cạnh, góc, bề mặt kim loại, khuôn mặt, bánh xe... Dự án tận dụng kiến thức đó thay vì học lại từ đầu, vì khoảng 30 nghìn ảnh robot là quá ít để học từ con số không.
- **Thân mạng, đặc trưng và đầu phân loại:**
  - Thân mạng biến ảnh thành một dãy số tóm tắt nội dung ảnh (ví dụ 768 số). Dãy số này gọi là **đặc trưng**.
  - Đầu phân loại là lớp cuối cùng, biến đặc trưng thành 195 xác suất.
  - Mạng có sẵn đi kèm đầu phân loại cho 1.000 lớp của ImageNet. Dự án thay bằng một đầu mới cho 195 robot.
- **Tinh chỉnh (fine-tuning):** học tiếp toàn bộ mạng, cả thân lẫn đầu, trên ảnh robot. Tốc độ học được đặt nhỏ để không làm hỏng kiến thức đã có.
- **CNN và Transformer:** hai họ kiến trúc chính để xử lý ảnh.
  - **CNN (mạng tích chập)** quét ảnh bằng các "cửa sổ" nhỏ trượt khắp ảnh. Mạng nhìn chi tiết cục bộ trước, rồi ghép dần thành hình lớn.
  - **Transformer (ViT)** cắt ảnh thành các ô vuông, rồi cho mọi ô "nhìn" lẫn nhau ngay từ đầu bằng cơ chế chú ý (attention). Nhờ vậy nó nắm được quan hệ giữa các phần nằm xa nhau trong ảnh.
- **GFLOPs:** số tỉ phép tính để xử lý một ảnh. Số càng lớn thì mô hình chạy càng chậm, nhất là trong trình duyệt của khách.

## 2. Ba mô hình được tinh chỉnh ở B6

Cả ba mô hình đều lấy từ thư viện `timm`. Việc chọn ba mô hình này nhằm trả lời câu hỏi nghiên cứu RQ3: kiến trúc CNN hay Transformer, cỡ nhỏ hay lớn, thì cân bằng tốt nhất giữa độ chính xác, kích thước và tốc độ.

### 2.1. ConvNeXt-Tiny (CNN hiện đại)

- **Nguồn gốc:** Meta AI, 2022, bài báo *A ConvNet for the 2020s* (Liu và cộng sự).
- **Ý tưởng:** nhóm tác giả lấy mạng CNN kinh điển ResNet rồi hiện đại hoá từng bước bằng các mẹo thiết kế của Transformer:
  - cửa sổ tích chập lớn 7 × 7;
  - chuẩn hoá LayerNorm và hàm kích hoạt GELU;
  - khối "cổ chai ngược";
  - 4 tầng, mỗi tầng giảm dần kích thước ảnh.
- **Kết quả:** một mạng CNN thuần nhưng mạnh ngang ViT, mà vẫn chạy nhanh và dễ huấn luyện.
- **Cỡ "Tiny":** cỡ nhỏ nhất của họ ConvNeXt, gồm 28,0 triệu tham số và 8,9 GFLOPs.
- **Trọng số dùng:** `convnext_tiny.fb_in22k_ft_in1k`. Mạng học trên ImageNet-21k (khoảng 14 triệu ảnh, 21 nghìn loại vật), rồi tinh chỉnh trên ImageNet-1k (1,28 triệu ảnh, 1.000 loại).
- **Vai trò:** đại diện cho CNN cỡ vừa.

### 2.2. EfficientNetV2-S (CNN tối ưu cho tốc độ)

- **Nguồn gốc:** Google, 2021 (Tan và Le).
- **Ý tưởng chính:**
  - **Mở rộng đồng bộ:** tăng độ sâu, độ rộng và độ phân giải theo tỉ lệ cân đối với nhau.
  - **Tìm kiến trúc tự động:** máy tự dò cách sắp xếp các khối sao cho vừa chính xác vừa ít phép tính.
- **Cấu tạo:**
  - Các tầng đầu dùng khối Fused-MBConv, chạy nhanh trên GPU.
  - Các tầng sau dùng khối MBConv (tích chập tách kênh) kèm Squeeze-and-Excitation, để mạng tự cân trọng số cho từng kênh.
- **Cỡ "S":** cỡ nhỏ, gồm 20,4 triệu tham số. Đây là mô hình **ít phép tính nhất** trong ba, chỉ 5,7 GFLOPs.
- **Trọng số dùng:** `tf_efficientnetv2_s.in21k_ft_in1k`, cùng kiểu huấn luyện sẵn với ConvNeXt để việc so sánh hai CNN được công bằng.
- **Vai trò:** đại diện cho mô hình nhẹ, hợp để chạy trong trình duyệt.

### 2.3. ViT-B/16 (CLIP), Vision Transformer

- **Nguồn gốc kiến trúc:** Google, 2021, bài báo *An Image is Worth 16×16 Words* (Dosovitskiy và cộng sự).
- **Cách hoạt động:**
  1. Cắt ảnh 224 × 224 thành 14 × 14 = **196 ô**, mỗi ô 16 × 16 điểm ảnh. Đây là nghĩa của "/16".
  2. Biến mỗi ô thành một dãy số, giống như một "từ" trong câu.
  3. Thêm một token `[CLS]` đại diện cho cả ảnh.
  4. Cho tất cả đi qua 12 khối Transformer. Trong mỗi khối, mọi ô đều chú ý tới mọi ô khác.
  5. Đưa đầu ra của `[CLS]` vào đầu phân loại.
- **Cỡ "B" (Base):** cỡ vừa, gồm 85,9 triệu tham số và 33,7 GFLOPs. Đây là mô hình nặng nhất trong ba.
- **Trọng số dùng:** `vit_base_patch16_clip_224.openai`, tức **phần đọc ảnh của CLIP** (xem mục 3.1). Lý do chọn: CLIP đã thấy rất nhiều ảnh trên mạng, kể cả đồ chơi, phim và anime, nên gần với ảnh robot hơn ImageNet.
- **Thiết lập riêng:**
  - Tốc độ học nhỏ hơn hai CNN: 3·10⁻⁵, so với 10⁻⁴.
  - **Suy giảm theo tầng 0,75:** tầng càng gần đầu vào thì học càng chậm. Các tầng đầu giữ kiến thức chung, còn các tầng cuối được chỉnh nhiều hơn cho robot.
- **Vai trò:** đại diện cho họ Transformer.

## 3. Năm mô hình nền ở B5 (không tinh chỉnh)

### 3.1. CLIP (OpenAI, 2021)

- **Cách học:** học trên khoảng **400 triệu cặp ảnh và câu chú thích** lấy từ Internet. Mô hình có hai phần, một phần đọc ảnh và một phần đọc chữ. Nó được dạy để vector của ảnh nằm gần vector của đúng câu mô tả ảnh đó, nên so được ảnh với chữ.
- **Ba cỡ đã thử:**
  - **ViT-B/32:** cắt ảnh thành ô 32 × 32, chỉ có 49 ô, nên chạy nhanh nhưng kém chi tiết. Đây cũng là mô hình của cách tìm bằng ảnh cũ trên web.
  - **ViT-B/16:** ô 16 × 16.
  - **ViT-L/14 (Large):** khoảng 300 triệu tham số, ô 14 × 14. Mạnh nhất nhưng chậm nhất.

### 3.2. DINOv2 (Meta, 2023)

- **Cách học:** học **tự giám sát** trên 142 triệu ảnh, không cần nhãn hay chú thích. Mô hình tự dạy bằng cách bắt hai bản cắt khác nhau của cùng một ảnh phải cho ra đặc trưng giống nhau. Đặc trưng thu được rất tốt cho chi tiết hình dạng.
- **Hai cỡ đã thử:** ViT-S/14 (Small) và ViT-B/14.

### 3.3. Ba cách dùng mạng đóng băng

- **Zero-shot:** không học gì. Dùng CLIP so ảnh với câu "a photo of <tên robot>", rồi chọn câu gần nhất.
  - Tốt nhất chỉ đạt 23,4%, vì CLIP không biết tên của phần lớn các robot.
- **k-NN (k láng giềng gần nhất):** tìm k ảnh train có đặc trưng giống ảnh cần đoán nhất, rồi lấy nhãn chiếm đa số.
  - Tốt nhất đạt 49,0%.
- **Linear probe:** chỉ học một lớp hồi quy logistic trên đặc trưng, thân mạng giữ nguyên.
  - Tốt nhất là CLIP ViT-L/14 + linear probe, đạt **65,6% trên tập test**.
  - Đây là **mốc mà B6 phải vượt**.

## 4. Cách huấn luyện ở B6 (giống nhau cho cả ba mô hình)

| Thành phần | Thiết lập | Nói bằng lời thường |
|---|---|---|
| Hai pha | Pha 1: 2 epoch, chỉ học đầu phân loại. Pha 2: tinh chỉnh toàn mạng, tổng tối đa 30 epoch | Dạy đầu phân loại mới cho quen trước, rồi mới cho cả mạng học. Nếu học cả mạng ngay, đầu mới còn ngẫu nhiên sẽ phá thân mạng |
| Tối ưu | AdamW, weight decay 0,05 | AdamW là thuật toán chỉnh trọng số. Weight decay phạt trọng số quá lớn để mô hình không học thuộc lòng |
| Lịch tốc độ học | Khởi động 1 epoch, sau đó giảm theo đường cosine | Đầu tiên học chậm cho ổn định, cuối thì giảm dần để tinh chỉnh mịn |
| Tăng cường dữ liệu | Cắt ngẫu nhiên 35–100% ảnh, lật ngang, RandAugment (2 phép biến đổi, độ mạnh 9), đổi màu, xoá ngẫu nhiên một vùng | Mỗi epoch ảnh trông hơi khác đi, nên mô hình phải học hình dạng robot chứ không học thuộc từng ảnh |
| Làm trơn nhãn | 0,1 | Không bắt mô hình tin chắc 100%, nên độ tin mà nó báo sát thực tế hơn |
| Lấy mẫu cân bằng lớp | Lớp có n ảnh được lấy với xác suất tỉ lệ √n | Lớp ít ảnh không bị lớp nhiều ảnh lấn át |
| Dừng sớm | Dừng khi macro-F1 trên val không tăng 5 epoch liền; giữ bản tốt nhất | Tránh học quá đà |
| Tính bằng số 16 bit (AMP), cắt gradient 1,0 | | Nhanh gấp nhiều lần và vừa bộ nhớ GPU 4 GB của máy |
| 3 hạt giống | 42, 43, 44 | Mỗi cấu hình chạy 3 lần để đo độ dao động, báo kết quả dạng trung bình ± độ lệch chuẩn |

Tổng cộng có 3 kiến trúc × 3 hạt giống = 9 lần chạy, mất 20 giờ GPU.

## 5. Kết quả và mô hình được chọn

| Kiến trúc | top-1 val | top-5 val | macro-F1 val | Tham số | GFLOPs |
|---|---|---|---|---|---|
| EfficientNetV2-S | 74,01 ± 0,38% | 85,53% | 71,59% | 20,4 triệu | 5,7 |
| ConvNeXt-Tiny | 75,65 ± 0,14% | 86,28% | 73,25% | 28,0 triệu | 8,9 |
| **ViT-B/16 (CLIP)** | **78,85 ± 0,39%** | **89,29%** | **76,64%** | 85,9 triệu | 33,7 |

- **Mô hình được chọn: ViT-B/16 (CLIP).**
  - So với ConvNeXt-Tiny: cao hơn 2,7–3,6 điểm top-1, có ý nghĩa thống kê (kiểm định McNemar, p < 0,001 sau hiệu chỉnh Holm).
  - So với mốc B5: cao hơn khoảng 13 điểm. Điều này trả lời RQ2: tinh chỉnh tốt hơn hẳn dùng mạng đóng băng.
- **Trên tập test (B8):** đạt 78,29 ± 0,80%. Lỗi chủ yếu là nhầm giữa hai nhân vật cùng franchise.
- **Thí nghiệm phụ (B7):**
  - Chỉ **Mixup/CutMix** (trộn hai ảnh và trộn nhãn theo cùng tỉ lệ) cải thiện có ý nghĩa: +1,34 điểm.
  - Khởi tạo từ ImageNet-21k thay cho CLIP kém hơn 4,84 điểm, xác nhận việc chọn CLIP là đúng.
- **Cái giá của ViT là kích thước (B9):** file ONNX fp16 nặng 164 MB, chia 9 phần, nên khách phải tải khá lâu ở lần dùng đầu tiên. ConvNeXt-Tiny chỉ khoảng 54 MB nhưng kém hơn khoảng 3 điểm. Đây là đánh đổi cần nêu khi trả lời RQ3.

Chi tiết đầy đủ (cấu hình, bảng theo từng hạt giống, kiểm định thống kê) nằm ở các báo cáo B05, B06, B07, B08, B09 trong `bao-cao/`.
