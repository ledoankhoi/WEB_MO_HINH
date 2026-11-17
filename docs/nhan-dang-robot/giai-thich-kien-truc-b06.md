# ConvNeXt, EfficientNetV2 và ViT: khái niệm, cách hoạt động, cách đọc tên, 3 mô hình tinh chỉnh ở B6

Ghi ngày 15/11/2026. Tài liệu này giải thích ba kiến trúc được tinh chỉnh ở bước B6, giống như `giai-thich-clip-dinov2.md` đã làm cho B5. Cách huấn luyện và kết quả chi tiết của B6 nằm ở `giai-thich-b06.md`.

## 1. Bối cảnh: hai họ kiến trúc xử lý ảnh

B6 so sánh hai họ kiến trúc lớn nhất hiện nay:

- **CNN (mạng nơ-ron tích chập).** Họ này thống trị thị giác máy tính từ năm 2012 (AlexNet) đến khoảng 2020. B6 chọn hai đại diện: **ConvNeXt-Tiny** và **EfficientNetV2-S**.
- **Transformer cho ảnh (ViT).** Họ này ra đời năm 2021 và hiện là nền của hầu hết mô hình nền lớn (CLIP, DINOv2...). B6 chọn đại diện **ViT-B/16 khởi đầu từ CLIP**.

Mục đích của phép so sánh là trả lời **RQ3**: kiến trúc nào cân bằng tốt nhất giữa độ chính xác, kích thước và tốc độ khi chạy trong trình duyệt.

Ba mô hình khác nhau ở **hai điểm**:
- **Kiến trúc:** cách mạng nhìn ảnh.
- **Trọng số khởi đầu:** mạng đã học sẵn từ dữ liệu nào.

Cả hai điểm đều ảnh hưởng tới kết quả. Tài liệu này giải thích lần lượt từng điểm.

## 2. Khái niệm nền của CNN

### 2.1. Phép tích chập (convolution)

- **Cửa sổ nhỏ trượt khắp ảnh.** Một "cửa sổ" nhỏ, gọi là **nhân** hay **bộ lọc** (kernel), ví dụ 3 × 3 điểm ảnh, trượt lần lượt khắp ảnh.
- **Tính điểm "giống mẫu".** Tại mỗi vị trí, mạng nhân các điểm ảnh dưới cửa sổ với 9 trọng số của nhân rồi cộng lại. Kết quả cho biết vùng đó giống "mẫu" mà nhân đang tìm đến đâu.
- **Các mẫu tự học được.** Mỗi nhân học một mẫu: nhân này bắt cạnh dọc, nhân kia bắt góc, nhân khác bắt một vệt màu đỏ. Một tầng có hàng chục đến hàng trăm nhân, mỗi nhân cho ra một **bản đồ đặc trưng** (feature map). Số bản đồ gọi là **số kênh** (channels).
- **Nhân trùng lặp:** cùng một nhân được dùng ở mọi vị trí. Vì vậy CNN nhận ra một mẫu dù nó nằm ở đâu trong ảnh, và cần ít tham số.

### 2.2. Xếp chồng tầng và thu nhỏ ảnh

- **Xếp chồng tầng.** Các tầng tích chập xếp chồng lên nhau. Tầng sau nhận đầu ra của tầng trước, nên ghép mẫu đơn giản thành mẫu phức tạp: cạnh, rồi góc, rồi chi tiết như mắt hay bánh xe, rồi bộ phận như đầu hay tay, rồi cả robot.
- **Thu nhỏ ảnh (downsampling).** Sau mỗi giai đoạn (stage), bản đồ đặc trưng được thu nhỏ một nửa mỗi chiều, đồng thời số kênh tăng lên. Nhờ vậy mỗi điểm ở tầng sâu "nhìn" được vùng ngày càng rộng trên ảnh gốc. Vùng này gọi là **vùng tiếp nhận** (receptive field).
- **Gộp toàn cục.** Ở cuối mạng, bản đồ đặc trưng (ví dụ 7 × 7 × 768) được lấy trung bình theo không gian, thành một vector 768 số. Bước này gọi là **gộp trung bình toàn cục** (global average pooling). Vector này đi vào đầu phân loại.

