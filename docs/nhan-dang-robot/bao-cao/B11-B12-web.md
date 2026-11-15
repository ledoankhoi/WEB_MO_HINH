# B11–B12. Chạy mô hình trong trình duyệt, kiểm thử và đưa lên

## 1. Mục tiêu

- Đưa mô hình của B9 vào trang `/tim-bang-anh`: ảnh khách xử lý ngay trong trình duyệt, máy chủ chỉ nhận xác suất.
- Kiểm chứng phía trình duyệt cho **cùng kết quả** với Python:
  - tiền xử lý trùng từng byte;
  - top-1 trùng 100% trên 20 ảnh thật (tiêu chí của kế hoạch B11).
- Đo thời gian chạy.
- Kiểm thử toàn bộ website trước khi đưa lên (B12).

## 2. Đầu vào, đầu ra

**Đầu vào:**
- Gói mô hình của B9 (`robotrec-vit-b16-clip-dff6fdbb-s43`, bản fp16, 164,1 MB).
- `robots.json` của B1.
- 20 ảnh test thật.

**Đầu ra:**
- Các file mô hình trên Supabase Storage: `media/ml/robotrec-vit-b16-clip-dff6fdbb-s43/`, 9 phần 20 MB.
- Dữ liệu trên CSDL:
  - 230 robot;
  - 76 cặp robot–sản phẩm;
  - mô hình, **đang bật** từ khoảng 01:00 ngày 15/11/2026.
- Kết quả kiểm tra khớp: `ml/data/store/b11/khop/ket-qua-web.json` (không vào git, vì có ảnh).

## 3. Công cụ và môi trường

| Mục | Giá trị |
| --- | --- |
| Trình duyệt / môi trường đo | ONNX Runtime Web 1.30.0, WASM, 1 luồng (giống worker của web), chạy trong Node 26.13 trên máy nhà (i7-12800H) |
| Phía Python | ONNX Runtime 1.31.1, PyTorch 2.11 (CPU) |
| Website | Next.js 16.4.5 (Turbopack, Cache Components), Vitest 5.0.3, PGlite cho test CSDL |
| Script | `ml/scripts/b11_kiem_tra_khop.py`, `test/recognition-parity.test.ts`, `scripts/recognition-import.mjs` |

Lúc đo, máy đang huấn luyện B7 trên GPU và CPU, nên thời gian chậm hơn khi máy rảnh.

## 4. Phương pháp

- **Tiền xử lý.** Chép lại đúng thuật toán của Pillow và torchvision trong `src/lib/recognition-preprocess.ts`:
  - thu cạnh ngắn về 256 bằng song tuyến 8 bit, hệ số 22 bit, làm tròn sau mỗi chiều;
  - cắt giữa 224, lề làm tròn nửa về chẵn;
  - ảnh trong suốt trộn lên nền trắng.
- **Ca mẫu tiền xử lý.** Sinh 7 ảnh bằng công thức (`ml/scripts/xuat_mau_tien_xu_ly.py`) và so mã SHA-256 của ảnh 224×224 sau tiền xử lý.
- **Kiểm tra khớp trên ảnh thật:**
  - Chọn 20 ảnh test, rải đều 3 franchise × 5 miền ảnh, hạt giống cố định.
  - Python ghi điểm ảnh RGB thô, để hai bên đọc đúng cùng điểm ảnh và không lệch do bộ giải mã JPEG khác nhau.
  - Hai bên chạy cùng file ONNX; so top-1 và chênh logits lớn nhất.
- **Luật trả lời theo cấp.** Viết một lần trong `src/lib/recognition.ts`. Trình duyệt và máy chủ cùng dùng hàm này, và đã khớp Python trên 48 ca mẫu.
- **Kiểm thử website:** `npm run lint`, `npm run typecheck`, `npm test` (toàn bộ), `npm run build`, `npm run smoke`, và test Python của `ml/`.
  - Tất cả chạy trong một git worktree riêng chỉ chứa phần của đề tài, tách từ commit trước.
  - Mục đích: chắc bản đưa lên build được mà không cần thay đổi chưa commit của phiên làm việc khác trên cùng repo.

