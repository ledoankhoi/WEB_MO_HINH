# B00. Môi trường và khung báo cáo

Báo cáo sinh tự động bởi `ml/` (mẫu ở `docs/nhan-dang-robot/00-ke-hoach.md` mục 6). Thời gian chạy: 10.2 giây. Số liệu máy đọc: `ml/reports/B00/summary.json`.

## 1. Mục tiêu

Dựng môi trường chạy đường ống học máy (thư mục `ml/`), kiểm tra các điều kiện để những bước sau tái lập được: đủ thư viện, hạt giống cho cùng kết quả, có GPU, truy cập được các nguồn dữ liệu. Đo năng lực phần cứng để ước lượng thời gian huấn luyện của B6 và quyết định bước nào chạy ở máy, bước nào chạy trên Colab.

## 2. Đầu vào, đầu ra

- Đầu vào: không có (chỉ cấu hình `ml/configs/base.yaml`).
- Đầu ra: `ml/requirements.lock.txt` (phiên bản thư viện đã dùng), báo cáo này, `ml/reports/B00/summary.json`.
- Thư mục dữ liệu nặng: `C:\Users\THINKPAD\WEB_MO_HINH\ml\data\store` (biến `ROBOTREC_DATA`; trên Colab là Google Drive).

## 3. Công cụ và môi trường

**Môi trường**

| Mục | Giá trị |
| --- | --- |
| Thời điểm chạy (UTC) | 2026-11-07T08:50:11+00:00 |
| Hệ điều hành | Windows 11 (build 10.0.26200, AMD64) |
| Python | 3.11.9 |
| CPU | 12th Gen Intel(R) Core(TM) i7-12800H (20 luồng) |
| RAM | 31.7 GB |
| GPU (PyTorch) | NVIDIA RTX A2000 Laptop GPU (4.0 GB) |
| CUDA của PyTorch | 12.8 |
| Driver (nvidia-smi) | NVIDIA RTX A2000 Laptop GPU, 4096 MiB, 596.52 |
| Google Colab | không |
| Commit git | c56347e (có thay đổi chưa commit) |

**Phiên bản thư viện**

| Thư viện | Phiên bản |
| --- | --- |
| Pillow | 13.0.0 |
| matplotlib | 3.11.2 |
| mwparserfromhell | 0.7.2 |
| numpy | 2.4.6 |
| pandas | 3.1.1 |
| rapidfuzz | 3.14.6 |
| requests | 2.34.2 |
| scipy | 1.17.1 |
| torch | 2.11.0+cu128 |
| torchvision | 0.26.0+cu128 |

## 4. Phương pháp

- **Kiểm tra thư viện:** nhập (import) từng thư viện bắt buộc của B0.
- **Tính tất định:** đặt hạt giống 42 cho `random`, `numpy`, `torch`; bật `cudnn.deterministic`, tắt `cudnn.benchmark`, `torch.use_deterministic_algorithms(True)`. Chạy hai lần cùng 10 bước huấn luyện một mạng tích chập nhỏ (AdamW, batch 32, ảnh 64 × 64) và so sánh loss, tham số.
- **Thông lượng nhân ma trận:** nhân hai ma trận vuông n × n, 10 lần sau 3 lần khởi động; TFLOPS = 2n³ · số lần / thời gian / 10¹². GPU: n = 4096 (fp32 và fp16); CPU: n = 2048 (fp32).
- **Tốc độ huấn luyện:** với từng kiến trúc của B6 (bản torchvision, khởi tạo ngẫu nhiên, 200 lớp), một bước huấn luyện gồm forward, cross-entropy, backward và AdamW ở 224 × 224. Đo 15 bước sau 5 bước khởi động; thử batch 32, 16, 8 cho tới khi vừa bộ nhớ GPU. Ảnh/giây = batch / thời gian trung bình một bước. Thay ba yếu tố:
- Yếu tố 1, chế độ cuDNN: **tất định** (chỉ dùng thuật toán tất định, không tự dò) hay **nhanh** (`cudnn.benchmark = True`: cuDNN thử nhiều thuật toán ở các bước khởi động rồi giữ cái nhanh nhất).
- Yếu tố 2, bố cục bộ nhớ của tensor: **mặc định** (NCHW) hay **channels_last** (NHWC, thường nhanh hơn với Tensor Core).
- Yếu tố 3, kiểu số: **fp16** (mixed precision, `torch.autocast` + `GradScaler`) hay **fp32** (đo một lần ở chế độ nhanh, bố cục mặc định, 2 bước khởi động + 5 bước đo).
- **Lặp và chống thiên lệch:** mỗi cấu hình fp16 đo 3 lần; thứ tự toàn bộ các lần đo được xáo trộn (hạt giống 0) để GPU nóng dần không thiên vị cấu hình nào. Báo trung bình ± độ lệch chuẩn của tốc độ giữa các lần lặp và khoảng thấp nhất – cao nhất. Trước mỗi lần đo ghi nhiệt độ, xung nhịp SM và công suất của GPU (`nvidia-smi`).
- **Tràn bộ nhớ GPU:** nếu bộ nhớ đỉnh do PyTorch cấp vượt 95% dung lượng GPU thì đánh dấu "tràn VRAM": trên Windows driver dùng RAM hệ thống thay cho VRAM, tốc độ khi đó không dùng để so sánh.
- **Truy cập nguồn dữ liệu:** gửi một yêu cầu GET tới API hoặc trang chủ của từng nguồn, thời gian chờ tối đa 20 giây.