### 2.3. Các thành phần hay gặp

| Thành phần | Ý nghĩa |
|---|---|
| **Tích chập tách kênh** (depthwise convolution) | Mỗi kênh có nhân riêng, không trộn các kênh với nhau. Ít phép tính hơn hẳn tích chập thường. Thường đi kèm **tích chập 1 × 1** (pointwise) để trộn kênh |
| **Kết nối tắt** (residual connection) | Đầu vào của khối được cộng thẳng vào đầu ra. Nhờ vậy huấn luyện được mạng rất sâu. Ý tưởng từ ResNet (He và cộng sự, 2016) |
| **Chuẩn hoá** | Đưa số liệu về cùng thang để học ổn định. **BatchNorm** chuẩn hoá theo cả lô ảnh, nên phụ thuộc số ảnh mỗi lô. **LayerNorm** chuẩn hoá trong từng ảnh, nên không phụ thuộc lô |
| **Hàm kích hoạt** | Phép biến đổi phi tuyến sau mỗi tầng: ReLU (cắt số âm về 0), GELU và SiLU (Swish) là các bản "mềm" hơn |
| **Cổ chai ngược** (inverted bottleneck) | Khối mở rộng số kênh ra (ví dụ gấp 4), xử lý, rồi thu hẹp lại |

### 2.4. CNN khác ViT ở đâu

| | CNN | ViT |
|---|---|---|
| Cách nhìn | **Cục bộ trước, toàn cục sau**: cửa sổ nhỏ, xếp nhiều tầng mới nhìn được toàn ảnh | **Toàn cục ngay từ đầu**: mỗi ô chú ý tới mọi ô khác ở mọi tầng |
| "Thiên hướng có sẵn" (inductive bias) | Mạnh: tin rằng điểm ảnh gần nhau liên quan nhau, mẫu giống nhau ở mọi vị trí | Yếu: phải tự học những điều đó từ dữ liệu |
| Cần bao nhiêu dữ liệu để học từ đầu | Ít hơn | Rất nhiều. Bù lại, khi có đủ dữ liệu thì thường mạnh hơn |
| Tốc độ | Thường nhanh, hợp thiết bị yếu | Phép tính tăng theo bình phương số ô |

Trong dự án, cả ba mạng **không học từ đầu** mà khởi đầu từ trọng số đã huấn luyện sẵn. Vì vậy điểm yếu "cần nhiều dữ liệu" của ViT đã được CLIP bù trước.

## 3. Dữ liệu huấn luyện sẵn: ImageNet và CLIP

| Tên | Nội dung |
|---|---|
| **ImageNet-1k** | Bộ dữ liệu chuẩn của cuộc thi ILSVRC 2012: khoảng 1,28 triệu ảnh train, 1.000 loại vật (chó, xe hơi, cái cốc...), mỗi ảnh có một nhãn do người gán |
| **ImageNet-21k** (còn gọi ImageNet-22k) | Bộ đầy đủ: khoảng 14 triệu ảnh, khoảng 21.800 loại vật |
| **in21k_ft_in1k**, **in22k_ft_in1k** | Học trên ImageNet-21k trước, rồi tinh chỉnh (ft, *fine-tuned*) trên ImageNet-1k. Mạng thấy nhiều loại vật hơn hẳn so với chỉ học 1k |
| **CLIP (openai)** | 400 triệu cặp ảnh và câu chú thích từ Internet (xem `giai-thich-clip-dinov2.md`) |

Hai CNN dùng **cùng kiểu** trọng số (21k rồi 1k), để so sánh giữa chúng công bằng. ViT dùng trọng số CLIP, vì B5 cho thấy đặc trưng CLIP hợp nhất với ảnh robot.

## 4. ConvNeXt-Tiny

### 4.1. Tên gọi

