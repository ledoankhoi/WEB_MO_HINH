# CLIP và DINOv2: khái niệm, cách hoạt động, cách đọc tên, 5 mô hình dùng trong dự án

Ghi ngày 15/11/2026. Tài liệu giải thích hai họ mô hình dùng làm bộ trích đặc trưng ở B5. CLIP còn là điểm khởi đầu của mô hình chính ở B6.

## 1. Bối cảnh chung: "mô hình nền" và "bộ trích đặc trưng"

Muốn máy nhận ra robot trong ảnh, trước hết phải biến ảnh (hàng trăm nghìn con số màu) thành **một dãy ngắn vài trăm con số** nói lên nội dung ảnh. Dãy số đó gọi là **đặc trưng** (feature, embedding). Mạng làm việc này gọi là **bộ mã hoá ảnh** hay **bộ trích đặc trưng**.

Huấn luyện một bộ mã hoá ảnh tốt cần hàng trăm triệu ảnh và hàng nghìn giờ GPU. Một dự án luận văn không làm nổi việc đó. Vì vậy dự án dùng lại bộ mã hoá do các công ty lớn huấn luyện sẵn và công bố, gọi là **mô hình nền** (foundation model). CLIP và DINOv2 là hai mô hình nền về ảnh phổ biến nhất hiện nay.

Cả hai họ đều dùng cùng một kiến trúc là **Vision Transformer (ViT)**. Chúng **khác nhau ở cách học**: học từ dữ liệu gì, và được dạy để làm gì. Chính cách học quyết định đặc trưng của mỗi họ giỏi ở đâu.

## 2. Kiến trúc chung: Vision Transformer (ViT)

### 2.1. Tên gọi

- **ViT** là viết tắt của **Vision Transformer**, đề xuất trong bài báo *An Image is Worth 16×16 Words: Transformers for Image Recognition at Scale* (Dosovitskiy và cộng sự, Google, 2021).
- **Transformer** là kiến trúc ban đầu làm cho văn bản (dịch máy, 2017). Đây cũng là nền của ChatGPT. ViT đem nguyên kiến trúc đó sang ảnh, bằng cách **coi ảnh như một câu gồm nhiều "từ"**.

### 2.2. Cách hoạt động, từng bước

1. **Cắt ảnh thành ô (patch).** Ảnh 224 × 224 điểm ảnh được cắt thành các ô vuông bằng nhau, ví dụ 16 × 16 điểm ảnh. Mỗi ô là một "từ".
2. **Biến mỗi ô thành một vector.**
   - Một ô 16 × 16 có 3 kênh màu, tức 16 × 16 × 3 = 768 con số.
   - Một phép nhân ma trận (học được) biến dãy số này thành vector có độ dài cố định D, gọi là **độ rộng** của mạng. Ví dụ D = 768 với cỡ Base.
3. **Thêm token `[CLS]`.** Một vector đặc biệt được đặt ở đầu dãy, nhiệm vụ là "tóm tắt cả ảnh". Đầu ra của nó ở cuối mạng thường được dùng làm đặc trưng của ảnh.
4. **Thêm vị trí.** Cộng vào mỗi ô một vector vị trí (positional embedding), để mạng biết ô nào nằm ở góc trên trái, ô nào ở giữa.
5. **Đi qua nhiều khối Transformer.** Mỗi khối có hai phần:
   - **Tự chú ý (self-attention):** mỗi ô "nhìn" mọi ô khác và quyết định nên lấy thông tin từ ô nào. Ví dụ ô chứa đầu robot có thể lấy thông tin từ ô chứa ngực để nhận ra đúng nhân vật.
   - **MLP:** một mạng nhỏ xử lý riêng từng ô.
   
   Mạng có nhiều "đầu chú ý" (attention heads) chạy song song, mỗi đầu để ý một kiểu quan hệ.
6. **Lấy đầu ra.** Sau khối cuối, vector của `[CLS]` (có thể qua một phép chiếu) là **đặc trưng của ảnh**.

