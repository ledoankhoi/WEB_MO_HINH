# Kế hoạch chi tiết: nhận dạng robot từ ảnh bằng học có giám sát

Ngày lập: 07/11/2026. Trạng thái: **chủ dự án đã duyệt ngày 07/11/2026**; tiến độ từng bước xem [nhat-ky.md](nhat-ky.md).

## 0. Tóm tắt

- **Mục tiêu:** khách gửi một ảnh, web cho biết đó là robot nào, thuộc dòng nào, kèm thông tin về robot. Nếu cửa hàng có bán mô hình của robot đó thì gợi ý sản phẩm bên dưới.
- **Cách làm:**
  - Tự xây bộ dữ liệu ảnh có nhãn, độc lập với dữ liệu của web: khoảng 150–250 robot của Transformers, Gundam, Super Sentai/Power Rangers.
  - Huấn luyện mô hình phân loại bằng tinh chỉnh (fine-tuning) mạng đã huấn luyện sẵn.
  - Đánh giá đầy đủ: độ chính xác, phương sai giữa các lần chạy, khoảng tin cậy, hiệu chỉnh độ tin, khả năng từ chối ảnh lạ.
  - Xuất ONNX để chạy trong trình duyệt của khách.
- **Mỗi bước có một báo cáo riêng** theo cùng một mẫu (mục 6). Báo cáo ghi công cụ, thuật toán, tham số, kết quả và nhận xét, đủ để chép vào luận văn.

## 1. Bối cảnh và lý do đổi hướng

**Cách hiện tại** ([docs/chuan/08-tich-hop-ai.md](../chuan/08-tich-hop-ai.md)) không huấn luyện gì:
- Dùng CLIP ViT-B/32 đóng băng, so ảnh của khách với 12 ảnh dựng từ mô hình 3D của mỗi sản phẩm.
- Chỉ nhận biết được 76 sản phẩm đang bán.

**Số liệu thật trên CSDL Supabase** (bảng `image_search_logs`, 14 lượt tìm):

| Chỉ số | Giá trị |
| --- | --- |
| Lượt được chấp nhận | 1/14 |
| Lượt bị từ chối vì "lưỡng lự" (s₁ − s₂ < δ = 0,02) | 13/14 |
| Khoảng cách hạng 1 và hạng 2 (s₁ − s₂) của 13 lượt bị từ chối | 0,0001 – 0,0162 |
| Điểm hạng 1 (s₁) | 0,645 – 0,895, đều vượt τ = 0,6 |
| Ngưỡng τ, δ | Mặc định, chưa từng hiệu chỉnh |

**Nguyên nhân:**
1. Ảnh dựng từ mô hình 3D khác xa ảnh chụp thật (khoảng cách miền).
2. CLIP đóng băng không được dạy để phân biệt các robot gần giống nhau, nên điểm của nhiều sản phẩm gần như bằng nhau.
3. Ngưỡng chưa được hiệu chỉnh trên dữ liệu thật.

**Quyết định của chủ dự án (07/11/2026):**
- Xây lại từ đầu bằng mô hình học có giám sát, huấn luyện trên bộ dữ liệu lớn và độc lập.
- Nhận dạng robot nói chung, không chỉ hàng cửa hàng bán.
- Ảnh lấy từ mọi nguồn công khai, chỉ dùng cho nghiên cứu.
- Mô hình chạy trong trình duyệt.

**Đã kiểm tra:** không có bộ dữ liệu công khai nào gắn nhãn robot theo từng nhân vật. Chỉ có vài bộ nhỏ:
- Gundam/Zaku trên Roboflow: 198 ảnh, hai lớp.
- `Gazoche/gundam-captioned` trên Hugging Face: có chú thích, không có nhãn từng mẫu.

Vì vậy bộ dữ liệu phải tự xây (bước 1–4). Đây cũng là một đóng góp của luận văn.

## 2. Câu hỏi nghiên cứu

| Mã | Câu hỏi | Trả lời ở |
| --- | --- | --- |
| RQ1 | Bộ dữ liệu thu từ nguồn công khai, làm sạch bán tự động, đạt chất lượng nhãn bao nhiêu (độ chính xác nhãn, khoảng tin cậy 95%)? | Bước 3 |
| RQ2 | Tinh chỉnh mạng đã huấn luyện sẵn tốt hơn bao nhiêu so với dùng đặc trưng đóng băng (zero-shot, linear probe, k-NN)? Chênh lệch có ý nghĩa thống kê không? | Bước 5, 6 |
| RQ3 | Kiến trúc nào (CNN hay Transformer, nhỏ hay lớn) cân bằng tốt nhất giữa độ chính xác, kích thước và tốc độ khi chạy trong trình duyệt? | Bước 6, 9 |
| RQ4 | Kỹ thuật nào (tăng cường dữ liệu, cân bằng lớp, làm trơn nhãn, Mixup/CutMix, lượng dữ liệu) đóng góp bao nhiêu vào kết quả? | Bước 7 |
| RQ5 | Mô hình từ chối được ảnh robot lạ và ảnh không phải robot đến mức nào, và độ tin nó báo có đúng thực tế không (hiệu chỉnh)? | Bước 8 |
| RQ6 | Trên ảnh ngoài thực tế (tự chụp, chưa từng thấy), độ chính xác giảm bao nhiêu so với tập test? | Bước 13 |

## 3. Phạm vi bài toán

**Lớp.** Mỗi lớp là **một robot ở một dòng**, ví dụ "Optimus Prime – G1", "Optimus Prime – phim live-action", "RX-78-2 Gundam – UC 0079". Lý do: cùng một nhân vật ở các dòng khác nhau trông khác hẳn. Mỗi lớp có ba cấp, dùng để trả lời ở mức chắc chắn nhất:

| Cấp | Ví dụ | Dùng để |
| --- | --- | --- |
| Franchise | Transformers | "Đây có vẻ là một robot Transformers" khi chưa rõ nhân vật |
| Nhân vật | Optimus Prime | Trả lời khi chưa chắc dòng |
| Nhân vật + dòng (lớp huấn luyện) | Optimus Prime – G1 | Câu trả lời đầy đủ nhất |

**Hạn mức dự kiến:** Transformers khoảng 100 lớp, Gundam khoảng 70, Super Sentai/Power Rangers khoảng 50. Tổng 150–250 lớp, chốt ở bước 1.

**Ghép Super Sentai và Power Rangers:** cùng một robot (ví dụ Daizyujin của Super Sentai là Megazord của Power Rangers) gộp thành một lớp, các tên khác ghi vào `aliases`.

**Dạng robot và dạng biến hình:**
- Phạm vi chính là **dạng robot**.
- Ảnh dạng xe hoặc thú (dạng biến hình của Transformers) được đánh dấu `mode = alt` và đánh giá riêng như một thí nghiệm phụ. Dạng xe rất dễ nhầm với xe thường.

