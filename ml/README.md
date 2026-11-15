# ml/: đường ống nhận dạng robot

Kế hoạch: [docs/nhan-dang-robot/00-ke-hoach.md](../docs/nhan-dang-robot/00-ke-hoach.md). Báo cáo của từng bước: [docs/nhan-dang-robot/bao-cao/](../docs/nhan-dang-robot/bao-cao/).

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `robotrec/` | Gói dùng chung: `config.py` (đường dẫn, cấu hình), `seed.py` (hạt giống), `env.py` (môi trường), `stats.py` (Wilson, bootstrap, McNemar, Holm), `report.py` (báo cáo 8 mục) |
| `scripts/bXX_*.py` | Script của từng bước; mọi logic nằm ở đây |
| `notebooks/BXX_*.ipynb` | Lớp vỏ chạy script trên Colab (sinh bằng `scripts/make_notebooks.py`) |
| `configs/` | `base.yaml` và cấu hình riêng từng bước |
| `data/manifests/` | Danh sách robot, manifest ảnh, chia tập (có trong git) |
| `reports/BXX/` | `summary.json` và biểu đồ của từng bước (có trong git) |
| `tests/` | Test pytest cho `robotrec` |

Ảnh, checkpoint và file ONNX **không vào git**. Chúng nằm ở thư mục của biến `ROBOTREC_DATA`: mặc định `ml/data/store/` ở máy, `MyDrive/robotica-ml/` trên Colab.

## Chạy ở máy (Windows)

```bash
py -3.11 -m venv ml/.venv            # hoặc đường dẫn đầy đủ tới python.exe 3.11
ml/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
ml/.venv/Scripts/python -m pip install -r ml/requirements.in
ml/.venv/Scripts/python -m pytest ml/tests -q
ml/.venv/Scripts/python ml/scripts/b00_moi_truong.py
```

Máy hiện tại: GPU NVIDIA RTX A2000 Laptop 4 GB. Đủ cho B1–B5 và chạy thử; huấn luyện nặng (B6, B7) chạy trên Colab. Xem số đo ở báo cáo B00.

## Chạy trên Google Colab

1. Mở `ml/notebooks/BXX_*.ipynb` từ GitHub trong Colab (File → Open notebook → GitHub → `ledoankhoi/WEB_MO_HINH`).
2. Bước cần GPU: Runtime → Change runtime type → T4 GPU.
3. Run all. Notebook gắn Drive, lấy mã mới nhất, cài thư viện, chạy script, rồi chép báo cáo vào `MyDrive/robotica-ml/reports/BXX/` để đưa về repo.

## B6: huấn luyện chính

Ảnh của bộ dữ liệu nằm trên Google Drive dưới dạng `MyDrive/robotica-ml/images-raw.zip` (giải nén ra được thư mục `raw/<lớp>/<ảnh>.jpg`).

**Trên Colab** (GPU T4): mở `ml/notebooks/B06_huan_luyen.ipynb` từ GitHub, chọn runtime T4 GPU, Run all. Notebook giải nén ảnh ra đĩa của máy Colab
(`ROBOTREC_DATA=/content/data`) và ghi checkpoint vào Drive (`ROBOTREC_RUNS=MyDrive/robotica-ml/runs`). Colab ngắt thì Run all lại: lần chạy dở
tiếp tục từ epoch đã xong, lần chạy đã xong được bỏ qua.

**Ở máy** (GPU 4 GB tự chia batch 64 thành 2 micro-batch 32):

```bash
ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --smoke --arch convnext_tiny   # chạy thử 2 epoch trên một phần nhỏ dữ liệu
ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --all                          # 9 lần chạy, chạy tiếp được khi bị ngắt
ml/.venv/Scripts/python ml/scripts/b06_bao_cao.py                                   # báo cáo B06 (được cả khi mới xong một phần)
```

Đặt `ROBOTREC_RUNS="G:/My Drive/robotica-ml/runs"` để đọc kết quả Colab ngay trên máy qua Google Drive cho máy tính.