```
Ảnh 224×224
   │ cắt ô 16×16
   ▼
196 ô ──► 196 vector (độ dài D) + [CLS] + vị trí
   │
   ▼
Khối Transformer × 12 (hoặc 24): mọi ô chú ý lẫn nhau
   │
   ▼
Vector [CLS] cuối ──► đặc trưng của ảnh (512 / 384 / 768 số)
```

### 2.3. Cách đọc tên: ViT-B/16, ViT-L/14, ViT-S/14...

Tên có dạng **ViT-<cỡ>/<kích thước ô>**.

**Phần chữ (cỡ mô hình)** cho biết mạng sâu và rộng đến đâu:

| Ký hiệu | Tên đầy đủ | Số khối | Độ rộng D | Số đầu chú ý | Tham số (khoảng) |
|---|---|---|---|---|---|
| **S** | Small (nhỏ) | 12 | 384 | 6 | 22 triệu |
| **B** | Base (cơ bản, vừa) | 12 | 768 | 12 | 86 triệu |
| **L** | Large (lớn) | 24 | 1.024 | 16 | 304 triệu |
| g | giant (khổng lồ), chỉ có ở DINOv2 | 40 | 1.536 | 24 | 1,1 tỉ |

**Phần số sau dấu "/" (kích thước ô)** cho biết mỗi ô là bao nhiêu điểm ảnh. Với ảnh vào 224 × 224:

| Ký hiệu | Mỗi ô | Số ô mỗi chiều | Tổng số ô | Nghĩa |
|---|---|---|---|---|
| **/32** | 32 × 32 điểm ảnh | 224 / 32 = 7 | 7 × 7 = **49** | Ô to, ít ô: nhìn thô, chạy rất nhanh |
| **/16** | 16 × 16 điểm ảnh | 224 / 16 = 14 | 14 × 14 = **196** | Ô vừa: chi tiết hơn, chậm hơn |
| **/14** | 14 × 14 điểm ảnh | 224 / 14 = 16 | 16 × 16 = **256** | Ô nhỏ nhất, nhiều ô nhất: chi tiết nhất |

**Ví dụ dễ hình dung:**
- **/32** giống nhìn ảnh qua một tấm lưới thô 7 × 7. Mỗi ô che cả bàn tay hay cả cái đầu robot, nên chi tiết nhỏ như mắt, logo, hoa văn bị gộp lẫn vào nhau.
- **/16** là lưới 14 × 14. Mỗi ô cỡ một con mắt hay một ngón tay.
- **/14** là lưới 16 × 16, còn mịn hơn.

**Cái giá của ô nhỏ:** số ô tăng thì phép tính tăng nhanh, vì trong tự chú ý mỗi ô phải so với mọi ô khác. Số phép so sánh tỉ lệ với bình phương số ô: 49² ≈ 2.400; 196² ≈ 38.000; 256² ≈ 66.000. Vì vậy ViT-B/16 chậm hơn ViT-B/32 khoảng 3–4 lần dù hai mạng gần như cùng số tham số. Ở B5 đo được: B/32 trích 767 ảnh/giây, B/16 chỉ 290 ảnh/giây.

**Vì sao B/32 và B/16 có số tham số gần bằng nhau?** Tham số nằm chủ yếu trong các khối Transformer, và hai mạng có cùng số khối, cùng độ rộng. Chỉ khác ở phép chiếu ô đầu vào: B/32 có 32 × 32 × 3 × 768 ≈ 2,4 triệu tham số, B/16 có 16 × 16 × 3 × 768 ≈ 0,6 triệu. Vì thế B/32 còn nhỉnh hơn một chút (87,8 so với 86,2 triệu).

## 3. CLIP

### 3.1. Tên gọi

- **CLIP** là viết tắt của **Contrastive Language–Image Pre-training**, tức "huấn luyện trước bằng cách đối chiếu ngôn ngữ và ảnh".
  - **Contrastive (tương phản):** học bằng cách kéo các cặp đúng lại gần nhau và đẩy các cặp sai ra xa.
  - **Language–Image:** học từ cặp ảnh và chữ.
  - **Pre-training:** huấn luyện trước, sau đó đem đi dùng cho việc khác.