- **ConvNeXt** đọc là "Conv-Next". Tên ghép từ *Convolution* (tích chập) và *Next* (thế hệ tiếp theo). Tên cũng gợi tới ResNeXt, một biến thể của ResNet mà ConvNeXt mượn ý tưởng.
- **Nguồn:** Meta AI và Đại học UC Berkeley, 2022, bài báo *A ConvNet for the 2020s* (Liu và cộng sự).
- **"Tiny"** là cỡ nhỏ nhất trong họ. Các cỡ: **T**iny 28 triệu tham số, **S**mall 50 triệu, **B**ase 89 triệu, **L**arge 198 triệu, **XL** 350 triệu.

### 4.2. Ý tưởng: hiện đại hoá CNN bằng bài học từ Transformer

Khi ViT vượt CNN, nhóm tác giả đặt câu hỏi: ViT thắng nhờ cơ chế chú ý, hay nhờ những chi tiết thiết kế và cách huấn luyện đi kèm? Để trả lời, họ lấy ResNet-50 và **sửa từng bước một**, đo độ chính xác sau mỗi bước:

| Bước | Thay đổi | Lấy cảm hứng từ |
|---|---|---|
| 1 | Công thức huấn luyện hiện đại: 300 epoch, AdamW, Mixup, CutMix, RandAugment... | Cách huấn luyện ViT |
| 2 | Tỉ lệ số khối giữa 4 giai đoạn thành 3 : 3 : 9 : 3 | Swin Transformer |
| 3 | Tầng đầu "cắt ô": tích chập 4 × 4, bước 4, không chồng lấn | Cách ViT cắt ảnh thành ô |
| 4 | Dùng tích chập tách kênh, tăng độ rộng | ResNeXt; tương tự cách trộn thông tin theo không gian của attention |
| 5 | Khối cổ chai ngược (mở rộng 4 lần) | Khối MLP của Transformer |
| 6 | Nhân lớn **7 × 7** | Cửa sổ chú ý của Swin |
| 7 | ReLU thành **GELU**, ít hàm kích hoạt hơn, ít tầng chuẩn hoá hơn, BatchNorm thành **LayerNorm**, tầng thu nhỏ ảnh tách riêng | Transformer |

Kết quả là một mạng **thuần tích chập, không có attention**, nhưng chính xác ngang Swin Transformer cùng cỡ, mà vẫn đơn giản và nhanh như CNN.

### 4.3. Cách hoạt động

```
Ảnh 224×224×3
   │ tầng đầu: tích chập 4×4, bước 4 (cắt ô)          → 56×56×96
   ▼
Giai đoạn 1: 3 khối ConvNeXt                         → 56×56×96
   │ thu nhỏ (LayerNorm + tích chập 2×2, bước 2)
Giai đoạn 2: 3 khối                                  → 28×28×192
   │ thu nhỏ
Giai đoạn 3: 9 khối                                  → 14×14×384
   │ thu nhỏ
Giai đoạn 4: 3 khối                                  → 7×7×768
   │ gộp trung bình toàn cục + LayerNorm
   ▼
Vector 768 số ──► đầu phân loại mới ──► 195 xác suất
```

**Một khối ConvNeXt** (lặp tổng cộng 18 lần):

```
đầu vào (C kênh)
  ├─► tích chập tách kênh 7×7     (nhìn vùng 7×7 quanh mỗi điểm)
  │   LayerNorm
  │   tích chập 1×1: C → 4C       (mở rộng)
  │   GELU
  │   tích chập 1×1: 4C → C       (thu hẹp)
  │   nhân hệ số tầng (layer scale)
  └─► cộng với đầu vào (kết nối tắt)
```

### 4.4. Trong dự án

- **Tên trong thư viện timm:** `convnext_tiny.fb_in22k_ft_in1k`. Đọc từng phần:
  - `convnext_tiny`: ConvNeXt cỡ Tiny;
  - `fb`: trọng số do Facebook (Meta) công bố;
  - `in22k_ft_in1k`: học trên ImageNet-22k rồi tinh chỉnh trên ImageNet-1k.