## B7: thí nghiệm phụ, mô hình cuối

```bash
ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch vit_b16_clip --all        # A1–A6, E7 theo configs/b07_thi_nghiem_phu.yaml
ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch vit_b16_clip --exp F --seed 43   # một lần chạy (chia việc giữa nhiều máy)
ml/.venv/Scripts/python ml/scripts/b07_bao_cao.py                                          # báo cáo B07
```

Cấu hình cuối F (B6 + Mixup/CutMix) và E7 (outlier exposure) khai báo trong `configs/b07_thi_nghiem_phu.yaml`; lần chạy ghi vào
`<ROBOTREC_RUNS>/b07/<thí nghiệm>-<kiến trúc>-s<hạt giống>/`.

**Bộ điều phối** `ml/scripts/dieu_phoi.py` chia các lần chạy B6, B7 giữa máy này, Kaggle (`--kaggle-sessions N`) và Colab (`--colab`),
đồng bộ qua Google Drive (`--drive`), chạy tiếp được khi bị ngắt. Nhật ký: `<ROBOTREC_DATA>/runs/dieu-phoi.log`. Chạy trong cửa sổ riêng,
có người theo dõi.

## B8, B9, B11: đánh giá, xuất mô hình, kiểm tra khớp với web

```bash
ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source b05                       # mốc B5 → báo cáo B08a
ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source b06 --arch vit_b16_clip   # mô hình B6 (đủ hạt giống), kèm bảng E7 → báo cáo B08b
ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source cuoi --arch vit_b16_clip  # mô hình cuối F, so với B6 → báo cáo B08
ml/.venv/Scripts/python ml/scripts/b09_xuat_onnx.py --run <ROBOTREC_RUNS>/b07/F-vit_b16_clip-s44   # ONNX, nén, gói cho web
ml/.venv/Scripts/python ml/scripts/b11_kiem_tra_khop.py --run <lần chạy> --package <gói> --out <ROBOTREC_DATA>/b11/<tên>
RECOGNITION_PARITY_DIR=<ROBOTREC_DATA>/b11/<tên> npx vitest run test/recognition-parity.test.ts   # top-1 phải trùng 20/20
```

B8 chọn nhiệt độ T và ngưỡng t₁–t₃ trên val; tập test chỉ để báo số liệu. Lần đầu B8 tính logits của mỗi lần chạy rồi lưu
`logits_*.npy` cạnh checkpoint (ViT trên CPU khoảng 1,5 giờ mỗi lần chạy), các lần sau đọc lại. B9 ghi gói vào
`<ROBOTREC_DATA>/b09/<mã mô hình>/goi/`: các phần `model.partNN.onnx` 20 MB (`PART_BYTES`; lượt tải lên Storage từ 40 MB trở lên bị
ngắt), `labels.json`, `model-card.json` có T và ngưỡng của B8. Các bước nặng CPU (B8 lần đầu, B9) nên chạy khi không huấn luyện.

Đưa lên web (tải lên Storage, nhập, bật): [docs/chuan/08-tich-hop-ai.md](../docs/chuan/08-tich-hop-ai.md) mục 10.

## Báo cáo

Mỗi script ghi `reports/BXX/summary.json` và báo cáo Markdown ở `docs/nhan-dang-robot/bao-cao/`. `scripts/export_excel.py` gom số liệu
vào `ket-qua-cac-buoc.xlsx`; `scripts/export_drive.py` (không cần tham số) chép báo cáo và hình lên Google Drive. Bảng tổng hợp:
[docs/nhan-dang-robot/README.md](../docs/nhan-dang-robot/README.md).

## Quy ước

- Mỗi bước kết thúc bằng báo cáo 8 mục (`robotrec.report.Report`), gồm số liệu dạng trung bình ± độ lệch chuẩn và khoảng tin cậy 95% (`robotrec.stats`).
- Hạt giống mặc định 42; huấn luyện chạy lại với 42, 43, 44.
- `requirements.lock.txt` ghi phiên bản thư viện đã dùng (B00 sinh lại mỗi lần chạy).