- **Nguồn:** OpenAI, 2021, bài báo *Learning Transferable Visual Models From Natural Language Supervision* (Radford và cộng sự).

### 3.2. Dữ liệu học

- **400 triệu cặp (ảnh, câu chú thích)** thu từ Internet, gọi là bộ WIT (WebImageText).
- Ví dụ một cặp: ảnh một món đồ chơi kèm dòng chữ "Transformers Studio Series Optimus Prime figure".
- **Không có nhãn do người gán.** Chữ đi kèm ảnh trên mạng chính là "lời giám sát". Vì vậy cách học này gọi là **giám sát bằng ngôn ngữ tự nhiên**.

### 3.3. Cấu tạo: hai bộ mã hoá

- **Bộ mã hoá ảnh:** một ViT (hoặc ResNet ở vài bản). Biến ảnh thành vector.
- **Bộ mã hoá chữ:** một Transformer văn bản (12 khối, độ rộng 512). Biến câu chữ thành vector.
- Cả hai được chiếu về **cùng một không gian** có cùng số chiều (512 với bản B, 768 với bản L). Nhờ vậy vector ảnh và vector chữ so sánh trực tiếp được với nhau.

### 3.4. Cách học

Mỗi bước học lấy một lô N cặp ảnh và chữ (bản gốc dùng N = 32.768):

1. Mã hoá N ảnh thành N vector ảnh, N câu thành N vector chữ. Chuẩn hoá mọi vector về độ dài 1.
2. Tính bảng **N × N độ giống cô-sin** giữa mọi ảnh và mọi câu.
3. **Mục tiêu:** trên mỗi hàng và mỗi cột của bảng, ô của cặp đúng (đường chéo) phải cao nhất. Ảnh i phải giống câu i hơn 32.767 câu còn lại, và ngược lại.
   - Hàm mất mát là cross-entropy đối xứng theo hàng và theo cột, gọi là InfoNCE.
   - Có một "nhiệt độ" học được để điều chỉnh độ gắt.

```
              câu 1   câu 2   câu 3  ...  câu N
   ảnh 1     [ cao ]   thấp    thấp        thấp
   ảnh 2      thấp   [ cao ]   thấp        thấp
   ảnh 3      thấp    thấp   [ cao ]       thấp
   ...
   → kéo ô đường chéo lên, đẩy các ô còn lại xuống
```

Để làm được việc đó, CLIP buộc phải học **nghĩa** của ảnh theo cách con người mô tả bằng lời: đây là vật gì, của thương hiệu nào, phong cách gì, có chữ gì trên đó.

### 3.5. CLIP giỏi gì, kém gì

**Giỏi:**
- **Zero-shot:** phân loại mà không cần ảnh mẫu, chỉ cần viết tên lớp thành câu. Đây là khả năng chỉ CLIP có.
- Hiểu **khái niệm** ở mức cao: "robot", "đồ chơi", "anime", "Gundam".
- Tách các lớp tốt bằng một lớp tuyến tính (linear probe), vì đặc trưng đã được sắp theo nghĩa.

**Kém:**
- Chi tiết hình học nhỏ, đếm, vị trí tương đối. Chú thích trên mạng ít khi mô tả những thứ này.
- Phân biệt các vật **rất giống nhau** mà ít khi được nhắc tên riêng trên mạng.
- Dễ bị **chữ trong ảnh** đánh lừa, ví dụ ảnh có in tên một robot khác.

## 4. DINOv2

### 4.1. Tên gọi

- **DINO** là viết tắt của **self-DIstillation with NO labels**, tức "tự chưng cất tri thức, không cần nhãn" (Caron và cộng sự, Meta, 2021).
  - **Chưng cất (distillation):** một mạng "trò" học bắt chước đầu ra của một mạng "thầy".
  - **Tự (self):** thầy không phải mạng khác, mà là một phiên bản của chính trò.