**Ngoài phạm vi:** nhận dạng nhiều robot trong một ảnh, phát hiện vị trí (bounding box), phân biệt từng phiên bản đồ chơi của cùng một nhân vật (ví dụ Masterpiece hay Studio Series).

## 4. Kiến trúc tổng thể

```
ml/ (Python, chạy trên Google Colab, dữ liệu trên Google Drive)
 B1 Danh mục ─► robots.json ──────────────────────────────────────────┐
 B2 Thu thập ─► B3 Làm sạch + kiểm định nhãn ─► B4 Chia tập             │
 B5 Mô hình nền ─► B6 Huấn luyện ─► B7 Thí nghiệm phụ ─► B8 Đánh giá    │
 B9 Xuất ONNX + nén ─► model.onnx, labels.json, model-card.json ──────┤
                                                                       ▼
Web (Next.js 16, Supabase)
 B10 Bảng robots, robot_products, recognition_models, recognition_logs
 B11 Trình duyệt khách: worker ONNX → xác suất top-k → POST /api/nhan-dien
     → robot, dòng, thông tin, "có thể là", sản phẩm cửa hàng đang bán
 B12 Kiểm thử, triển khai Netlify   B13 Thử nghiệm thực địa   B14 Gỡ cách cũ
```

**Thư mục:**

| Đường dẫn | Nội dung | Có trong git |
| --- | --- | --- |
| `ml/robotrec/` | Gói Python dùng chung: cấu hình, đọc manifest, tiền xử lý, chỉ số, ghi báo cáo | Có |
| `ml/notebooks/B01_…B09_*.ipynb` | Một notebook mỗi bước, chạy được trên Colab | Có |
| `ml/configs/*.yaml` | Tham số của từng bước và từng thí nghiệm | Có |
| `ml/data/manifests/` | `robots.json`, `manifest.csv`, `rejected.csv`, `splits.csv` | Có |
| `ml/reports/Bxx/` | Số liệu (`summary.json`), biểu đồ (PNG) của từng bước | Có |
| `docs/nhan-dang-robot/bao-cao/Bxx-*.md` | Báo cáo của từng bước (mục 6) | Có |
| Google Drive `robotica-ml/` | Ảnh (khoảng 3–5 GB), checkpoint, file ONNX | **Không** |

## 5. Môi trường và công cụ

| Nhóm | Công cụ | Dùng ở | Vai trò |
| --- | --- | --- | --- |
| Hạ tầng | Google Colab (GPU NVIDIA T4 16 GB; Colab Pro nếu cần A100/L4), Google Drive | B2–B9 | Chạy huấn luyện, lưu ảnh và checkpoint |
| Ngôn ngữ | Python 3.11 | Mọi bước | |
| Học sâu | PyTorch 2.x, torchvision, `timm` | B5–B9 | Mạng, huấn luyện, tăng cường dữ liệu |
| Mô hình nền | `open_clip_torch` (CLIP), DINOv2 (`transformers` của Hugging Face) | B3, B5 | Trích đặc trưng, lọc ảnh, zero-shot |
| Học máy cổ điển | `scikit-learn` | B4, B5, B8 | Chia tập phân tầng theo nhóm, hồi quy logistic, k-NN, chỉ số |
| Thống kê | `scipy`, `statsmodels` | B3, B5–B8 | Khoảng tin cậy Wilson, bootstrap, kiểm định McNemar, χ² |
| Thu thập | `requests`, `mwclient` + `mwparserfromhell` (MediaWiki), `ddgs` (DuckDuckGo), `icrawler` (Bing), `flickrapi` | B1, B2 | Danh mục, ảnh |
| Xử lý ảnh | Pillow, `imagehash` (pHash) | B2, B3 | Đọc, thu nhỏ, băm cảm nhận |
| Giải thích | `pytorch-grad-cam`, `umap-learn` | B8 | Grad-CAM, bản đồ đặc trưng |
| Đo hiệu năng | `fvcore` (FLOPs), `onnx`, `onnxruntime` (+ `onnxruntime.quantization`) | B6, B9 | Số phép tính, xuất và nén mô hình |
| Ghi số liệu | CSV + `matplotlib`/`seaborn`; TensorBoard | Mọi bước | Biểu đồ, đường học |
| Web | Next.js 16, ONNX Runtime Web 1.30 (WASM; WebGPU nếu trình duyệt hỗ trợ), Supabase (PostgreSQL + Storage), Vitest | B10–B12 | Tích hợp |

Phiên bản chính xác của từng thư viện được ghim trong `ml/requirements.txt` và in ra ở đầu mỗi báo cáo (`pip freeze`).

## 6. Mẫu báo cáo của mỗi bước

Mỗi bước kết thúc bằng một file `docs/nhan-dang-robot/bao-cao/Bxx-<tên>.md` gồm:

1. **Mục tiêu:** bước này trả lời câu hỏi gì, đóng góp vào RQ nào.
2. **Đầu vào, đầu ra:** file nào, bao nhiêu mẫu, mã phiên bản dữ liệu.
3. **Công cụ và môi trường:** thư viện kèm phiên bản, phần cứng (GPU, RAM), thời gian chạy.
4. **Phương pháp:** thuật toán, công thức, tham số, lý do chọn tham số, các cách đã thử và bị loại.
5. **Kết quả:** bảng và biểu đồ. Mọi chỉ số chính ghi dạng **trung bình ± độ lệch chuẩn** qua các lần chạy và **khoảng tin cậy 95%** (mục 7).
6. **Phân tích:** kết quả nói lên điều gì, có ý nghĩa thống kê không, so với kỳ vọng.
7. **Hạn chế và rủi ro:** những gì kết quả chưa chứng minh được.
8. **Tái lập:** lệnh hoặc notebook, file cấu hình, hạt giống, commit git, mã phiên bản dữ liệu.

Mỗi báo cáo kèm `ml/reports/Bxx/summary.json` để trang quản trị và bảng tổng hợp đọc lại được. Sau mỗi bước, mình tóm tắt báo cáo cho chủ dự án và chờ duyệt rồi mới làm bước sau.

## 7. Quy ước thống kê và định nghĩa chỉ số

### 7.1. Đo độ dao động

