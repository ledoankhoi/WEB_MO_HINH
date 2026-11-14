# B09. Xuất và nén mô hình cho trình duyệt (thí nghiệm E8)

Báo cáo sinh tự động bởi `ml/` (mẫu ở `docs/nhan-dang-robot/00-ke-hoach.md` mục 6). Thời gian chạy: 0.0 giây. Số liệu máy đọc: `ml/reports/B09/summary.json`.

## 1. Mục tiêu

Đưa mô hình đã huấn luyện về dạng chạy được trong trình duyệt của khách (ONNX Runtime Web), nhỏ nhất có thể mà vẫn giữ độ chính xác; trả lời phần "kích thước và tốc độ" của RQ3.

## 2. Đầu vào, đầu ra

- Đầu vào: `ml\data\store\runs\b06\vit_b16_clip-s43` (best.pt, config.json); 6310 ảnh test, 6325 ảnh val (để chọn nhiệt độ T), 500 ảnh train để hiệu chỉnh int8 tĩnh.
- Đầu ra (ở `C:\Users\THINKPAD\WEB_MO_HINH\ml\data\store\b09\robotrec-vit-b16-clip-dff6fdbb-s43`, không vào git): các file `.onnx`, thư mục `goi/` gồm 9 phần `model.partNN.onnx`, `labels.json`, `model-card.json`. Bản sao `model-card.json` và `labels.json` vào git ở `ml/reports/B09/`.

## 3. Công cụ và môi trường

**Môi trường**

| Mục | Giá trị |
| --- | --- |
| Thời điểm chạy (UTC) | 2026-11-14T15:14:00+00:00 |
| Hệ điều hành | Windows 11 (build 10.0.26300, AMD64) |
| Python | 3.11.9 |
| CPU | 12th Gen Intel(R) Core(TM) i7-12800H (20 luồng) |
| RAM | 31.7 GB |
| GPU (PyTorch) | không có (PyTorch không thấy GPU) |
| CUDA của PyTorch | 12.8 |
| Driver (nvidia-smi) | NVIDIA RTX A2000 Laptop GPU, 4096 MiB, 596.52 |
| Google Colab | không |
| Kaggle | không |
| Commit git | c063837 (có thay đổi chưa commit) |

**Phiên bản thư viện**

| Thư viện | Phiên bản |
| --- | --- |
| ImageHash | 4.3.2 |
| Pillow | 13.0.0 |
| ddgs | 9.16.1 |
| matplotlib | 3.11.2 |
| mwparserfromhell | 0.7.2 |
| numpy | 2.4.6 |
| onnx | 1.23.2 |
| onnxruntime | 1.31.1 |
| open_clip_torch | 4.2.1 |
| pandas | 3.1.1 |
| rapidfuzz | 3.14.6 |
| requests | 2.34.2 |
| scikit-learn | 1.9.1 |
| scipy | 1.17.1 |
| timm | 1.0.31 |
| torch | 2.11.0+cu128 |
| torchvision | 0.26.0+cu128 |

Thời gian suy luận đo trên CPU của máy này.

## 4. Phương pháp

- **Xuất**: `torch.onnx.export`, bộ xuất TorchScript (dynamo=False), opset 17, đầu vào `pixel_values` (N × 3 × 224 × 224), đầu ra `logits`, kích thước batch động; kiểm tra bằng `onnx.checker` (full_check).
- **fp16**: đổi trọng số và phép tính sang số thực 16 bit (`onnxruntime.transformers.float16`), giữ đầu vào và đầu ra fp32.
- **int8 động**: trọng số các phép MatMul/Gemm lưu 8 bit, kích hoạt lượng tử hoá lúc chạy (`quantize_dynamic`, QInt8). Đây là kiểu nén của mô hình CLIP đang chạy trên web.
- **int8 tĩnh (QDQ)**: cả trọng số (theo từng kênh) và kích hoạt lưu 8 bit; khoảng giá trị của kích hoạt đo trên 500 ảnh train theo hai cách: MinMax (lấy nhỏ nhất, lớn nhất) và Entropy (chọn ngưỡng cắt làm ít mất thông tin nhất). Trước khi nén chạy `quant_pre_process` (suy luận kích thước, gộp phép). Chỉ lượng tử hoá các phép Conv, MatMul, Gemm: lần chạy thử ngày 12/11 với cấu hình mặc định (lượng tử hoá cả các phép cộng phần dư và nhân hệ số tầng của ConvNeXt) làm logits lệch tới 5,3 và top-1 chỉ trùng PyTorch 1,6%; giới hạn như trên giảm độ lệch lớn nhất xuống 1,3.
- **So khớp**: chạy từng bản bằng ONNX Runtime (CPU) trên cùng ảnh test đã tiền xử lý như PyTorch; báo tỉ lệ ảnh có top-1 trùng với PyTorch và chênh logits lớn nhất.
- **Thời gian**: một ảnh (batch 1), bỏ 10 lần đầu, đo 100 lần; trung vị và phân vị 95%. 1 luồng giống worker của web (`numThreads = 1`), 4 luồng để tham khảo.
- **Chọn bản**: bản nhỏ nhất có top-1 trùng PyTorch ≥ 99% và top-1 giảm không quá 1 điểm (tiêu chí B9 của kế hoạch).
- **Đóng gói**: cắt file thành các phần ≤ 20 MB (Supabase Storage gói miễn phí giới hạn 50 MB/file, nhưng ngày 14/11 lượt tải từ máy nhà lên 40 MB trở lên bị ngắt giữa chừng, 30 MB thì được; gói đã chia lại sau khi B9 chạy xong, nội dung file ghép lại không đổi); worker của web ghép lại theo thứ tự. `model-card.json` ghi mã mô hình, kiến trúc, phiên bản dữ liệu, cách tiền xử lý, nhiệt độ T, ngưỡng t₁–t₃ của B8, mã sha256 từng phần.