- **v2** là phiên bản thứ hai: *DINOv2: Learning Robust Visual Features without Supervision* (Oquab và cộng sự, Meta, 2023). Bản này phóng to dữ liệu, mô hình và gộp thêm nhiều kỹ thuật.

### 4.2. Dữ liệu học

- **142 triệu ảnh** đã được chọn lọc (bộ LVD-142M). **Không có chữ, không có nhãn.**
- **Cách chọn lọc:** từ 1,2 tỉ ảnh thô trên mạng, bỏ ảnh trùng lặp, rồi giữ những ảnh giống với các bộ dữ liệu chuẩn có chất lượng tốt. Bước này dùng đặc trưng ảnh để tìm ảnh giống nhau, không dùng chữ.

### 4.3. Cách học: tự giám sát với thầy và trò

**Tự giám sát** (self-supervised) nghĩa là mạng tự tạo bài tập từ chính ảnh, không cần ai gán nhãn. DINOv2 kết hợp ba thành phần:

**(a) Mất mát DINO, ở mức cả ảnh:**
1. Từ một ảnh, cắt ra vài **bản to** (phủ hơn nửa ảnh) và nhiều **bản nhỏ** (một góc ảnh). Các bản bị đổi màu, làm mờ, lật khác nhau.
2. **Thầy** chỉ thấy các bản to. **Trò** thấy tất cả.
3. Cả hai đưa ra một "phân bố xác suất" trên vài chục nghìn "nhóm khái niệm" tự hình thành. Trò phải cho ra phân bố giống thầy.
4. Hệ quả: dù chỉ thấy một góc nhỏ (ví dụ chỉ thấy cái đầu), trò vẫn phải nhận ra đây là cùng một vật với ảnh toàn cảnh. Mạng buộc phải học **hình dạng và bộ phận** đặc trưng của vật.

**(b) Mất mát iBOT, ở mức từng ô:**
- *iBOT* là viết tắt của *image BERT pre-training with Online Tokenizer*.
- Che ngẫu nhiên một số ô ảnh của trò. Trò phải đoán đặc trưng của các ô bị che sao cho giống đặc trưng thầy tính trên ảnh không bị che.
- Giống bài tập "điền vào chỗ trống" của BERT với văn bản.
- Hệ quả: **từng ô** có đặc trưng tốt. Vì thế DINOv2 rất mạnh ở các việc cần chi tiết vị trí như phân vùng ảnh hay ước lượng độ sâu.

**(c) Các kỹ thuật phụ:**
- **Thầy là trung bình trượt (EMA) của trò:** trọng số của thầy được cập nhật chậm theo trò, nên thầy ổn định hơn trò.
- **Định tâm và làm sắc** đầu ra của thầy (v2 dùng thuật toán Sinkhorn-Knopp), để mạng không "gian lận" bằng cách cho mọi ảnh cùng một đáp án.
- **Bộ điều chuẩn KoLeo:** đẩy đặc trưng của các ảnh khác nhau trải đều trong không gian, không dồn cục.
- **Pha cuối học ở độ phân giải cao** (518 × 518 điểm ảnh).

**Chưng cất xuống mô hình nhỏ:** Meta huấn luyện trực tiếp bản khổng lồ ViT-g/14 (1,1 tỉ tham số). Các bản nhỏ hơn (S, B, L) **học bắt chước bản g**. Vì thế bản nhỏ như ViT-S/14 mạnh hơn hẳn mức thường thấy ở cỡ của nó.

```
           ảnh gốc
         ┌────┴─────┐
     bản to       bản nhỏ / bản bị che ô
        │               │
     THẦY (EMA)       TRÒ
        │               │
   phân bố, đặc   ◄── phải giống ──  phân bố, đặc
   trưng từng ô                     trưng từng ô
```

### 4.4. DINOv2 giỏi gì, kém gì