- **Thông số:** 28,0 triệu tham số; 8,9 GFLOPs mỗi ảnh; đặc trưng 768 chiều.
- **Huấn luyện trên máy nhà (GPU 4 GB):** khoảng 158 ảnh/giây; bộ nhớ đỉnh 2,4 GB.
- **Ưu điểm cho dự án:**
  - Dùng LayerNorm, nên chia lô 64 thành 2 lô 32 cho GPU nhỏ không làm đổi kết quả.
  - File ONNX nhỏ: bản fp16 khoảng 54 MB (đo ở lần chạy thử B9).

## 5. EfficientNetV2-S

### 5.1. Tên gọi

- **EfficientNet** nghĩa là "mạng hiệu quả": chính xác cao với ít tham số và ít phép tính. Bản đầu của Google năm 2019 (Tan và Le).
- **V2** là thế hệ thứ hai: *EfficientNetV2: Smaller Models and Faster Training* (Tan và Le, Google, 2021). Mục tiêu thêm của V2 là **huấn luyện nhanh hơn**.
- **"S"** là cỡ Small. Các cỡ: **S** khoảng 22 triệu tham số, **M** khoảng 54 triệu, **L** khoảng 120 triệu, **XL** khoảng 208 triệu.

### 5.2. Ba ý tưởng chính

**(a) Tìm kiến trúc tự động (NAS, Neural Architecture Search).**
- Thay vì kỹ sư tự thiết kế, một thuật toán thử hàng nghìn cách sắp xếp khối, rồi chọn cách cân bằng tốt nhất giữa độ chính xác và chi phí.
- Ở V2, tiêu chí chi phí tính cả **tốc độ huấn luyện** thật trên phần cứng (*training-aware NAS*), không chỉ số phép tính trên giấy.

**(b) Mở rộng đồng bộ (compound scaling).**
- Muốn mạng lớn hơn thì tăng **cùng lúc** độ sâu (số tầng), độ rộng (số kênh) và độ phân giải ảnh theo tỉ lệ cân đối, thay vì chỉ tăng một yếu tố.
- Từ một mạng gốc tìm bằng NAS, nhân lên được cả họ S, M, L.

**(c) Hai loại khối: MBConv và Fused-MBConv.**
- **MBConv** (*Mobile inverted Bottleneck Convolution*, từ MobileNetV2):
  - tích chập 1 × 1 mở rộng kênh;
  - tích chập tách kênh 3 × 3;
  - **Squeeze-and-Excitation**;
  - tích chập 1 × 1 thu hẹp;
  - kết nối tắt.
  
  Khối này rất ít phép tính, nhưng tích chập tách kênh chạy **chậm trên GPU** khi bản đồ đặc trưng còn lớn.
- **Fused-MBConv** (mới ở V2): gộp "1 × 1 mở rộng + tách kênh 3 × 3" thành **một tích chập 3 × 3 thường**. Nhiều phép tính hơn trên giấy, nhưng chạy nhanh hơn trên GPU ở các tầng đầu.
- **V2 dùng Fused-MBConv ở 3 giai đoạn đầu và MBConv ở 3 giai đoạn sau.**
- **Squeeze-and-Excitation (SE):**
  - "Ép" mỗi kênh thành một con số (trung bình cả bản đồ).
  - Từ các con số đó, tính ra trọng số 0–1 cho từng kênh.
  - Nhân lại vào các kênh.
  
  Nhờ vậy mạng tự quyết với ảnh này thì kênh nào (ví dụ kênh "màu đỏ", kênh "góc cạnh") quan trọng.

**Ngoài ra:** V2 dùng **học tăng dần** (progressive learning) khi huấn luyện gốc. Ảnh nhỏ và ít tăng cường ở đầu, ảnh to và tăng cường mạnh dần về sau. Dự án không dùng cách này; ảnh vào cố định 224 × 224.

### 5.3. Cách hoạt động

```
Ảnh 224×224×3
   │ tích chập 3×3, bước 2                          → 112×112×24
Giai đoạn 1: 2 khối Fused-MBConv (mở rộng 1)        → 112×112×24
Giai đoạn 2: 4 khối Fused-MBConv (mở rộng 4)        → 56×56×48
Giai đoạn 3: 4 khối Fused-MBConv (mở rộng 4)        → 28×28×64
Giai đoạn 4: 6 khối MBConv + SE (mở rộng 4)         → 14×14×128
Giai đoạn 5: 9 khối MBConv + SE (mở rộng 6)         → 14×14×160
Giai đoạn 6: 15 khối MBConv + SE (mở rộng 6)        → 7×7×256
   │ tích chập 1×1 → 1.280 kênh, gộp trung bình toàn cục
   ▼
Vector 1.280 số ──► đầu phân loại mới ──► 195 xác suất
```