| Nguồn dao động | Cách đo | Ghi trong báo cáo |
| --- | --- | --- |
| Ngẫu nhiên khi huấn luyện (khởi tạo đầu phân loại, thứ tự dữ liệu, tăng cường) | Chạy lại 3 hạt giống (42, 43, 44) | Trung bình ± độ lệch chuẩn (std), phương sai |
| Ngẫu nhiên do tập test hữu hạn | Bootstrap 1.000 lần trên tập test (lấy mẫu có hoàn lại) | Khoảng tin cậy 95% theo phân vị 2,5% và 97,5% |
| Chọn siêu tham số (linear probe) | 5-fold cross-validation phân tầng | Trung bình ± std qua 5 fold |
| Tỉ lệ trên mẫu nhỏ (độ chính xác nhãn, thử nghiệm thực địa) | Khoảng tin cậy Wilson 95% | p̂ [cận dưới; cận trên] |
| So sánh hai mô hình trên cùng tập test | Kiểm định McNemar (cặp dự đoán đúng/sai), hoặc bootstrap có ghép cặp cho hiệu độ chính xác | Giá trị p, hiệu kèm khoảng tin cậy 95% |
| So sánh phân bố giữa các tập (ví dụ miền ảnh) | Kiểm định χ² độc lập | χ², bậc tự do, p |

Mức ý nghĩa α = 0,05. Khi so sánh nhiều cặp cùng lúc thì hiệu chỉnh Holm–Bonferroni.

### 7.2. Định nghĩa chỉ số

| Chỉ số | Định nghĩa |
| --- | --- |
| Top-k accuracy | Tỉ lệ ảnh có nhãn đúng nằm trong k lớp có xác suất cao nhất (k = 1, 5) |
| Precision, Recall, F1 của lớp c | P = TP/(TP+FP), R = TP/(TP+FN), F1 = 2PR/(P+R) |
| Macro-F1 | Trung bình F1 của mọi lớp, mỗi lớp nặng như nhau (không bị lớp đông ảnh lấn át) |
| Balanced accuracy | Trung bình recall của mọi lớp |
| Độ chính xác theo cấp | Cộng xác suất các lớp cùng nhân vật (hoặc cùng franchise), rồi tính top-1 ở cấp đó |
| Mức nghiêm trọng của lỗi | Tỉ lệ lỗi theo loại: đúng nhân vật sai dòng / sai nhân vật cùng franchise / sai franchise |
| NLL | −(1/N) Σ log p(yᵢ ∣ xᵢ) |
| Brier | (1/N) Σ ‖p(xᵢ) − onehot(yᵢ)‖² |
| ECE (15 khoảng) | Σ_b (\|B_b\|/N) · \|acc(B_b) − conf(B_b)\|, với B_b là nhóm ảnh có độ tin nằm trong khoảng b |
| MCE | max_b \|acc(B_b) − conf(B_b)\| |
| Temperature scaling | p = softmax(z / T); chọn T > 0 làm nhỏ nhất NLL trên tập val |
| Điểm "lạ" | MSP = max_c p_c; max-logit = max_c z_c; energy E = −T · log Σ_c exp(z_c / T) |
| AUROC, AUPR | Diện tích dưới đường ROC và đường precision–recall khi tách ảnh đã biết với ảnh lạ theo điểm "lạ" |
| FPR@95%TPR | Tỉ lệ ảnh lạ bị nhận nhầm khi giữ được 95% ảnh đã biết |
| OSCR | Đường tỉ lệ phân loại đúng (trên ảnh đã biết) theo tỉ lệ chấp nhận nhầm (trên ảnh lạ) khi thay ngưỡng |
| Hiệu năng | Số tham số, GFLOPs (fvcore), kích thước file (MB), thời gian suy luận một ảnh: trung vị và p95 qua 100 lần |

## 8. Các bước

Thời gian ghi trong từng bước là ước lượng. Báo cáo ghi thời gian thật.

---

### Phần A: Học máy

### B0. Môi trường và khung báo cáo

- **Mục tiêu:** dựng `ml/`, notebook mẫu chạy trên Colab (gắn Drive, cài thư viện, kiểm tra GPU), gói `robotrec` (ghi `summary.json`, vẽ biểu đồ, sinh báo cáo Markdown theo mục 6), cố định hạt giống (`random`, `numpy`, `torch`, `cudnn.deterministic`).
- **Đầu ra:** `ml/README.md` (cách chạy từng bước trên Colab), `requirements.txt` đã ghim, notebook thử in phiên bản thư viện và GPU.
- **Báo cáo B00:** môi trường, cấu trúc thư mục, quy ước hạt giống và phiên bản dữ liệu.
- **Tiêu chí đạt:** notebook thử chạy được từ đầu đến cuối trên Colab của chủ dự án.

### B1. Danh mục robot và kho thông tin

- **Mục tiêu:** chốt danh sách lớp và thông tin của từng robot (RQ1, nền cho mọi bước sau).
- **Nguồn:** MediaWiki API của TFWiki.net (Transformers), Gundam Wiki và Power Rangers Wiki / Super Sentai Wiki (fandom).
- **Thuật toán:**
  1. Lấy thành viên của các category nhân vật hoặc mobile suit (`list=categorymembers`).
  2. Đọc wikitext từng trang, tách infobox bằng `mwparserfromhell`. Lấy tên, tên khác, dòng (continuity hoặc series), phe, dạng biến hình, ảnh đại diện, đoạn mô tả đầu trang.
  3. **Điểm phổ biến** = số trang trong wiki liên kết đến trang đó (`prop=linkshere`). Chọn top-N mỗi franchise theo hạn mức ở mục 3.
  4. **Bắt buộc có** các robot ứng với 76 sản phẩm cửa hàng đang bán: ghép tự động bằng so tên đã chuẩn hoá (bỏ dấu, viết thường, tỉ lệ giống theo trigram), rồi chủ dự án duyệt tay.
  5. Gộp robot Super Sentai và Power Rangers theo trường "Sentai counterpart" của infobox.
- **Đầu ra:** `robots.json` (`slug, name, aliases, franchise, series, faction, alt_mode, description, image, source_url, popularity`); bảng ghép sản phẩm cửa hàng với robot.
- **Số liệu báo cáo B01:** số lớp theo franchise, dòng, nhân vật (bảng + cây phân cấp); phân bố điểm phổ biến; số sản phẩm cửa hàng đã ghép (x/76) và các sản phẩm không ghép được; số trường thông tin bị thiếu.
- **Tiêu chí đạt:** 150–250 lớp; mọi sản phẩm cửa hàng có robot tương ứng hoặc có lý do không có; chủ dự án duyệt danh sách.
- **Thời gian:** khoảng 1–2 giờ chạy, cộng thời gian duyệt.

### B2. Thu thập ảnh

- **Mục tiêu:** đủ ảnh thô cho mỗi lớp, đa dạng miền: ảnh chụp đồ chơi hoặc mô hình, ảnh chụp màn hình phim hoặc anime, ảnh CGI, tranh vẽ.
- **Thuật toán:**
  - **Mở rộng truy vấn:** mỗi lớp × mỗi tên (`name` và `aliases`) × mẫu câu `{tên} {dòng}`, `{tên} figure`, `{tên} toy`, `{tên} model kit` (Gundam), `{tên} anime screenshot`, `{tên} {franchise} robot mode`.
  - **Nguồn:** thư viện ảnh trên trang wiki (`prop=imageinfo`), DuckDuckGo Images, Bing Images, Flickr API.
  - **Tải ảnh:** bỏ URL trùng; timeout 15 giây; thử lại tối đa 3 lần theo backoff mũ; mỗi nguồn 1–2 yêu cầu/giây. Thu về cạnh dài 512 px (Pillow, LANCZOS), lưu JPEG chất lượng 90. Tính sha1 của file gốc. Chạy tiếp được khi bị ngắt (đọc lại manifest).