**Giỏi:**
- Đặc trưng **thuần thị giác**: hình dạng, cấu trúc, bộ phận, kết cấu bề mặt.
- **Từng ô ảnh** có đặc trưng tốt.
- **Tra ảnh giống nhau** (k-NN): ảnh gần nhau trong không gian DINOv2 thường đúng là cùng một vật.
- Mô hình nhỏ mà mạnh, nhờ được chưng cất từ bản khổng lồ.

**Kém:**
- **Không hiểu chữ**, nên không làm được zero-shot. Muốn biết ảnh là robot nào thì bắt buộc phải có ảnh mẫu có nhãn.
- Không biết "tên gọi" hay "khái niệm do con người đặt" như CLIP. Ví dụ, nó không tự biết hai robot khác màu là cùng một nhân vật.

## 5. So sánh chi tiết CLIP và DINOv2

| Tiêu chí | CLIP | DINOv2 |
|---|---|---|
| Tên đầy đủ | Contrastive Language–Image Pre-training | self-DIstillation with NO labels, phiên bản 2 |
| Công ty, năm | OpenAI, 2021 | Meta, 2023 |
| Dữ liệu | 400 triệu cặp ảnh và chữ từ Internet, không lọc kỹ | 142 triệu ảnh đã chọn lọc, không có chữ |
| Lời giám sát | Câu chú thích đi kèm ảnh (giám sát bằng ngôn ngữ) | Không có; mạng tự tạo bài tập (tự giám sát) |
| Cách học | Tương phản: kéo cặp ảnh và chữ đúng lại gần, đẩy cặp sai ra xa | Tự chưng cất: trò bắt chước thầy trên các bản cắt khác nhau, cộng đoán ô bị che |
| Số bộ mã hoá | Hai (ảnh và chữ) | Một (ảnh) |
| Đặc trưng học được | **Ngữ nghĩa**: vật gì, tên gì, phong cách gì | **Thị giác**: hình dạng, chi tiết, cấu trúc |
| Zero-shot bằng chữ | Có | Không |
| Đặc trưng từng ô | Trung bình | Rất tốt |
| Kích thước ô | /32, /16, /14 | /14 |
| Điểm yếu điển hình | Chi tiết nhỏ, vật rất giống nhau, bị chữ trong ảnh đánh lừa | Không gắn được với tên, cần ảnh mẫu có nhãn |

**Ví dụ minh hoạ với robot:**

Hai ảnh Optimus Prime: một ảnh đồ chơi chụp trên bàn, một ảnh cảnh phim hoạt hình.
- **CLIP** có xu hướng đặt hai ảnh gần nhau, vì trên mạng cả hai đều được gọi là "Optimus Prime".
- **DINOv2** có thể đặt ảnh đồ chơi gần ảnh đồ chơi của một robot khác có hình khối tương tự, vì DINOv2 nhìn hình dạng và kết cấu.

Ngược lại, khi hai robot cùng tên nhưng khác dòng (G1 và phim live-action):
- DINOv2 dễ tách hơn, vì hình dạng khác hẳn.
- CLIP có thể bị cái tên chung kéo lại gần nhau.

## 6. Năm mô hình dùng trong dự án (bước B5)

Cả năm đều dùng ở dạng **đóng băng**: chỉ trích đặc trưng, không sửa trọng số. Ảnh vào 224 × 224.

| # | Tên trong dự án | Đọc là | Họ | Cỡ, ô | Số khối | Tham số phần ảnh | Số chiều đặc trưng | Số ô | Tốc độ trích (ảnh/giây, GPU 4 GB) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CLIP ViT-B/32 | CLIP, Vision Transformer cỡ Base, ô 32 | CLIP | B, /32 | 12 | 87,8 triệu | 512 | 49 | 767 |
| 2 | CLIP ViT-B/16 | CLIP, Vision Transformer cỡ Base, ô 16 | CLIP | B, /16 | 12 | 86,2 triệu | 512 | 196 | 290 |
| 3 | CLIP ViT-L/14 | CLIP, Vision Transformer cỡ Large, ô 14 | CLIP | L, /14 | 24 | 304,0 triệu | 768 | 256 | 81 |
| 4 | DINOv2 ViT-S/14 | DINOv2, Vision Transformer cỡ Small, ô 14 | DINOv2 | S, /14 | 12 | 21,6 triệu | 384 | 256 | 500 |
| 5 | DINOv2 ViT-B/14 | DINOv2, Vision Transformer cỡ Base, ô 14 | DINOv2 | B, /14 | 12 | 85,7 triệu | 768 | 256 | 221 |

