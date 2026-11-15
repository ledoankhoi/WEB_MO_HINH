# Nhận dạng robot từ ảnh: tổng hợp

Đề tài luận văn: nhận dạng robot (Transformers, Gundam, Super Sentai/Power Rangers) từ ảnh bằng học có giám sát, chạy trong trình duyệt của website ROBOTICA. Làm từ 07/11 đến 15/11/2026.

| Tài liệu | Nội dung |
| --- | --- |
| [00-ke-hoach.md](00-ke-hoach.md) | Kế hoạch B0–B14, câu hỏi nghiên cứu, thí nghiệm E1–E9 |
| [nhat-ky.md](nhat-ky.md) | Trạng thái từng bước, dòng thời gian, quyết định của chủ dự án (mục 4) |
| [bao-cao/](bao-cao/) | Báo cáo 8 mục của từng bước; `ket-qua-cac-buoc.xlsx` gom số liệu |
| [../chuan/08-tich-hop-ai.md](../chuan/08-tich-hop-ai.md) | Đặc tả tính năng trên website: kiến trúc, API, mã nguồn, cách thay mô hình |
| [../../ml/README.md](../../ml/README.md) | Cách chạy đường ống học máy |
| [huong-dan-go-cach-cu.md](huong-dan-go-cach-cu.md) | Cách gỡ tìm bằng ảnh cũ (chưa gỡ, theo quyết định của chủ dự án) |

## Kết quả một dòng

Mô hình cuối (ViT-B/16 khởi tạo từ CLIP, tinh chỉnh với Mixup/CutMix) nhận đúng robot ở **79,6–80,0%** ảnh test (195 lớp), đúng nhân vật 81,6%, đúng franchise 97,7%; hơn mốc đặc trưng đóng băng (65,6%) khoảng 14 điểm. Bản fp16 164 MB chạy trong trình duyệt cho cùng kết quả với Python (20/20 ảnh), đang bật trên web từ 15/11/2026.

## Bảng tổng hợp các bước

| Bước | Nội dung | Kết quả chính | Báo cáo |
| --- | --- | --- | --- |
| B0 | Môi trường | i7-12800H, RTX A2000 Laptop 4 GB; huấn luyện nặng trên Colab, Kaggle | [B00](bao-cao/B00-moi-truong.md) |
| B1 | Danh mục | 230 robot, cây lớp → nhân vật → franchise; chủ dự án duyệt | [B01](bao-cao/B01-danh-muc-robot.md) |
| B2 | Thu thập ảnh | 75.792 ảnh thô, 201–650 ảnh mỗi lớp (trung vị 317) | [B02](bao-cao/B02-thu-anh.md), [B02a](bao-cao/B02a-thu-anh-chay-thu.md), [B02b](bao-cao/B02b-trung-lap.md) |
| B3 | Làm sạch, kiểm định nhãn | Lọc tự động còn 53.523 ảnh. Kiểm định: AI chấm 500 ảnh, người kiểm 50 ảnh; khoảng 73% ảnh tải về đúng nhãn (sau lọc 76,8%); κ người–AI 0,36–0,45 | [B03a](bao-cao/B03a-lam-sach-tu-dong.md), [B01-B04](bao-cao/B01-B04-bo-du-lieu.md) |
| B4 | Chia tập | train 29.513 / val 6.325 / test 6.310 (195 lớp); 35 lớp robot lạ; tập âm 2.898 ảnh; không rò rỉ | [B04](bao-cao/B04-chia-tap.md), [B04b](bao-cao/B04b-tap-am.md) |
| B5 | Mốc so sánh (E1) | CLIP ViT-L/14 đóng băng + linear probe: test 65,6% [64,5; 66,8]; zero-shot 23,4%; k-NN 49,0% | [B05](bao-cao/B05-mo-hinh-nen.md), [B08a](bao-cao/B08a-danh-gia-moc-b05.md) |
| B6 | Huấn luyện chính (E2) | 3 kiến trúc × 3 hạt giống; chọn ViT-B/16 (CLIP): val 78,85 ± 0,39%, hơn ConvNeXt-Tiny 2,7–3,6 điểm (p < 0,001) | [B06](bao-cao/B06-huan-luyen.md), [tổng hợp B0–B6](bao-cao/B00-B06-tong-hop.md) |
| B7 | Thí nghiệm phụ (E3, E4) | 14 lần chạy; chỉ Mixup/CutMix có ý nghĩa (+1,34 điểm val, p < 0,001); ImageNet-21k thay CLIP kém 4,84 điểm; thêm dữ liệu từ 50% lên 100% giảm lỗi 3,28 điểm | [B07](bao-cao/B07-thi-nghiem-phu.md) |
| B8 | Đánh giá (E5–E7) | Mô hình cuối: test 79,56 / 79,67 / 79,98%, hơn B6 cùng hạt giống 0,8–2,2 điểm (p ≤ 0,006); ECE 1,2–1,8%; AUROC robot lạ 0,82, ảnh âm 0,93; E7 nâng AUROC ảnh âm lên 0,994 | [B08](bao-cao/B08-danh-gia.md), [B08b](bao-cao/B08b-danh-gia-mo-hinh-b06.md) |
| B9 | Xuất ONNX (E8) | fp16 164 MB, top-1 79,97%, trùng PyTorch 99,98%; int8 không đạt (trùng 91%) | [B09](bao-cao/B09-xuat-onnx.md) |
| B10 | CSDL, quản trị | Bảng `robots`, `robot_products`, `recognition_models`, `recognition_logs`; trang `/admin/nhan-dien` | [B11-B12](bao-cao/B11-B12-web.md) |
| B11 | Chạy trong trình duyệt | Tiền xử lý trùng từng byte; 20/20 ảnh trùng top-1; khoảng 1 s mỗi ảnh (WASM 1 luồng) | [B11-B12](bao-cao/B11-B12-web.md) |
| B12 | Kiểm thử, đưa lên | lint, typecheck, Vitest, build đạt; mô hình cuối bật 15/11/2026 20:57 | [B11-B12](bao-cao/B11-B12-web.md), [nhật ký](nhat-ky.md) |
| B13 | Thử nghiệm thực địa (E9) | **Chưa làm**: chờ ảnh chụp thật của chủ dự án | |
| B14 | Tài liệu | Viết lại [08-tich-hop-ai](../chuan/08-tich-hop-ai.md), [00-quyet-dinh-nen-tang](../chuan/00-quyet-dinh-nen-tang.md) mục 8, `ml/README.md`, file này. Không gỡ cách cũ | |

## Khác kế hoạch

- B3 không chấm tay 500 ảnh: AI chấm, người kiểm 50 ảnh; không đổi dữ liệu (15/11/2026).
- B11: trang khách chỉ hiện bảng xếp hạng 5 robot, không hiện câu trả lời theo cấp (15/11/2026).
- B14: không xoá mã và bảng của cách cũ, chỉ viết hướng dẫn gỡ.
- B9: kế hoạch dự kiến bản int8 (ViT khoảng 90 MB); int8 chỉ trùng PyTorch 91% nên dùng fp16 164 MB.
- B10: file mô hình chia phần 20 MB thay vì 45 MB vì lượt tải lên Storage từ 40 MB trở lên bị ngắt.

## Việc còn lại

- B13: thử nghiệm với ảnh chụp thật.
- B8: gán loại lỗi cho 100 ảnh sai.
- Hướng tiếp: huấn luyện lại cấu hình cuối kèm outlier exposure (E7) đủ 3 hạt giống; làm sạch nhãn thêm; WebGPU; lượng tử hoá int8 có huấn luyện.