- **Mục tiêu số lượng:** 400 ảnh thô mỗi lớp, tối đa 600.
- **Đầu ra:** ảnh trên Drive; `manifest.csv` (`image_id, class, url, source, query, license, sha1, width, height, downloaded_at`).
- **Số liệu báo cáo B02:** tổng số ảnh; số ảnh mỗi lớp (nhỏ nhất, trung vị, lớn nhất, biểu đồ); tỉ lệ đóng góp và tỉ lệ tải lỗi của từng nguồn; thời gian; các lớp dưới 200 ảnh thô (phải bổ sung truy vấn).
- **Tiêu chí đạt:** mọi lớp có ít nhất 200 ảnh thô.
- **Thời gian:** khoảng 8–20 giờ chạy nền, tuỳ giới hạn tốc độ của nguồn.

### B3. Làm sạch và kiểm định chất lượng nhãn

- **Mục tiêu:** loại ảnh hỏng, trùng, không liên quan, sai lớp; đo chất lượng nhãn của bộ dữ liệu cuối (RQ1).
- **Thuật toán, theo thứ tự (phễu lọc):**
  1. **Kỹ thuật:** không đọc được, cạnh ngắn dưới 128 px, tỉ lệ khung trên 3:1.
  2. **Trùng tuyệt đối:** cùng sha1.
  3. **Gần trùng:**
     - Ghép cạnh cho hai ảnh khi pHash 64 bit lệch không quá 6 bit (khoảng cách Hamming ≤ 6) hoặc cô-sin đặc trưng CLIP ≥ 0,95. Gom cụm bằng union–find.
     - Mỗi cụm giữ ảnh có độ phân giải cao nhất.
     - Cụm chứa ảnh của nhiều lớp thì loại cả cụm, vì nhãn mâu thuẫn.
  4. **Không liên quan:**
     - CLIP ViT-L/14 zero-shot với hai nhóm câu mô tả. Nhóm dương: "a photo of a robot", "a toy robot", "an anime robot", "a giant robot from a TV show". Nhóm âm: "a photo of a person", "a text document", "a screenshot of a website", "a logo", "a landscape".
     - Giữ ảnh khi tổng xác suất nhóm dương ≥ ngưỡng t_rel. Chọn t_rel trên mẫu kiểm định ở bước 7.
  5. **Sai lớp (ngoại lai trong lớp):**
     - Tính tâm lớp bằng trung bình cắt bỏ 10% đặc trưng CLIP xa nhất, rồi tính khoảng cách cô-sin d của từng ảnh tới tâm.
     - Đánh dấu ngoại lai khi d > Q3 + 1,5 · IQR (quy tắc Tukey).
  6. **Gán miền ảnh:** CLIP zero-shot giữa năm miền: ảnh chụp đồ chơi/mô hình, ảnh chụp màn hình hoạt hình/anime, ảnh CGI/phim, tranh vẽ, hộp sản phẩm. Ghi vào trường `domain`.
  7. **Duyệt tay:**
     - Sinh trang lưới ảnh HTML cho từng lớp, ảnh ngoại lai xếp trước. Chủ dự án đánh dấu ảnh sai.
     - Danh sách ảnh bị loại ghi vào `rejected.csv` (có trong git), nên chạy lại cho cùng kết quả.
- **Kiểm định:**
  - **Chất lượng nhãn cuối:** lấy ngẫu nhiên phân tầng 1.000 ảnh sau làm sạch; chủ dự án đánh dấu đúng/sai. Báo **độ chính xác nhãn** p̂ kèm khoảng tin cậy Wilson 95%.
  - **Bộ lọc tự động:** lấy 500 ảnh trước bước 4–5 có nhãn tay. Báo precision, recall của bộ lọc và chọn t_rel tại đó.
  - **Miền ảnh:** kiểm tra 200 ảnh có nhãn tay, báo độ chính xác của việc gán miền.
- **Đầu ra:** `manifest.csv` thêm cột `status, reject_reason, domain, cluster_id`; `rejected.csv`.
- **Số liệu báo cáo B03:**
  - Bảng phễu: số ảnh còn lại sau mỗi bước lọc, và tỉ lệ bị loại.
  - Số ảnh mỗi lớp sau làm sạch: nhỏ nhất, trung vị, lớn nhất; **tỉ lệ mất cân bằng** = lớn nhất / nhỏ nhất.
  - Phân bố miền ảnh, ảnh mẫu từng lớp.
  - Độ chính xác nhãn ± khoảng tin cậy; precision và recall của bộ lọc.
- **Tiêu chí đạt:** độ chính xác nhãn ≥ 95% (cận dưới khoảng tin cậy ≥ 93%); mọi lớp có ít nhất 100 ảnh, mục tiêu 150. Lớp không đạt thì quay lại B2 hoặc bỏ lớp, có ghi lý do.
- **Thời gian:** máy khoảng 2–4 giờ (GPU); người duyệt khoảng 4–8 giờ.

### B4. Chia tập, tập lạ và tập âm

- **Mục tiêu:** tạo các tập huấn luyện, chọn mô hình, kiểm tra không rò rỉ, cùng các tập ảnh lạ để đo khả năng từ chối (RQ5).
- **Thuật toán:**
  1. **Lớp "không biết" (near-OOD):** chọn ngẫu nhiên 15% số lớp, phân tầng theo franchise, không chọn robot cửa hàng đang bán. Chia đôi thành **lạ-val** và **lạ-test**. Ảnh của các lớp này không bao giờ dùng để huấn luyện.
  2. **Lớp đã biết:** chia train/val/test theo tỉ lệ 70/15/15 bằng `StratifiedGroupKFold`.
     - **Nhóm** = cụm gần trùng mở rộng (pHash lệch ≤ 10 bit) cộng cùng trang nguồn, để ảnh gần giống nhau không nằm ở hai tập.
  3. **Tập âm (far-OOD):** 1.000 ảnh của COCO val2017 cộng 500 ảnh "đồ chơi hoặc xe không phải robot" (thu như B2, rồi duyệt tay), chia đôi val/test.
  4. **Kiểm tra rò rỉ:** với mỗi ảnh test, tính cô-sin CLIP lớn nhất với mọi ảnh train. Báo phân bố; số cặp ≥ 0,95 phải bằng 0.
  5. **Đóng băng dữ liệu:** `dataset_version` = sha256 của `splits.csv`. Mọi bước sau ghi mã này.