Mạng dùng BatchNorm và hàm kích hoạt SiLU (Swish).

### 5.4. Trong dự án

- **Tên trong timm:** `tf_efficientnetv2_s.in21k_ft_in1k`. Đọc từng phần:
  - `tf`: trọng số chuyển từ bản TensorFlow gốc của Google;
  - `efficientnetv2_s`: EfficientNetV2 cỡ S;
  - `in21k_ft_in1k`: học trên ImageNet-21k rồi tinh chỉnh trên ImageNet-1k.
- **Thông số:** 20,4 triệu tham số; **5,7 GFLOPs**, ít nhất trong ba mô hình; đặc trưng 1.280 chiều.
- **Huấn luyện trên máy nhà:** khoảng 137 ảnh/giây; bộ nhớ đỉnh 2,8 GB. Mạng nhiều tầng nhỏ (171 tầng có trọng số), nên chạy không nhanh như số phép tính gợi ý.
- **Lưu ý kỹ thuật:**
  - Mạng này **chậm 6,4 lần** nếu dùng bố cục bộ nhớ `channels_last` (đo ở B0), nên B6 giữ bố cục mặc định.
  - Mạng dùng BatchNorm, nên chia lô thành 2 × 32 làm thống kê chuẩn hoá tính trên 32 ảnh thay vì 64. Vì vậy mạng này chỉ chạy trên máy nhà, để mọi lần chạy giống điều kiện nhau.
- **Kích thước file:** chưa xuất ONNX. Ước tính bản fp16 khoảng 40 MB (20,4 triệu tham số × 2 byte), nhỏ nhất trong ba.

## 6. ViT-B/16 (CLIP)

### 6.1. Tên gọi

- **ViT** là **Vision Transformer** (Dosovitskiy và cộng sự, Google, 2021).
- **B** là cỡ Base: 12 khối Transformer, độ rộng 768, 12 đầu chú ý.
- **/16** là ô 16 × 16 điểm ảnh. Ảnh 224 × 224 thành lưới 14 × 14 = 196 ô.
- **(CLIP)** nghĩa là trọng số khởi đầu lấy từ **phần đọc ảnh của CLIP** do OpenAI huấn luyện, không phải từ ImageNet.

Cách ViT hoạt động và cách đọc tên ViT đã giải thích kỹ ở `giai-thich-clip-dinov2.md` mục 2.

### 6.2. Cách hoạt động, tóm tắt

```
Ảnh 224×224×3
   │ cắt 196 ô 16×16, mỗi ô → vector 768 số; thêm [CLS] và vị trí
   │ LayerNorm trước khi vào mạng (đặc điểm riêng của ViT trong CLIP)
   ▼
12 khối Transformer: tự chú ý (12 đầu) + MLP, mỗi khối có kết nối tắt và LayerNorm
   │ 197 vector × 768 số đi qua mọi khối, kích thước không đổi
   ▼
Vector [CLS] cuối (768 số) ──► đầu phân loại mới ──► 195 xác suất
```

**Khác với CNN:** ViT **không thu nhỏ ảnh** qua các tầng. Mạng giữ nguyên 197 vector từ đầu đến cuối, và ngay từ khối đầu tiên mỗi ô đã nhìn được toàn ảnh.

### 6.3. Trong dự án

- **Tên trong timm:** `vit_base_patch16_clip_224.openai`. Đọc từng phần:
  - `vit_base`: ViT cỡ Base;
  - `patch16`: ô 16 × 16;
  - `clip`: cấu trúc theo bản CLIP, có thêm LayerNorm đầu vào;
  - `224`: ảnh vào 224 × 224;
  - `openai`: trọng số gốc của OpenAI.