### Giải thích bằng lời thường

Mô hình học trên ảnh đã được Python thu nhỏ và cắt theo một cách rất cụ thể. Nếu trình duyệt thu nhỏ ảnh khác đi dù chỉ một chút, mô hình sẽ thấy một ảnh hơi khác và có thể đoán khác. Vì vậy phần tiền xử lý được viết lại để cho ra đúng từng điểm ảnh như Python. Sau đó chạy thử 20 ảnh thật ở cả hai phía, xem kết quả có giống nhau không.

## 5. Kết quả

**Bảng 1. Kiểm tra khớp trên 20 ảnh thật**

| Chỉ số | Giá trị |
| --- | --- |
| Ảnh sau tiền xử lý trùng Python (7 ca mẫu) | 7/7 (SHA-256 giống nhau) |
| Top-1 trình duyệt trùng ONNX Runtime Python | **20/20** |
| Top-1 trình duyệt trùng PyTorch | 19/20 |
| Chênh logits lớn nhất so với ONNX Python / PyTorch | 0,0035 / 0,0171 |
| Ảnh đoán đúng nhãn | 14/20 |
| Tải phiên mô hình (file đã có sẵn) | 1,26 s |
| Tiền xử lý một ảnh (trung vị) | 11,8 ms |
| Chạy mô hình một ảnh, trung vị / p95 | **1,94 s / 2,08 s** |

- Ảnh lệch với PyTorch: `gundam-rms-099-rick-dias`, ảnh hộp sản phẩm. PyTorch có hai lớp đầu cách nhau chỉ 0,0018 logit, nên làm tròn fp16 là đủ đảo thứ tự. Cả hai bên đều đoán sai ảnh này. Trên toàn tập test, B9 đo được bản fp16 trùng PyTorch 99,94%.

**Bảng 2. Kiểm thử website (B12), 15/11/2026**

| Lệnh | Kết quả | Thời gian |
| --- | --- | --- |
| `npm run lint` | sạch | — |
| `npm run typecheck` | sạch | — |
| `npm test` (`--maxWorkers=4`) | 386 đạt, 1 bỏ qua (test khớp trên ảnh thật, chỉ chạy khi có `RECOGNITION_PARITY_DIR`) | 109 s |
| Trong đó các test nhận dạng | 80 đạt (6 file) | 6 s |
| `npm run build` | đạt, 176 trang | 65 s |
| `npm run smoke` | mọi trang đều ổn, kể cả `/tim-bang-anh` và `/admin/nhan-dien` | 116 s |
| Test Python `ml/tests` | 69 đạt | 28 s |

**Kiểm tra API.** Gửi một vector xác suất dồn hết vào "Optimus Prime (G1)". API trả cấp "lớp", đúng robot, kèm 3 sản phẩm Optimus Prime của cửa hàng. (Từ 15/11 API trả bảng xếp hạng thay cho cấp trả lời, xem mục 6.)

## 6. Phân tích

- **Trình duyệt cho đúng kết quả của mô hình.** Mọi chênh lệch còn lại đều do làm tròn fp16, không do tiền xử lý.
- **Chạy 2 giây một ảnh với 1 luồng WASM là dùng được, nhưng chậm.**
  - ViT-B/16 nặng gấp 4 lần ConvNeXt-Tiny về phép tính; ConvNeXt bản thử đo được khoảng 0,5 s.
  - Điện thoại có thể chậm hơn 2–4 lần.
- **Lần đầu tải 164 MB là gánh nặng lớn nhất.** Sau đó trình duyệt lưu đệm. Bản int8 (85 MB) không đạt tiêu chí trùng ≥ 99% ở B9, nên chưa dùng được.

### Cập nhật sau khi chủ dự án thử trên web (15/11/2026)

**Ảnh thử của chủ dự án và kiểm tra lại bằng Python** (cùng file ONNX, cùng tiền xử lý):