- **Số liệu báo cáo B04:**
  - Bảng kích thước các tập (đã biết: train/val/test; lạ-val, lạ-test; âm-val, âm-test) và số lớp.
  - Phân bố số ảnh mỗi lớp trong từng tập.
  - Phân bố miền ảnh giữa các tập, kiểm định χ² cho thấy phân bố tương đương.
  - Biểu đồ rò rỉ.
- **Tiêu chí đạt:** không có cặp rò rỉ; χ² không có khác biệt ý nghĩa (p ≥ 0,05) hoặc có giải thích.

### B5. Mô hình nền (thí nghiệm E1)

- **Mục tiêu:** mốc so sánh; cho biết đặc trưng đóng băng đạt đến đâu (RQ2).
- **Bộ trích đặc trưng:** CLIP ViT-B/32, ViT-B/16, ViT-L/14 (OpenAI, qua `open_clip`); DINOv2 ViT-S/14 và ViT-B/14. Mọi đặc trưng đều chuẩn hoá L2.
- **Thuật toán:**
  - (a) **Zero-shot CLIP:** 5 mẫu câu mỗi lớp, ví dụ "a photo of {name}, a robot from {series}", "a toy figure of {name}". Lấy trung bình vector văn bản rồi phân lớp theo cô-sin lớn nhất.
  - (b) **Linear probe:** hồi quy logistic đa lớp (`lbfgs`, tối đa 2.000 vòng). Chọn C ∈ {10⁻³, …, 10²} bằng 5-fold CV phân tầng trên train, sau đó huấn luyện lại trên toàn bộ train.
  - (c) **k-NN cô-sin:** k ∈ {1, 5, 10}, bỏ phiếu có trọng số theo độ giống.
- **Số liệu báo cáo B05:**
  - Bảng: top-1, top-5, macro-F1 trên val và test, kèm khoảng tin cậy bootstrap 95%; điểm CV (trung bình ± std); số chiều đặc trưng; thời gian trích đặc trưng.
  - Biểu đồ t-SNE của bộ đặc trưng tốt nhất, tô màu theo franchise.
- **Thời gian:** khoảng 2–3 giờ GPU.

### B6. Huấn luyện chính (thí nghiệm E2)

- **Mục tiêu:** mô hình chính; so sánh kiến trúc (RQ2, RQ3).

**Kiến trúc** (trọng số huấn luyện sẵn của `timm`):

| Kiến trúc | Loại | Tham số (xấp xỉ) | Lý do |
| --- | --- | --- | --- |
| ConvNeXt-Tiny | CNN hiện đại | 28 triệu | Cân bằng tốt giữa độ chính xác và tốc độ, file int8 khoảng 30 MB |
| EfficientNetV2-S | CNN tối ưu kích thước | 21 triệu | Nhẹ nhất, hợp với điện thoại |
| ViT-B/16 khởi tạo từ CLIP | Transformer | 86 triệu | Đặc trưng bền với ảnh khác miền; nặng nhất (khoảng 90 MB int8) |

Số GFLOPs và độ sâu (số tầng) của từng mạng được đo lại bằng `fvcore` và ghi vào báo cáo.

**Công thức huấn luyện** (giống nhau cho mọi kiến trúc, trừ tốc độ học):
- **Ảnh vào:**
  - Huấn luyện: RandomResizedCrop 224 (tỉ lệ diện tích 0,35–1), lật ngang, RandAugment (n = 2, m = 9), ColorJitter 0,3, RandomErasing (p = 0,25).
  - Val/test: thu cạnh ngắn về 256, cắt giữa 224. Chuẩn hoá theo mean/std của trọng số gốc.
- **Hàm mất mát:** cross-entropy có làm trơn nhãn ε = 0,1. Với nhãn đúng y: q_y = 1 − ε + ε/C, các lớp khác q_c = ε/C.
- **Lấy mẫu cân bằng lớp:** lớp c được lấy với xác suất tỉ lệ n_c^0,5 (lấy mẫu căn bậc hai), giảm lệch do lớp đông ảnh.
- **Hai pha:**
  - Pha 1: 2 epoch chỉ huấn luyện đầu phân loại (thân mạng đóng băng), tốc độ học 1e-3.
  - Pha 2: tinh chỉnh toàn mạng. Tốc độ học 1e-4 (CNN) hoặc 3e-5 với suy giảm theo tầng 0,75 (ViT). AdamW (β₁ = 0,9, β₂ = 0,999, weight decay 0,05). Lịch học cosine có khởi động tuyến tính 1 epoch.
- **Khác:**
  - Batch 64, mixed precision fp16, cắt gradient theo chuẩn 1,0.
  - Tối đa 30 epoch. Dừng sớm khi macro-F1 trên val không tăng trong 5 epoch.
  - Mỗi epoch lưu checkpoint lên Drive (Colab ngắt thì chạy tiếp được).
- **Hạt giống:** 3 lần chạy mỗi kiến trúc (42, 43, 44).

**Ghi theo từng epoch:** loss và top-1 trên train; loss, top-1, top-5, macro-F1 trên val; tốc độ học; thời gian; bộ nhớ GPU.

**Số liệu báo cáo B06:**
- Đường học: trung bình ± std qua 3 hạt giống, vẽ thành dải. Khoảng cách giữa train và val là dấu hiệu quá khớp.
- Epoch tốt nhất, tổng số giờ GPU.
- Bảng so sánh kiến trúc: top-1, top-5, macro-F1 trên val (trung bình ± std); tham số, GFLOPs, độ sâu.
- Kiểm định McNemar giữa hai kiến trúc tốt nhất trên val.
- Lý do chọn mô hình chính, cân nhắc độ chính xác, kích thước và tốc độ (RQ3).

Tập test chỉ dùng ở B8, để không chọn mô hình theo test.

- **Thời gian:** khoảng 1–2 giờ mỗi lần chạy trên T4. Tổng khoảng 10–15 giờ GPU cho 9 lần chạy.

### B7. Thí nghiệm phụ (ablation và đường học theo lượng dữ liệu; E3, E4)

- **Mục tiêu:** đo đóng góp của từng kỹ thuật (RQ4), phân tích độ lệch và phương sai (bias–variance).
- **Thực hiện:** trên kiến trúc đã chọn, thay một yếu tố mỗi lần so với cấu hình chính.

