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

## Quy ước

- Mỗi bước kết thúc bằng báo cáo 8 mục (`robotrec.report.Report`), gồm số liệu dạng trung bình ± độ lệch chuẩn và khoảng tin cậy 95% (`robotrec.stats`).
- Hạt giống mặc định 42; huấn luyện chạy lại với 42, 43, 44.
- `requirements.lock.txt` ghi phiên bản thư viện đã dùng (B00 sinh lại mỗi lần chạy).