| Ảnh đưa vào | Hạng 1 | Xác suất của Ironhide (G1) |
| --- | --- | --- |
| 4 ảnh thật của sản phẩm Ironhide (ảnh cửa hàng bán lẻ) | Ironhide (G1), 4/4 | 77,5–98,0% |
| Ảnh đại diện dựng từ mô hình 3D của sản phẩm, 640×640 | Ironhide (G1) | 57,7% |
| Vùng cắt từ ảnh chụp màn hình khung xem 3D | sai (Drivemax Megazord, Ratchet) | 12,8–20,5% cho hạng 1 |

- Ảnh dựng 3D và ảnh chụp màn hình có giao diện khác xa ảnh huấn luyện (ảnh đồ chơi thật, hoạt hình, hộp), nên mô hình không chắc. Đây là lệch miền ảnh, không phải lỗi chạy trên web.
- **Lỗi giao diện tìm thấy:** ô "Gần giống nhất" luôn bỏ robot hạng 1 (code coi hạng 1 là câu trả lời chính), nên khi trang trả lời "chưa nhận ra" thì robot hạng 1 không hiện ở đâu. Test của B12 có ca "chưa nhận ra" nhưng không kiểm tra danh sách này.
- **Luật theo cấp quá chặt khi hiển thị:** ảnh Optimus Prime (G1) 95,7% vẫn bị trả lời ở cấp thương hiệu vì ngưỡng nhân vật 0,96. Với α = 5%, mô hình đang bật chỉ trả lời đến tên robot cho 42,5% ảnh test đã biết (B8).
- **Chủ dự án quyết định:** trang tạm thời chỉ hiện bảng xếp hạng 5 robot kèm %, sản phẩm của các robot trong bảng theo thứ hạng, một dòng nhắc về % thấp. API trả `{ model, ranking, products }`. Luật theo cấp vẫn chạy ở máy chủ để ghi `level` vào `recognition_logs`, nên số liệu của luật cho luận văn và B13 không mất.

## 7. Hạn chế và rủi ro

- **Môi trường đo.** Thời gian đo trong Node, không phải trình duyệt thật hay điện thoại. Máy đang bận huấn luyện lúc đo.
- **Cỡ mẫu.** 20 ảnh là cỡ mẫu của kế hoạch, đủ để bắt lỗi tiền xử lý, không đủ để đo độ chính xác. Độ chính xác thực tế đo ở B13.
- **WebGPU chưa bật.** Worker chỉ có bản WASM. Bật WebGPU sẽ nhanh hơn nhiều trên máy có GPU.
- **Cỡ phần file.** Lượt tải lên Storage từ máy nhà, với file 40 MB trở lên, bị ngắt giữa chừng, nên phải chia phần 20 MB (`PART_BYTES` của B9). Chưa rõ nguyên nhân: đường mạng hay giới hạn thời gian của Storage.
- **Cache của máy chủ đang chạy.** Script nhập (`scripts/recognition-import.mjs`) chạy ngoài Next.js nên không làm mới cache. Sau khi nhập bằng script, phải khởi động lại máy chủ hoặc bấm bật lại ở `/admin/nhan-dien`.

## 8. Tái lập

```
ml/.venv/Scripts/python ml/scripts/b11_kiem_tra_khop.py --run <ROBOTREC_DATA>/runs/b06/vit_b16_clip-s43 --package <ROBOTREC_DATA>/b09/robotrec-vit-b16-clip-dff6fdbb-s43/goi
RECOGNITION_PARITY_DIR=<ROBOTREC_DATA>/b11/khop npx vitest run test/recognition-parity.test.ts
node --env-file-if-exists=.env.local scripts/recognition-import.mjs <ROBOTREC_DATA>/b09/robotrec-vit-b16-clip-dff6fdbb-s43/goi --activate
npm run lint && npm run typecheck && npx vitest run --maxWorkers=4 && npm run build && npm run smoke
```

Trước bước nhập, tải các phần lên Storage: `node --env-file-if-exists=.env.local scripts/recognition-upload.mjs <thư mục goi/>`.