| Mã | Thay đổi | Đo gì |
| --- | --- | --- |
| A1 | Tăng cường cơ bản (chỉ cắt + lật) thay cho tăng cường mạnh | Vai trò của tăng cường |
| A2 | Lấy mẫu thường thay cho lấy mẫu cân bằng | Ảnh hưởng của mất cân bằng lớp |
| A3 | ε = 0 (bỏ làm trơn nhãn) | Ảnh hưởng tới độ chính xác và hiệu chỉnh |
| A4 | Thêm Mixup (α = 0,2) và CutMix (α = 1,0) | Điều chuẩn mạnh hơn |
| A5 | Khởi tạo ImageNet thay cho CLIP (chỉ với ViT) | Vai trò của trọng số huấn luyện sẵn |
| A6 | 10%, 25%, 50%, 100% ảnh mỗi lớp | **Đường học theo lượng dữ liệu** |
| A7 | Suy luận thêm bản lật ngang rồi lấy trung bình (TTA) | Lợi ích và cái giá về thời gian |

- **Số liệu báo cáo B07:**
  - Δ top-1 và Δ macro-F1 so với cấu hình chính, kèm khoảng tin cậy 95% bằng bootstrap có ghép cặp; giá trị p của McNemar.
  - Đường học theo lượng dữ liệu: lỗi trên train và val theo lượng dữ liệu, 3 hạt giống cho A6. Đọc ra mô hình đang thiếu dữ liệu (phương sai cao) hay thiếu sức chứa (độ lệch cao).
  - Phương sai giữa các hạt giống của từng cấu hình.
- **Thời gian:** khoảng 10–15 giờ GPU. Thiếu GPU thì A1–A5 và A7 chạy 1 hạt giống, A6 giữ 3 hạt giống.

### B8. Đánh giá toàn diện (E5–E7)

- **Mục tiêu:** số liệu cuối trên tập test (RQ2, RQ5). Chỉ chạy một lần, với mô hình đã chốt ở B6 cộng các cải tiến B7 có ý nghĩa thống kê.
- **Tập đóng (ảnh của lớp đã biết):**
  - Top-1, top-5, balanced accuracy, macro và weighted precision/recall/F1; trung bình ± std qua 3 hạt giống; khoảng tin cậy bootstrap 95%.
  - Bảng từng lớp, xếp từ kém nhất. Ma trận nhầm lẫn chuẩn hoá theo hàng, cộng 20 cặp hay nhầm nhất.
  - Độ chính xác theo cấp (dòng, nhân vật, franchise) và mức nghiêm trọng của lỗi (mục 7.2).
  - Theo miền ảnh: độ chính xác từng miền kèm khoảng tin cậy. Trả lời câu hỏi: ảnh chụp đồ chơi có khó hơn ảnh chụp màn hình không?
  - Dạng biến hình (`mode = alt`): đánh giá riêng.
- **Hiệu chỉnh độ tin:**
  - Tìm T trên val (LBFGS, làm nhỏ nhất NLL).
  - Báo ECE, MCE, NLL, Brier trước và sau khi hiệu chỉnh; biểu đồ độ tin cậy (reliability diagram).
- **Tập mở:**
  - Điểm "lạ": MSP, max-logit, energy. So sánh thêm với **outlier exposure**: huấn luyện lại 1 lần có thêm ảnh âm của tập train làm lớp "không phải robot" (E7).
  - Với lạ-test (robot lạ) và âm-test (không phải robot): AUROC, AUPR, FPR@95%TPR, đường OSCR.
- **Luật trả lời theo cấp:**
  1. p(lớp) ≥ t₁ → trả lời đầy đủ (nhân vật + dòng).
  2. Ngược lại, p(nhân vật) ≥ t₂ → trả lời nhân vật, chưa rõ dòng.
  3. Ngược lại, p(franchise) ≥ t₃ → "Có vẻ là robot Transformers (hoặc Gundam, Sentai), chưa nhận ra nhân vật".
  4. Còn lại → "Không nhận ra".
  - Chọn t₁, t₂, t₃ trên **tập val** (đã biết, lạ-val, âm-val): tỉ lệ chấp nhận nhầm ảnh lạ ≤ 5%, trả lời đúng nhiều nhất.
  - Báo trên **tập test**: tỉ lệ trả lời đúng, trả lời sai, từ chối oan, từ chối đúng ảnh lạ.
- **Giải thích mô hình:**
  - Grad-CAM (CNN) hoặc attention rollout (ViT) cho 20 ảnh đúng và 20 ảnh sai.
  - UMAP của đặc trưng tầng áp chót, tô màu theo franchise.
- **Phân tích lỗi:** chủ dự án gán loại cho 100 ảnh đoán sai: nhãn sai, hai nhân vật giống nhau, ảnh nhỏ hoặc bị che, đúng nhân vật sai dòng, miền ảnh lạ. Báo tỉ lệ từng loại.
- **Báo cáo B08:** toàn bộ số liệu trên, cộng bảng tổng hợp so sánh với B5 (RQ2: kiểm định McNemar giữa mô hình tinh chỉnh và linear probe tốt nhất).
- **Mục tiêu tham khảo (không phải cam kết):** top-1 ≥ 85%, cấp nhân vật ≥ 90%, AUROC robot lạ ≥ 0,85, ECE sau hiệu chỉnh ≤ 0,05.

### B9. Xuất và nén mô hình (E8)

- **Thuật toán:**
  1. `torch.onnx.export` (opset 17, batch động), kiểm tra bằng `onnx.checker`.
  2. Kiểm tra khớp với PyTorch trên toàn bộ test: chênh lệch logits lớn nhất và tỉ lệ top-1 trùng.
  3. Nén:
     - fp16.
     - int8 động (`quantize_dynamic`, nén các phép MatMul/Gemm).
     - int8 tĩnh dạng QDQ: hiệu chỉnh bằng 500 ảnh train theo phương pháp MinMax và Entropy (với các mạng nhiều tích chập).
  4. Supabase Storage gói miễn phí giới hạn 50 MB mỗi file, nên file lớn hơn được cắt thành nhiều phần. Worker hiện tại đã hỗ trợ ghép nhiều phần.
- **Đầu ra:**
  - `model.onnx` (hoặc các phần).
  - `labels.json`: chỉ số lớp → slug robot.
  - `model-card.json`: mã mô hình, kiến trúc, `dataset_version`, kích thước ảnh, mean/std, T, ngưỡng t₁–t₃, số liệu chính của B3–B8.
  - Tải lên Supabase Storage `media/ml/<mã-mô-hình>/`.
- **Số liệu báo cáo B09:** bảng fp32, fp16, int8 động, int8 tĩnh: kích thước (MB), top-1, macro-F1, ECE, thời gian suy luận trên CPU bằng ONNX Runtime (trung vị và p95 qua 100 lần, batch 1); tỉ lệ top-1 trùng với PyTorch.
- **Tiêu chí đạt:** bản chọn đưa lên web giữ ≥ 99% top-1 trùng với PyTorch và giảm top-1 không quá 1 điểm phần trăm.

---

### Phần B: Tích hợp vào web