## 5. Kết quả

**Bảng 1. Các kiểm tra môi trường**

| Kiểm tra | Kết quả | Đạt |
| --- | --- | --- |
| Python ≥ 3.11 | 3.11.9 | có |
| Thư viện bắt buộc của B0 | đủ | có |
| Thư mục dữ liệu ghi được, còn ≥ 20 GB | còn 849 GB | có |
| numpy cho cùng dãy số với cùng hạt giống | giống nhau | có |
| Khoảng Wilson của 95/100 = [0,8882; 0,9785] | 0.9500 [0.8882; 0.9785] | có |
| PyTorch dùng được GPU (CUDA) | có | có |
| Huấn luyện trên GPU tất định (2 lần chạy) | loss giống nhau: có; lệch tham số lớn nhất 0.00e+00 | có |

Số đo dùng lại từ lần chạy lúc 2026-11-07T07:29:06+00:00 (UTC).

### Thông lượng nhân ma trận

**Bảng 2. Thông lượng nhân ma trận (càng cao càng nhanh)**

| Thiết bị | Kiểu số | n | TFLOPS |
| --- | --- | --- | --- |
| GPU | fp32 | 4096 | 3.06 |
| GPU | fp16 | 4096 | 20.07 |
| CPU | fp32 | 2048 | 0.53 |

### Tốc độ huấn luyện các kiến trúc của B6

**Bảng 3. Tốc độ huấn luyện ở 224 × 224, AdamW (ảnh/giây: trung bình ± độ lệch chuẩn qua các lần lặp)**

| Kiến trúc | Chế độ | Bố cục bộ nhớ | Kiểu số | Số lần lặp | Tham số (triệu) | Batch | Ảnh/giây (TB ± ĐLC) | Thấp nhất – cao nhất | Bộ nhớ GPU đỉnh (GB) | Tràn VRAM | Nhiệt độ GPU (°C) | Ước lượng 30 epoch × 30k ảnh (giờ) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ConvNeXt-Tiny | nhanh | channels_last | fp16 (AMP) | 3 | 28 | 32 | 157.1 ± 1.2 | 156.3 – 158.4 | 2.29 | không | 70–74 | 1.6 |
| ConvNeXt-Tiny | nhanh | mặc định | fp16 (AMP) | 3 | 28 | 32 | 158.3 ± 4.7 | 154.5 – 163.6 | 2.29 | không | 60–72 | 1.6 |
| ConvNeXt-Tiny | tất định | channels_last | fp16 (AMP) | 3 | 28 | 32 | 144.0 ± 1.9 | 142.3 – 146.1 | 2.29 | không | 65–75 | 1.7 |
| ConvNeXt-Tiny | tất định | mặc định | fp16 (AMP) | 3 | 28 | 32 | 140.2 ± 1.5 | 138.9 – 141.8 | 2.29 | không | 73–74 | 1.8 |
| ConvNeXt-Tiny | nhanh | mặc định | fp32 | 1 | 28 | 32 | 13.3 ± 0.0 | 13.3 – 13.3 | 3.68 | không | 75–75 | 18.8 |
| EfficientNetV2-S | nhanh | channels_last | fp16 (AMP) | 3 | 20.4 | 32 | 22.8 ± 0.1 | 22.7 – 22.9 | 2.69 | không | 68–73 | 11 |
| EfficientNetV2-S | nhanh | mặc định | fp16 (AMP) | 3 | 20.4 | 32 | 143.8 ± 4.9 | 138.9 – 148.7 | 2.69 | không | 70–75 | 1.7 |
| EfficientNetV2-S | tất định | channels_last | fp16 (AMP) | 2 | 20.4 | 32 | 21.0 ± 2.0 | 19.6 – 22.4 | 2.67 | không | 66–75 | 11.9 |
| EfficientNetV2-S | tất định | mặc định | fp16 (AMP) | 3 | 20.4 | 32 | 132.2 ± 0.6 | 131.6 – 132.7 | 2.67 | không | 73–74 | 1.9 |
| EfficientNetV2-S | nhanh | mặc định | fp32 | 1 | 20.4 | 32 | 11.4 ± 0.0 | 11.4 – 11.4 | 4.91 | có | 71–71 | — |
| ViT-B/16 | nhanh | channels_last | fp16 (AMP) | 3 | 86 | 32 | 72.5 ± 7.2 | 64.2 – 77.3 | 3.37 | không | 73–75 | 3.4 |
| ViT-B/16 | nhanh | mặc định | fp16 (AMP) | 3 | 86 | 32 | 72.8 ± 10.0 | 61.7 – 81.1 | 3.37 | không | 52–75 | 3.4 |
| ViT-B/16 | tất định | channels_last | fp16 (AMP) | 3 | 86 | 32 | 72.2 ± 2.4 | 69.8 – 74.5 | 3.37 | không | 56–70 | 3.5 |
| ViT-B/16 | tất định | mặc định | fp16 (AMP) | 3 | 86 | 32 | 68.4 ± 1.7 | 66.5 – 69.6 | 3.37 | không | 72–73 | 3.7 |
| ViT-B/16 | nhanh | mặc định | fp32 | 1 | 86 | 32 | 4.7 ± 0.0 | 4.7 – 4.7 | 4.86 | có | 69–69 | — |