- **Thông số:** 85,9 triệu tham số; 33,7 GFLOPs, nhiều nhất trong ba; đặc trưng 768 chiều.
- **Huấn luyện:** khoảng 85 ảnh/giây trên máy nhà; bộ nhớ đỉnh 3,6 GB, gần chạm giới hạn 4 GB. Hai trong ba lần chạy được đưa sang GPU T4 của Kaggle.
- **Thiết lập riêng:**
  - tốc độ học nhỏ hơn hai CNN: 3·10⁻⁵ so với 10⁻⁴;
  - **suy giảm theo tầng 0,75:** khối càng gần ảnh thì học càng chậm, để giữ kiến thức của CLIP.
- **Kích thước file:** ONNX fp16 164 MB, chia 9 phần (B9).

## 7. So sánh ba mô hình

| Tiêu chí | ConvNeXt-Tiny | EfficientNetV2-S | ViT-B/16 (CLIP) |
|---|---|---|---|
| Họ | CNN hiện đại | CNN tối ưu hiệu quả | Transformer |
| Tác giả, năm | Meta AI, 2022 | Google, 2021 | Google (kiến trúc, 2021), OpenAI (trọng số CLIP, 2021) |
| Ý tưởng chính | CNN mượn thiết kế của Transformer | Tìm kiến trúc tự động, Fused-MBConv, mở rộng đồng bộ | Ảnh là chuỗi ô, mọi ô chú ý lẫn nhau |
| Khối cơ bản | Tách kênh 7 × 7 + cổ chai ngược | Fused-MBConv, MBConv + SE | Tự chú ý + MLP |
| Chuẩn hoá, kích hoạt | LayerNorm, GELU | BatchNorm, SiLU | LayerNorm, GELU |
| Số khối | 18 (3 + 3 + 9 + 3) | 40 (2 + 4 + 4 + 6 + 9 + 15) | 12 |
| Thu nhỏ ảnh qua các tầng | Có (56 → 7) | Có (112 → 7) | Không (luôn 14 × 14 ô) |
| Trọng số khởi đầu | ImageNet-22k → 1k | ImageNet-21k → 1k | CLIP, 400 triệu cặp ảnh và chữ |
| Tham số | 28,0 triệu | **20,4 triệu** | 85,9 triệu |
| GFLOPs mỗi ảnh | 8,9 | **5,7** | 33,7 |
| Số chiều đặc trưng | 768 | 1.280 | 768 |
| Tốc độ huấn luyện trên máy nhà | **158 ảnh/giây** | 137 ảnh/giây | 85 ảnh/giây |
| File ONNX fp16 | khoảng 54 MB | khoảng 40 MB (ước tính) | 164 MB |
| top-1 val B6 (3 hạt giống) | 75,65 ± 0,14% | 74,01 ± 0,38% | **78,85 ± 0,39%** |
| macro-F1 val B6 | 73,25 ± 0,23% | 71,59 ± 0,42% | **76,64 ± 0,43%** |

Mốc B5 (CLIP ViT-L/14 đóng băng + linear probe) đạt top-1 val 65,45%.

## 8. Kết quả nói gì

1. **Cả ba đều vượt xa mốc B5,** hơn 8,6–13,4 điểm top-1. Tinh chỉnh toàn mạng có lợi với mọi kiến trúc (RQ2).
2. **ViT-B/16 (CLIP) thắng rõ:** hơn ConvNeXt-Tiny 2,7–3,6 điểm, có ý nghĩa thống kê ở cả ba cặp cùng hạt giống. Có hai lý do khả dĩ:
   - **Trọng số CLIP** đã thấy rất nhiều ảnh đồ chơi, phim, anime. B7 xác nhận yếu tố này: cùng kiến trúc ViT mà khởi đầu từ ImageNet-21k thì kém 4,84 điểm.
   - **Cơ chế chú ý toàn cục** giúp ghép thông tin của nhiều bộ phận nằm xa nhau, điều quan trọng khi các robot chỉ khác nhau ở tổ hợp chi tiết.