Trước khi viết code Next.js, đọc `node_modules/next/dist/docs/` (theo `AGENTS.md`).

### B10. Cơ sở dữ liệu và nhập dữ liệu

**Migration mới** trong `src/server/db/migrations.ts`:

| Bảng | Cột chính |
| --- | --- |
| `robots` | `id, slug (duy nhất), name, aliases (JSON), franchise, series, faction, alt_mode, description, image, source_url, created_at` |
| `robot_products` | `robot_id, product_id` (khoá chính kép; một robot có thể có nhiều sản phẩm) |
| `recognition_models` | `id (mã mô hình), label, arch, files (JSON các URL), mb, input (JSON kích thước, mean, std), temperature, thresholds (JSON t₁–t₃), labels (JSON), metrics (JSON số liệu từng bước), dataset_version, is_active, created_by, created_at` |
| `recognition_logs` | `id, model, top_robot_id, top_prob, level (lớp/nhân vật/franchise/không), accepted, client_ms, created_at`. **Không lưu ảnh** |

**Nhập dữ liệu:**
- Trang quản trị nhận `robots.json` và `model-card.json`.
- Máy chủ kiểm tra:
  - Đúng cấu trúc, đủ trường; slug hợp lệ và duy nhất.
  - Số nhãn bằng số lớp; mọi nhãn trỏ tới robot có thật.
  - URL file nằm dưới `MEDIA_BASE_URL`.
- Server Action gọi `authorize("catalog.edit")` và ghi `audit_logs`. Bật mô hình mới thì mô hình cũ tự tắt.

**Ghép sản phẩm:** gợi ý tự động theo bảng ghép của B1, quản trị xác nhận ở trang `/admin/nhan-dien/robot`.

**Báo cáo B10:** sơ đồ bảng, luật kiểm tra, số robot đã nhập, số sản phẩm đã ghép (x/76).

### B11. Suy luận trong trình duyệt, API, giao diện

**Trình duyệt khách:**
- Tổng quát hoá `public/image-search/worker.js` và `src/components/image-search/embedder.ts`: nạp mô hình theo `model-card`, chạy ONNX (WebGPU nếu có, không thì WASM), trả logits, tính softmax(z/T).
- Dùng lại `pixels.ts` (đọc ảnh), `RegionPicker.tsx` (khoanh vùng), phần tải mô hình có tiến độ (MB) và lưu cache.
- **Tiền xử lý phải giống hệt khi huấn luyện:** thu cạnh ngắn về 256 bằng song tuyến, cắt giữa 224, cùng mean/std.
- **Kiểm tra khớp Python–trình duyệt:** 20 ảnh mẫu (file cố định trong test) chạy qua cả hai phía; báo chênh lệch logits lớn nhất và tỉ lệ top-1 trùng (phải 100%).
- Chỉ gửi lên máy chủ top-10 `[chỉ số lớp, xác suất]` và mã mô hình. Không gửi ảnh.

**API `POST /api/nhan-dien`:**
- Vào: `{ model, top: [[index, prob], …], clientMs }`.
- Ra: `{ level, robot, alternatives[4], products[], probs, thresholds }`.
- Kiểm tra mã mô hình đang bật, số phần tử, xác suất trong [0; 1]. Giới hạn 30 lượt/phút/IP như `src/app/api/tim-bang-anh/route.ts`.
- Cộng xác suất theo cấp và áp luật ở B8 (cùng một hàm thuần trong `src/lib/`, có test).
- `products[]`: sản phẩm đang bán gắn với robot (đọc `product_list`).
- Ghi `recognition_logs`.

**Trang khách `/tim-bang-anh`:**
- Kết quả: "Đây là **Optimus Prime** · Transformers G1 · Autobot", kèm độ tin (%).
- Thẻ thông tin: dòng, phe, dạng biến hình, mô tả, liên kết nguồn wiki.
- "Có thể là" 4 robot khác, kèm xác suất.
- "Cửa hàng có bán": thẻ sản phẩm, dùng lại `ProductCard`.
- Trả lời ở cấp nhân vật hoặc franchise thì ghi rõ mức đó. "Không nhận ra" thì kèm gợi ý chụp lại.
- Mục "Hệ thống quyết định thế nào?": ảnh đưa vào mô hình, top-5 xác suất, ngưỡng, thời gian.

**Trang quản trị `/admin/nhan-dien`** (thay "Tìm bằng ảnh (AI)"):
- Danh sách mô hình; bật/tắt.
- **Số liệu từng bước** đọc từ `metrics`: dữ liệu B2–B4, đường học B6, test B8, ma trận nhầm, xuất B9.
- Danh sách robot, ghép sản phẩm; thống kê lượt nhận dạng 30 ngày.

**Báo cáo B11:** hợp đồng API, ảnh chụp giao diện, kết quả kiểm tra khớp, thời gian tải mô hình (MB, giây, lần đầu và khi đã cache), thời gian suy luận trung vị và p95 trên máy tính và điện thoại.

### B12. Kiểm thử và triển khai

**Test Vitest mới:**
- Cộng xác suất theo cấp và luật t₁–t₃.
- Kiểm tra đầu vào API; giới hạn lượt; nhật ký không có ảnh.
- Nhập `robots.json` và `model-card.json` (dữ liệu sai bị từ chối); quyền.
- Ghép sản phẩm; chỉ trả sản phẩm đang bán.