**Bảng 3b. Lần lặp bị loại vì bị gián đoạn (độ lệch chuẩn thời gian một bước > 50% trung bình)**

| Kiến trúc | Chế độ | Bố cục bộ nhớ | Kiểu số | Thời gian một bước (ms) | Ảnh/giây |
| --- | --- | --- | --- | --- | --- |
| EfficientNetV2-S | tất định | channels_last | fp16 (AMP) | 275907 ± 1062233 | 0.12 |

Nhật ký hệ thống Windows (Kernel-Power, sự kiện 506 vào và 507 ra khỏi Modern Standby) ghi máy đã ngủ trong lúc đo: 2026-11-07 14:33:16 → 2026-11-07 15:41:50 (68.6 phút) (giờ máy). Lần lặp trên trùng khoảng ngủ nên bị loại. Từ đây các script giữ máy thức bằng `SetThreadExecutionState` (`robotrec/awake.py`).

Cảnh báo của PyTorch trong lúc đo:

- `Memory Efficient attention defaults to a non-deterministic algorithm. To explicitly enable determinism call torch.use_deterministic_algorithms(True, warn_only=False).`

### Truy cập nguồn dữ liệu

**Bảng 4. Truy cập các nguồn dữ liệu và trọng số**

| Nguồn | Dùng ở | Mã HTTP | Thời gian (ms) | Truy cập được |
| --- | --- | --- | --- | --- |
| TFWiki (MediaWiki API) | B1, B2 | 200 | 991 | có |
| Gundam Wiki (fandom) | B1, B2 | 200 | 683 | có |
| RangerWiki: Power Rangers và Super Sentai (fandom) | B1, B2 | 200 | 689 | có |
| DuckDuckGo | B2 | 200 | 975 | có |
| Bing | B2 | 200 | 572 | có |
| Flickr API | B2 | 200 | 1249 | có |
| Hugging Face (trọng số CLIP, DINOv2) | B3, B5, B6 | 200 | 603 | có |
| PyTorch download | B0, B6 | 200 | 383 | có |

Đã ghi `ml/requirements.lock.txt` (48 gói).

## 6. Phân tích

**Bảng 5. Cấu hình nhanh nhất của từng kiến trúc và tỉ lệ tốc độ giữa các lựa chọn (< 1 là chậm hơn)**

| Kiến trúc | Cấu hình nhanh nhất | Ảnh/giây | Tất định / nhanh (fp16, mặc định) | channels_last / mặc định (nhanh, fp16) | fp32 / fp16 (nhanh, mặc định) | Ước lượng 30 epoch × 30k ảnh (giờ) |
| --- | --- | --- | --- | --- | --- | --- |
| ConvNeXt-Tiny | nhanh, mặc định, fp16 (AMP) | 158.3 | 0.89 | 0.99 | 0.08 | 1.6 |
| EfficientNetV2-S | nhanh, mặc định, fp16 (AMP) | 143.8 | 0.92 | 0.16 | — | 1.7 |
| ViT-B/16 | nhanh, mặc định, fp16 (AMP) | 72.8 | 0.94 | 1 | — | 3.4 |