3. **Giữa hai CNN, ConvNeXt hơn EfficientNetV2 khoảng 1,6 điểm,** đổi lại nhiều hơn 37% tham số và 56% phép tính. EfficientNetV2-S là lựa chọn nhẹ nhất nếu ưu tiên tốc độ tải.
4. **Đánh đổi cho RQ3:**
   - ViT chính xác nhất, nhưng file nặng gấp 3–4 lần và cần gấp 4–6 lần phép tính.
   - Với web, điều đó nghĩa là khách tải khoảng 164 MB ở lần đầu dùng (sau đó trình duyệt lưu lại), và mỗi ảnh mất lâu hơn để xử lý.
   - Dự án chấp nhận đánh đổi này vì độ chính xác quan trọng hơn. Luật chọn đặt trước khi chạy cũng chỉ ưu tiên mô hình nhẹ khi mô hình đó không kém có ý nghĩa thống kê, mà ở đây ConvNeXt kém có ý nghĩa.
5. **ViT tổng quát hoá tốt nhất:** chênh lệch giữa điểm train và điểm val là 19,3 điểm, so với 23–24 điểm ở hai CNN.

## 9. Hướng mở rộng có thể nêu trong luận văn

- Tinh chỉnh **DINOv2** hoặc **ConvNeXt khởi đầu từ CLIP**. Cả hai đều có sẵn trọng số; mục đích là tách riêng ảnh hưởng của kiến trúc và của trọng số khởi đầu.
- **Chưng cất** ViT-B/16 sang một CNN nhỏ (ConvNeXt-Tiny hoặc EfficientNetV2-S), để giữ phần lớn độ chính xác với file nhỏ hơn 3–4 lần.
- Nén int8 cho ViT. B9 đã thử nhưng bản int8 chưa đạt tiêu chí khớp ≥ 99% với PyTorch.

## 10. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| CNN | Mạng nơ-ron tích chập: nhìn ảnh bằng cửa sổ nhỏ trượt khắp ảnh |
| Nhân, bộ lọc (kernel) | Cửa sổ trọng số dùng trong tích chập, ví dụ 3 × 3 hay 7 × 7 |
| Kênh (channel) | Một bản đồ đặc trưng, mỗi kênh ứng với một mẫu mà mạng tìm |
| Vùng tiếp nhận | Phần ảnh gốc mà một điểm ở tầng sâu "nhìn thấy" |
| Tích chập tách kênh | Mỗi kênh một nhân riêng; ít phép tính |
| Kết nối tắt (residual) | Cộng đầu vào vào đầu ra của khối, giúp học mạng sâu |
| BatchNorm, LayerNorm | Chuẩn hoá theo lô ảnh, hoặc trong từng ảnh |
| Squeeze-and-Excitation | Mạng tự cân trọng số cho từng kênh theo từng ảnh |
| NAS | Tìm kiến trúc mạng tự động bằng thuật toán |
| GFLOPs | Số tỉ phép tính cho một ảnh (một phép nhân-cộng tính là 2) |
| fp16 | Lưu mỗi số bằng 16 bit (2 byte); file nhỏ bằng nửa fp32 |
| timm | Thư viện mô hình ảnh của PyTorch (PyTorch Image Models), nơi lấy cả ba mô hình |

## 11. Tài liệu tham khảo

- He, K. và cộng sự (2016). *Deep Residual Learning for Image Recognition* (ResNet). CVPR.
- Sandler, M. và cộng sự (2018). *MobileNetV2: Inverted Residuals and Linear Bottlenecks*. CVPR.
- Hu, J. và cộng sự (2018). *Squeeze-and-Excitation Networks*. CVPR.
- Tan, M. và Le, Q. (2019). *EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks*. ICML.
- Tan, M. và Le, Q. (2021). *EfficientNetV2: Smaller Models and Faster Training*. ICML.
- Dosovitskiy, A. và cộng sự (2021). *An Image is Worth 16×16 Words* (ViT). ICLR.
- Radford, A. và cộng sự (2021). *Learning Transferable Visual Models From Natural Language Supervision* (CLIP). ICML.
- Liu, Z. và cộng sự (2022). *A ConvNet for the 2020s* (ConvNeXt). CVPR.