**Chạy:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`. Triển khai Netlify, mở `/tim-bang-anh` và `/admin/nhan-dien` trên bản thật.

**Báo cáo B12:** số test, kết quả, thời gian build, các lỗi gặp và cách sửa.

### B13. Thử nghiệm thực địa (E9)

- **Mục tiêu:** con số trung thực nhất cho luận văn (RQ6).
- **Bộ ảnh:** ít nhất 150 ảnh **không lấy từ nguồn thu thập ở B2**, gán nhãn tay:
  - Khoảng 60 ảnh tự chụp mô hình thật (hàng cửa hàng hoặc của người quen).
  - Khoảng 40 ảnh chụp màn hình phim hoặc anime.
  - Khoảng 25 ảnh robot không có trong danh mục.
  - Khoảng 25 ảnh không phải robot.
- **Cách chạy:** chạy qua web thật, đọc `recognition_logs`. Chạy đối chứng bằng notebook với cùng file ONNX.
- **Số liệu báo cáo B13:** tỉ lệ trả lời đúng, sai, từ chối oan, từ chối đúng (khoảng tin cậy Wilson 95%) theo từng nhóm ảnh; so với tập test (độ giảm do khác miền); ma trận nhầm; nhận xét.

### B14. Gỡ cách cũ và hoàn thiện tài liệu

**Gỡ cách cũ:**
- Chạy `npm run backup` trước.
- Xoá các file: `indexer.ts`, `view-renderer.ts`, `ImageSearchWorkbench.tsx`, phần hiệu chỉnh trong `src/lib/image-search*.ts`, `src/app/actions/image-search.ts`, `src/server/repo/image-search.ts`.
- Migration xoá bảng `image_search_index`, `image_search_logs` và khoá `image_search` trong `site_settings`.
- Nút máy ảnh ở đầu trang (`SearchForm`, `Header`) hiện khi có mô hình nhận dạng đang bật.

**Tài liệu:**
- Viết lại `docs/chuan/08-tich-hop-ai.md`.
- Thêm quyết định vào `docs/chuan/00-quyet-dinh-nen-tang.md`.
- Cập nhật `CLAUDE.md`, `ml/README.md`.
- Gom các báo cáo B00–B13 thành bảng tổng hợp `docs/nhan-dang-robot/README.md`.

## 9. Bảng thí nghiệm tổng hợp

| Mã | Nội dung | Bước | Số lần chạy | GPU ước lượng |
| --- | --- | --- | --- | --- |
| E1 | Mô hình nền: zero-shot, linear probe, k-NN trên 5 bộ đặc trưng | B5 | 1 (CV 5 fold) | 2–3 giờ |
| E2 | Tinh chỉnh 3 kiến trúc | B6 | 3 × 3 | 10–15 giờ |
| E3 | Ablation A1–A5, A7 | B7 | 1–3 mỗi cái | 6–10 giờ |
| E4 | Đường học theo lượng dữ liệu A6 | B7 | 4 × 3 | 4–6 giờ |
| E5 | Đánh giá tập đóng, theo cấp, theo miền, hiệu chỉnh | B8 | 3 hạt giống | dưới 1 giờ |
| E6 | Tập mở: MSP, max-logit, energy | B8 | 3 hạt giống | dưới 1 giờ |
| E7 | Outlier exposure | B8 | 1 | 1–2 giờ |
| E8 | Nén fp16, int8 động, int8 tĩnh | B9 | 1 | dưới 1 giờ |
| E9 | Thử nghiệm thực địa | B13 | 1 | không cần |

Tổng khoảng 25–40 giờ GPU. Colab miễn phí giới hạn phiên khoảng 12 giờ và không phải lúc nào cũng có GPU. Vì vậy việc chạy chia thành nhiều phiên, checkpoint lưu trên Drive. Nếu thiếu GPU thì giảm E3 xuống 1 hạt giống trước, giữ E2 và E4 đủ 3 hạt giống.

## 10. Báo cáo dùng cho chương nào của luận văn

| Chương | Nội dung | Lấy từ |
| --- | --- | --- |
| 1. Tổng quan | Bối cảnh, hạn chế của cách cũ (số liệu mục 1), câu hỏi nghiên cứu | Mục 1–3 |
| 2. Cơ sở lý thuyết | CNN (ConvNeXt, EfficientNetV2), ViT, học chuyển giao, CLIP, DINOv2, tăng cường dữ liệu, làm trơn nhãn, hiệu chỉnh độ tin, nhận biết ảnh lạ | Phần "Phương pháp" của B5–B9, tài liệu tham khảo dưới đây |
| 3. Xây dựng bộ dữ liệu | Danh mục, thu thập, làm sạch, kiểm định nhãn, chia tập | B1–B4 |
| 4. Phương pháp và hệ thống | Mô hình, huấn luyện, xuất mô hình, kiến trúc web, API, giao diện | B6, B9–B11 |
| 5. Thực nghiệm và đánh giá | E1–E9 | B5–B8, B12, B13 |
| 6. Kết luận | Trả lời RQ1–RQ6, hạn chế, hướng tiếp | Tổng hợp |

**Tài liệu tham khảo chính** (bổ sung vào `docs/AI/06-nguon-tham-khao.md`):
- ConvNeXt (Liu et al., 2022); EfficientNetV2 (Tan & Le, 2021); ViT (Dosovitskiy et al., 2021).
- CLIP (Radford et al., 2021); DINOv2 (Oquab et al., 2023).
- RandAugment (Cubuk et al., 2020); Mixup (Zhang et al., 2018); CutMix (Yun et al., 2019); label smoothing (Szegedy et al., 2016).
- Temperature scaling (Guo et al., 2017); MSP (Hendrycks & Gimpel, 2017); energy-based OOD (Liu et al., 2020); Outlier Exposure (Hendrycks et al., 2019); OSCR (Dhamija et al., 2018).
- Grad-CAM (Selvaraju et al., 2017).

## 11. Rủi ro và cách xử lý

| Rủi ro | Ảnh hưởng | Cách xử lý |
| --- | --- | --- |
| Ảnh trên mạng gắn nhãn sai | Mô hình học sai, số liệu ảo | Phễu lọc B3, duyệt tay, đo độ chính xác nhãn kèm khoảng tin cậy; báo kết quả theo mức nhiễu đã đo |
| Nguồn chặn tải (giới hạn tốc độ) | Thiếu ảnh | Nhiều nguồn, giới hạn tốc độ, chạy tiếp được, kéo dài thời gian thu |
| Rò rỉ giữa train và test (ảnh gần giống nhau) | Độ chính xác bị thổi phồng | Chia theo nhóm cụm gần trùng, kiểm tra rò rỉ ở B4 |
| Ảnh thật của khách khác miền với dữ liệu | Độ chính xác thực tế thấp hơn test | Báo theo miền (B8), thử nghiệm thực địa (B13), tăng cường dữ liệu mạnh |
| Bản quyền ảnh | Pháp lý | Ảnh chỉ dùng huấn luyện cho nghiên cứu, giữ riêng trên Drive, không đưa lên web hay git; manifest ghi nguồn từng ảnh |
| Thiếu GPU trên Colab | Chậm tiến độ | Checkpoint mỗi epoch, ưu tiên thí nghiệm theo mục 9, có thể dùng Colab Pro |
| Mô hình quá nặng cho điện thoại | Tải lâu | Ưu tiên kiến trúc nhẹ nếu chênh lệch độ chính xác không có ý nghĩa thống kê; nén int8 |
| Tiền xử lý web khác Python | Kết quả web sai lệch | Kiểm tra khớp Python–trình duyệt ở B11 |

## 12. Điểm dừng chờ duyệt

| Sau bước | Chủ dự án xem và quyết định |
| --- | --- |
| B1 | Danh sách lớp và bảng ghép sản phẩm |
| B3 | Duyệt tay ảnh, kết quả kiểm định nhãn |
| B4 | Các tập và tập lạ |
| B5, B6 | Mô hình nền, kiến trúc được chọn |
| B8 | Số liệu cuối; có đưa lên web không |
| B11 | Giao diện trước khi triển khai |
| B13 | Kết quả thực địa |

Mỗi bước: làm, viết báo cáo, tóm tắt cho chủ dự án, chờ duyệt rồi mới làm bước sau.