- Mọi kiểm tra môi trường đều đạt.
- Bảng 5 tách ảnh hưởng của ba lựa chọn kỹ thuật lên tốc độ huấn luyện (tính trên trung bình của các lần lặp). Thời gian ước lượng chưa tính đọc và giải mã ảnh; trên thực tế bước đọc ảnh có thể là nút thắt nếu không đủ luồng tải dữ liệu.
- Độ dao động giữa các lần lặp: lớn nhất ở ViT-B/16 (nhanh, mặc định), khoảng thấp nhất – cao nhất bằng 27% tốc độ trung bình. Nhiệt độ GPU trước các lần đo nằm trong 52–75 °C, xung nhịp SM 705–1710 MHz. Chênh lệch giữa hai cấu hình nhỏ hơn mức dao động này thì không coi là khác biệt thật.
- Bộ nhớ GPU đỉnh vượt dung lượng vật lý (4.0 GB) ở: EfficientNetV2-S (fp32, 4.91 GB), ViT-B/16 (fp32, 4.86 GB). Trên Windows, khi đó driver tràn dữ liệu sang RAM hệ thống qua PCIe nên tốc độ đo được không phản ánh tốc độ tính toán; các dòng này bị loại khỏi bảng 5 và không dùng để ước lượng thời gian. Kết luận rút ra vẫn đúng: với GPU 4 GB, huấn luyện fp32 ở batch 32 không khả thi, phải dùng mixed precision.
- ConvNeXt-Tiny: nhanh nhất với nhanh, mặc định, fp16 (AMP) (158.3 ảnh/giây). Chế độ tất định chậm hơn chế độ nhanh 11% (tỉ lệ 0.89); channels_last nhanh ngang bố cục mặc định (tỉ lệ 0.99); fp32 chậm hơn fp16 92% (tỉ lệ 0.08).
- EfficientNetV2-S: nhanh nhất với nhanh, mặc định, fp16 (AMP) (143.8 ảnh/giây). Chế độ tất định chậm hơn chế độ nhanh 8% (tỉ lệ 0.92); channels_last chậm hơn bố cục mặc định 84% (tỉ lệ 0.16); fp32 không so được với fp16 (tràn VRAM hoặc thiếu số đo).
- ViT-B/16: nhanh nhất với nhanh, mặc định, fp16 (AMP) (72.8 ảnh/giây). Chế độ tất định chậm hơn chế độ nhanh 6% (tỉ lệ 0.94); channels_last nhanh ngang bố cục mặc định (tỉ lệ 1.00); fp32 không so được với fp16 (tràn VRAM hoặc thiếu số đo).
- Hệ quả cho B6: mỗi kiến trúc dùng bố cục bộ nhớ nhanh nhất của nó (bảng 5) và luôn huấn luyện bằng mixed precision fp16. Chế độ tất định chậm hơn chế độ nhanh 6–11%; mức này chấp nhận được (thời gian 30 epoch ở bảng 3) nên giữ chế độ tất định cho mọi lần chạy, để chạy lại cùng hạt giống cho cùng kết quả (trừ phần attention của ViT, mục 7).
- Mọi nguồn dữ liệu đều truy cập được.

## 7. Hạn chế và rủi ro

- Tốc độ đo trên dữ liệu ngẫu nhiên đã nằm sẵn trên GPU, nên là cận trên; tốc độ thật phụ thuộc thêm vào đọc ảnh và tăng cường dữ liệu.
- Tính tất định chỉ đảm bảo trên cùng GPU, cùng phiên bản thư viện. Kết quả trên Colab có thể lệch nhỏ so với máy này; vì vậy độ dao động được đo bằng 3 hạt giống thay vì dựa vào một lần chạy.
- Truy cập được trang chủ hay API chưa có nghĩa là tải hàng loạt không bị chặn; giới hạn tốc độ của từng nguồn được đo ở B2.
- PyTorch báo phép attention hiệu quả bộ nhớ (dùng trong ViT) có bước lan truyền ngược không tất định. Kiểm tra tất định ở bảng 1 dùng mạng tích chập nên đạt, nhưng ViT-B/16 ở B6 sẽ lệch nhỏ giữa hai lần chạy cùng hạt giống, trừ khi ép dùng kernel attention toán học (chậm hơn). Báo cáo B6 sẽ ghi rõ chế độ đã dùng.

## 8. Tái lập

| Mục | Giá trị |
| --- | --- |
| Cấu hình | ml/configs/base.yaml |
| Mã cấu hình | 71afb6321f53 |
| Hạt giống | 42 |

```bash
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
ml/.venv/Scripts/python -m pip install -r ml/requirements.in
ml/.venv/Scripts/python ml/scripts/b00_moi_truong.py
```