### 6.1. CLIP ViT-B/32

- Bản CLIP nhỏ và nhanh nhất. Lưới ô thô 7 × 7.
- Đây là mô hình của **cách tìm bằng ảnh cũ** trên web (từ 04/11/2026). Dự án chọn nó vì nhẹ, chạy nhanh trong trình duyệt.
- **Kết quả B5 trên test:** zero-shot 16,0%; k-NN tốt nhất 40,8%; linear probe 55,8%. Thấp nhất trong năm mô hình.
- Kết quả này giải thích một phần vì sao cách cũ hay "lưỡng lự": ô quá thô để phân biệt các robot giống nhau.

### 6.2. CLIP ViT-B/16

- Cùng cỡ với B/32 nhưng ô nhỏ gấp đôi mỗi chiều, nên có số ô gấp 4 lần.
- **Kết quả B5 trên test:** zero-shot 16,7%; k-NN 44,1%; linear probe 60,2%. Hơn B/32 4,4 điểm linear probe, chỉ nhờ nhìn mịn hơn.
- **Đây là kiến trúc được chọn để tinh chỉnh ở B6** (`vit_base_patch16_clip_224.openai`). Sau khi tinh chỉnh, mô hình đạt 78,3% trên test. Chọn bản này vì nó cân bằng giữa độ chính xác và kích thước để chạy trên web.

### 6.3. CLIP ViT-L/14

- Bản lớn: 24 khối, 304 triệu tham số, ô 14 × 14.
- **Kết quả B5 trên test: mạnh nhất trong năm mô hình.** Zero-shot 23,4%; k-NN 49,0%; linear probe **65,6%**. Đây là **mốc** mà B6 phải vượt.
- Chậm nhất (81 ảnh/giây) và quá nặng để tinh chỉnh trên GPU 4 GB hay chạy trong trình duyệt.

### 6.4. DINOv2 ViT-S/14

- Bản nhỏ nhất: 21,6 triệu tham số, nhẹ gấp 4 lần các bản Base. Được chưng cất từ ViT-g/14.
- **Kết quả B5 trên test:** k-NN 49,5% (ngang CLIP ViT-L/14 dù nhỏ hơn 14 lần); linear probe 60,8% (ngang CLIP ViT-B/16 dù nhỏ hơn 4 lần).
- **Mô hình hiệu quả nhất tính theo kích thước.** Đây là ứng viên đáng cân nhắc nếu sau này cần mô hình rất nhẹ.

### 6.5. DINOv2 ViT-B/14

- Cỡ Base, 85,7 triệu tham số.
- **Kết quả B5 trên test:** k-NN 49,2%; linear probe 63,9%. Kém CLIP ViT-L/14 1,8 điểm, chênh lệch có ý nghĩa thống kê nhưng nhỏ, trong khi nhẹ hơn 3,5 lần.

## 7. Kết quả trong dự án nói gì về hai họ

| Mô hình | Zero-shot | k-NN tốt nhất | Linear probe |
|---|---|---|---|
| CLIP ViT-B/32 | 16,0% | 40,8% | 55,8% |
| CLIP ViT-B/16 | 16,7% | 44,1% | 60,2% |
| CLIP ViT-L/14 | 23,4% | 49,0% | **65,6%** |
| DINOv2 ViT-S/14 | không làm được | **49,5%** | 60,8% |
| DINOv2 ViT-B/14 | không làm được | 49,2% | 63,9% |

*(top-1 trên tập test 6.310 ảnh, 195 lớp; đoán mò chỉ đúng 0,51%)*