### Giải thích bằng lời thường

- **ONNX** là định dạng chung để chở mô hình từ PyTorch (nơi huấn luyện) sang trình duyệt (nơi chạy cho khách).
- **Nén 8 bit** giống lưu ảnh JPEG thay vì ảnh gốc: mỗi con số trong mô hình dùng 1 byte thay vì 4 byte, file nhỏ khoảng 4 lần, kết quả gần như không đổi. Phải đo lại để chắc "gần như" là bao nhiêu.
- **Cắt thành nhiều phần** vì nơi lưu file của web chỉ nhận file dưới 50 MB; trình duyệt tải từng phần rồi nối lại.

## 5. Kết quả

**Bảng 1. Các bản xuất (PyTorch fp32: top-1 78,83%)**

| Bản | Kích thước (MB) | top-1 test (%) | macro-F1 (%) | ECE (sau T) | top-1 trùng PyTorch (%) | Chênh logits lớn nhất | ms/ảnh, 1 luồng (trung vị / p95) | ms/ảnh, 4 luồng |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fp32 | 328,0 | 78,83 | 76,89 | 0,017 | 100,00 | 0,0001 | 1183,2 / 1304,6 | 358,4 / 387,6 |  |
| fp16 | 164,1 | 78,80 | 76,86 | 0,017 | 99,94 | 0,1861 | 967,0 / 1314,9 | 427,6 / 437,7 | **chọn** |
| int8-dynamic | 84,6 | 77,35 | 75,39 | 0,025 | 90,22 | 3,5809 | 485,9 / 598,7 | 153,8 / 164,3 |  |
| int8-static-minmax | 83,4 | 71,14 | 69,05 | 0,038 | 77,35 | 6,1413 | 515,2 / 643,6 | 172,8 / 183,6 |  |

**Bảng 2. Gói của bản fp16**

| Phần | MB | sha256 (16 ký tự đầu) |
| --- | --- | --- |
| model.part00.onnx | 45,00 | aab61fdd1136032a |
| model.part01.onnx | 45,00 | 700095bb425c5b33 |
| model.part02.onnx | 45,00 | ac6f78c2119f48f4 |
| model.part03.onnx | 29,12 | 63e19f6846930675 |

## 6. Phân tích

- Bản được chọn: **fp16**, 164,1 MB (9 phần), top-1 trùng PyTorch 99,94%, top-1 78,80% so với 78,83% của PyTorch; một ảnh mất 967,0 ms (1 luồng, CPU máy này).
- So với fp32 (328,0 MB), bản được chọn nhỏ hơn 2,0 lần.
- fp16 trên CPU thường không nhanh hơn fp32 vì nhiều phép không có bản 16 bit trên CPU (ONNX Runtime chèn phép đổi kiểu); fp16 chỉ có lợi trên GPU (WebGPU).

## 7. Hạn chế và rủi ro

- Thời gian đo bằng ONNX Runtime bản Python trên CPU máy tính; trong trình duyệt (WASM) chậm hơn, trên điện thoại chậm hơn nữa. Số đo thật trên trình duyệt làm ở B11.
- Tiền xử lý ở trình duyệt chép lại thuật toán của Pillow (`src/lib/recognition-preprocess.ts`, trùng từng byte trên 7 ảnh mẫu); B11 kiểm tra khớp Python và trình duyệt trên 20 ảnh mẫu.
- int8 tĩnh phụ thuộc ảnh hiệu chỉnh; ảnh khách gửi khác miền có thể làm sai số lượng tử lớn hơn.
- Bản int8 tĩnh Entropy không tạo được ở lần chạy này: khi đo khoảng giá trị kích hoạt, ONNX Runtime báo hết bộ nhớ (cùng lúc máy đang huấn luyện B7 và giữ sẵn ảnh val, test trong RAM). Bản MinMax cùng kiểu đã trùng PyTorch chỉ 77,35%, nên khó có khả năng Entropy đạt 99%; có thể chạy lại riêng khi máy rảnh. Thời gian một ảnh cũng đo trong lúc máy bận huấn luyện, nên chậm hơn khi máy rảnh.
## 8. Tái lập

| Mục | Giá trị |
| --- | --- |
| Hạt giống | 0 |
| Phiên bản dữ liệu | b04_splits.csv sha256 dff6fdbb77c0 |

```bash
ml/.venv/Scripts/python ml/scripts/b09_xuat_onnx.py --run "ml\data\store\runs\b06\vit_b16_clip-s43"
```