1. **Ở k-NN (tra ảnh giống nhất), DINOv2 nhỉnh hơn CLIP**, kể cả bản nhỏ nhất. Điều này đúng với lý thuyết: DINOv2 học để ảnh cùng vật nằm gần nhau theo hình dạng, nên láng giềng gần nhất thường đúng là cùng robot.
2. **Ở linear probe (có nhãn để học một lớp phân loại), CLIP ViT-L/14 thắng.** Đặc trưng của CLIP đã được sắp theo khái niệm và tên gọi, nên dễ tách bằng mặt phẳng hơn. Cỡ lớn cũng giúp nhiều. Nguyên nhân chính xác chưa được kiểm chứng riêng.
3. **Zero-shot chỉ CLIP làm được, nhưng rất thấp** (tối đa 23,4%). CLIP không biết tên của phần lớn robot ít nổi tiếng, nên vẫn phải có ảnh mẫu.
4. **Ô càng nhỏ, mô hình càng lớn thì càng tốt.** Rõ nhất trong họ CLIP: B/32 đạt 55,8%, B/16 đạt 60,2%, L/14 đạt 65,6%.
5. **Vì sao B6 chọn khởi đầu từ CLIP mà không từ DINOv2:**
   - CLIP thắng ở linear probe, là cách gần với tinh chỉnh nhất.
   - Bản ViT-B/16 của CLIP có sẵn trong thư viện `timm` với cấu hình tinh chỉnh chuẩn.
   - Kiến trúc này cũng là kiến trúc trình duyệt đã chạy được.
   
   B7 xác nhận trọng số khởi đầu rất quan trọng: cùng ViT-B/16 nhưng khởi đầu từ ImageNet-21k thì kém 4,84 điểm so với khởi đầu từ CLIP. Việc **tinh chỉnh khởi đầu từ DINOv2 chưa được thử**. Đây là một hướng mở rộng có thể nêu trong luận văn.

## 8. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Đặc trưng (feature, embedding) | Dãy số tóm tắt nội dung ảnh |
| Mô hình nền (foundation model) | Mô hình lớn được huấn luyện sẵn trên dữ liệu khổng lồ, dùng lại cho nhiều việc |
| Đóng băng (frozen) | Dùng mạng mà không sửa trọng số |
| Patch (ô) | Một mảnh vuông của ảnh, được ViT coi như một "từ" |
| Token `[CLS]` | Vector đặc biệt đại diện cho cả ảnh |
| Tự chú ý (self-attention) | Cơ chế mỗi ô lấy thông tin từ các ô khác |
| Học tương phản (contrastive learning) | Học bằng cách kéo cặp đúng lại gần, đẩy cặp sai ra xa |
| Tự giám sát (self-supervised) | Mạng tự tạo bài tập từ dữ liệu, không cần nhãn |
| Chưng cất (distillation) | Mạng trò học bắt chước đầu ra của mạng thầy |
| EMA | Trung bình trượt theo hàm mũ; trọng số thầy đi theo trò một cách chậm rãi |
| Zero-shot | Phân loại không cần ảnh mẫu, chỉ dựa vào tên lớp viết bằng chữ |
| k-NN | Lấy nhãn theo số đông của k ảnh có nhãn giống nhất |
| Linear probe | Học một lớp phân loại tuyến tính trên đặc trưng đóng băng |
| Cô-sin | Độ giống nhau giữa hai vector, từ −1 đến 1 |

## 9. Tài liệu tham khảo

- Dosovitskiy, A. và cộng sự (2021). *An Image is Worth 16×16 Words: Transformers for Image Recognition at Scale*. ICLR.
- Radford, A. và cộng sự (2021). *Learning Transferable Visual Models From Natural Language Supervision*. ICML.
- Caron, M. và cộng sự (2021). *Emerging Properties in Self-Supervised Vision Transformers* (DINO). ICCV.
- Zhou, J. và cộng sự (2022). *iBOT: Image BERT Pre-Training with Online Tokenizer*. ICLR.
- Oquab, M. và cộng sự (2023). *DINOv2: Learning Robust Visual Features without Supervision*. TMLR.
