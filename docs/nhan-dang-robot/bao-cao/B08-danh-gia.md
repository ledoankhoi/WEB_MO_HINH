# B08. Đánh giá toàn diện mô hình cuối (Thêm Mixup (α = 0,2) và CutMix (α = 1,0))

Báo cáo sinh tự động bởi `ml/` (mẫu ở `docs/nhan-dang-robot/00-ke-hoach.md` mục 6). Thời gian chạy: 102.4 giây. Số liệu máy đọc: `ml/reports/B08/summary.json`.

## 1. Mục tiêu

Đo đủ các mặt của một mô hình nhận dạng theo kế hoạch B8: độ chính xác trên ảnh của lớp đã biết (tổng thể, từng lớp, theo cấp nhân vật và franchise, theo miền ảnh), độ tin mô hình báo ra có khớp thực tế không (hiệu chỉnh), khả năng nhận ra **robot lạ** (lớp không biết) và **ảnh không phải robot** (tập âm), và luật trả lời theo cấp sẽ dùng trên web. Trả lời RQ2 và RQ5.

Mô hình cuối là cấu hình chính của B6 cộng thêm cải tiến có ý nghĩa thống kê của B7 (Mixup α = 0,2 và CutMix α = 1,0, thí nghiệm A4), huấn luyện lại trên 3 hạt giống. Hạt giống 42 dùng chính lần chạy A4 của B7 (cùng cấu hình, cùng hạt giống). Bảng 14 so với mô hình B6 cùng hạt giống trên test.

**Số liệu tạm**: dữ liệu là bản tạm `dff6fdbb77c0` của B4 (chưa có nhãn tay của B3).

## 2. Đầu vào, đầu ra

**Bảng 1. Các tập dùng trong đánh giá**

| Nhóm ảnh | val (chọn ngưỡng, nhiệt độ) | test (báo số liệu) | Ghi chú |
| --- | --- | --- | --- |
| Đã biết (195 lớp) | 6325 | 6310 | Ảnh của lớp mô hình đã học |
| Lớp không biết (robot lạ) | 3794 | 3413 | 35 robot bị giấu khỏi lúc huấn luyện (B4) |
| Tập âm (không phải robot) | 723 | 724 | COCO val2017 và ảnh đồ chơi, mô hình, xe (B4b) |

Mô hình: Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42), Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 43), Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 44).

## 3. Công cụ và môi trường

**Môi trường**

| Mục | Giá trị |
| --- | --- |
| Thời điểm chạy (UTC) | 2026-11-15T09:58:36+00:00 |
| Hệ điều hành | Windows 11 (build 10.0.26300, AMD64) |
| Python | 3.11.9 |
| CPU | 12th Gen Intel(R) Core(TM) i7-12800H (20 luồng) |
| RAM | 31.7 GB |
| GPU (PyTorch) | NVIDIA RTX A2000 Laptop GPU (4.0 GB) |
| CUDA của PyTorch | 12.8 |
| Driver (nvidia-smi) | NVIDIA RTX A2000 Laptop GPU, 4096 MiB, 596.52 |
| Google Colab | không |
| Kaggle | không |
| Commit git | 729c6ae (có thay đổi chưa commit) |

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

## 4. Phương pháp

- **Tập đóng** (ảnh test của lớp đã biết): top-1, top-5, macro-F1 kèm khoảng tin cậy bootstrap 95% (1.000 lần lấy mẫu lại ảnh test); balanced accuracy (trung bình recall các lớp); precision, recall, F1 trung bình đều (macro) và trung bình theo số ảnh (weighted).
- **Theo cấp**: xác suất của một nhân vật = tổng xác suất các lớp cùng nhân vật (ví dụ Optimus Prime G1 + phim + ...), của một franchise = tổng các lớp của franchise; độ chính xác cấp nhân vật (franchise) = tỉ lệ ảnh có nhân vật (franchise) xác suất cao nhất là đúng. **Mức nghiêm trọng của lỗi**: trong các ảnh đoán sai lớp, sai đúng nhân vật nhưng khác dòng / sai nhân vật cùng franchise / sai franchise.
- **Theo miền ảnh và nguồn**: top-1 trên từng nhóm kèm khoảng Wilson 95%. Miền ảnh do CLIP gán ở B3, chưa kiểm định.
- **Hiệu chỉnh độ tin** (temperature scaling): p = softmax(z / T), chọn T > 0 làm nhỏ nhất NLL trên **val**; báo ECE (15 khoảng độ tin chia đều), MCE, NLL, Brier trên test trước và sau hiệu chỉnh. ECE = Σ_b (|B_b| / N) · |độ chính xác của B_b − độ tin trung bình của B_b|.
- **Tập mở**: ba điểm "đã biết": MSP = max softmax, max-logit, −năng lượng = log Σ exp(z) (T = 1), thêm MSP sau hiệu chỉnh. Tách ảnh test đã biết với lạ-test (robot lạ) và với âm-test (không phải robot; tách thêm COCO và đồ chơi): AUROC, AUPR-In, AUPR-Out, FPR@95%TPR (tỉ lệ ảnh lạ bị nhận khi ngưỡng giữ 95% ảnh đã biết), diện tích dưới đường OSCR (tỉ lệ vừa được nhận vừa đúng lớp, theo tỉ lệ ảnh lạ bị nhận). Khoảng tin cậy của AUROC và FPR@95 bằng bootstrap 1.000 lần, lấy mẫu lại riêng ảnh đã biết và ảnh lạ.
- **Luật trả lời theo cấp** (xác suất sau hiệu chỉnh): p(lớp) ≥ t₁ → trả lời lớp; ngược lại p(nhân vật) ≥ t₂ → nhân vật; ngược lại p(franchise) ≥ t₃ → franchise; còn lại → "không nhận ra". Với ảnh đã biết, **lợi ích** = số cấp nói đúng / 3 (đúng lớp 1; đúng nhân vật 2/3; đúng franchise 1/3; sai hoặc từ chối 0). Với robot lạ, trả lời một lớp luôn là nhận nhầm; trả lời đúng nhân vật (khi nhân vật có trong danh mục, ví dụ Optimus Prime của dòng bị giấu) hoặc đúng franchise, hoặc từ chối, là đúng. Với ảnh không phải robot chỉ từ chối là đúng.
- **Chọn ngưỡng trên val**: vét lưới t₁, t₂, t₃ ∈ {0; 0,02; …; 1} ∪ {1,01 = không bao giờ}, lấy bộ có lợi ích trung bình trên ảnh val đã biết lớn nhất với ràng buộc tỉ lệ nhận nhầm trên lạ-val ≤ α **và** trên âm-val ≤ α. Kế hoạch dùng α = 5%; báo thêm α = 1%, 2%, 10%, 20% để thấy đánh đổi. Kết quả trên test kèm khoảng Wilson 95%.
- **Khác kế hoạch**: (1) kế hoạch không định nghĩa "trả lời đúng nhiều nhất" khi các cấp có giá trị khác nhau; ở đây dùng lợi ích theo số cấp nói đúng để luật không chọn trả lời ở cấp franchise cho mọi ảnh. (2) Chưa đánh giá riêng ảnh dạng biến hình (`mode = alt`) vì bộ dữ liệu chưa có nhãn dạng.

### Giải thích bằng lời thường

- **Hiệu chỉnh độ tin**: nếu mô hình nói "chắc 90%" thì trong 100 lần nói vậy phải đúng khoảng 90 lần. ECE đo độ lệch trung bình giữa "nói chắc bao nhiêu" và "đúng bao nhiêu"; ECE nhỏ là độ tin đáng tin. Temperature scaling chỉ "vặn" độ tin cao lên hay thấp xuống bằng một con số T, không đổi câu trả lời.
- **AUROC**: lấy ngẫu nhiên một ảnh đã biết và một ảnh lạ, AUROC là xác suất ảnh đã biết được chấm điểm "quen" cao hơn. 0,5 là đoán mò, 1 là tách hoàn hảo.
- **FPR@95%TPR**: đặt ngưỡng sao cho 95% ảnh đã biết được nhận, rồi đếm bao nhiêu phần trăm ảnh lạ cũng lọt qua. Càng thấp càng tốt.
- **Luật theo cấp**: khi không chắc robot nào, web vẫn có thể nói "đây có vẻ là Optimus Prime" hoặc "đây có vẻ là robot Gundam" thay vì đoán bừa; khi chẳng chắc gì thì nói "không nhận ra". Ngưỡng được chọn sao cho ảnh lạ hiếm khi bị nhận nhầm.

## 5. Kết quả

**Bảng 2. Tập đóng: ảnh test của 195 lớp đã biết**

| Chỉ số trên test | Giá trị (TB ± ĐLC qua hạt giống) | Khoảng tin cậy 95% (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)) |
| --- | --- | --- |
| top-1 (%) | 79,74 ± 0,22 | 79,56 [78,57; 80,49] |
| top-5 (%) | 90,35 ± 0,13 | 90,46 [89,73; 91,17] |
| macro-F1 (%) | 77,93 ± 0,19 | 77,73 [76,34; 78,50] |
| balanced accuracy (%) | 77,92 ± 0,14 | — |
| precision, macro (%) | 78,81 ± 0,19 | — |
| recall, macro (%) | 77,92 ± 0,14 | — |
| precision, weighted (%) | 80,22 ± 0,20 | — |
| recall, weighted (%) | 79,74 ± 0,22 | — |
| F1, weighted (%) | 79,60 ± 0,24 | — |

**Bảng 3. Độ chính xác theo cấp (xác suất cộng theo cây nhãn)**

| Cấp | top-1 trên test (%) |
| --- | --- |
| Lớp (nhân vật + dòng) | 79,74 ± 0,22 |
| Nhân vật | 81,61 ± 0,22 |
| Franchise | 97,72 ± 0,06 |

**Bảng 4. Mức nghiêm trọng của lỗi (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))**

| Loại lỗi | Số ảnh | Tỉ lệ trong các lỗi |
| --- | --- | --- |
| Đúng nhân vật, sai dòng (ví dụ Optimus Prime G1 thành Optimus Prime phim) | 112 | 8,7% |
| Sai nhân vật, cùng franchise | 1010 | 78,3% |
| Sai franchise | 168 | 13,0% |
| Tổng số ảnh đoán sai lớp | 1290 | 100% |

**Bảng 5. top-1 theo nhóm ảnh (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))**

| Nhóm | Giá trị | Ảnh test | top-1 % [Wilson 95%] |
| --- | --- | --- | --- |
| Franchise | Transformers | 2526 | 78,2 [76,6; 79,8] |
| Franchise | Gundam | 2432 | 84,8 [83,3; 86,2] |
| Franchise | Super Sentai / Power Rangers | 1352 | 72,6 [70,2; 74,9] |
| Nguồn | Wiki người hâm mộ | 1065 | 80,4 [77,9; 82,6] |
| Nguồn | Tìm ảnh (ddgs) | 5245 | 79,4 [78,3; 80,5] |
| Miền ảnh (CLIP gán) | hộp sản phẩm | 802 | 74,7 [71,6; 77,6] |
| Miền ảnh (CLIP gán) | tranh vẽ | 51 | 52,9 [39,5; 65,9] |
| Miền ảnh (CLIP gán) | ảnh CGI / phim | 625 | 74,4 [70,8; 77,7] |
| Miền ảnh (CLIP gán) | ảnh chụp màn hình hoạt hình / anime | 844 | 73,1 [70,0; 76,0] |
| Miền ảnh (CLIP gán) | ảnh chụp đồ chơi / mô hình | 3988 | 83,0 [81,9; 84,2] |

**Bảng 6. 20 lớp kém nhất theo F1 (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))**

| Lớp | Franchise | Ảnh test | Precision (%) | Recall (%) | F1 (%) |
| --- | --- | --- | --- | --- | --- |
| Optimus Prime (WFC) | Transformers | 17 | 50,0 | 41,2 | 45,2 |
| X Emperor Slash | Super Sentai / Power Rangers | 34 | 59,1 | 38,2 | 46,4 |
| Megatron (Movie) | Transformers | 22 | 50,0 | 45,5 | 47,6 |
| Thunder Ultrazord | Super Sentai / Power Rangers | 29 | 57,1 | 41,4 | 48,0 |
| DualDrive Megazord | Super Sentai / Power Rangers | 17 | 53,3 | 47,1 | 50,0 |
| Megatron (One) | Transformers | 22 | 48,1 | 59,1 | 53,1 |
| Arcee (G1) | Transformers | 34 | 61,5 | 47,1 | 53,3 |
| EB-06 Graze | Gundam | 24 | 54,2 | 54,2 | 54,2 |
| Bumblebee (One) | Transformers | 24 | 56,5 | 54,2 | 55,3 |
| Battleship CrocoDaiOh | Super Sentai / Power Rangers | 25 | 59,1 | 52,0 | 55,3 |
| GN-000 0 Gundam | Gundam | 29 | 60,0 | 51,7 | 55,6 |
| S.W.A.T. Megazord | Super Sentai / Power Rangers | 30 | 54,5 | 60,0 | 57,1 |
| Bonecrusher (G1) | Transformers | 19 | 75,0 | 47,4 | 58,1 |
| GN-0000 00 Gundam | Gundam | 26 | 55,2 | 61,5 | 58,2 |
| Flash Point Megazord | Super Sentai / Power Rangers | 27 | 70,0 | 51,9 | 59,6 |
| Shockwave (Movie) | Transformers | 23 | 70,6 | 52,2 | 60,0 |
| Rescue Megazord | Super Sentai / Power Rangers | 23 | 57,7 | 65,2 | 61,2 |
| Hook (G1) | Transformers | 20 | 63,2 | 60,0 | 61,5 |
| Megatron (WFC) | Transformers | 28 | 63,0 | 60,7 | 61,8 |
| Goggle Robo | Super Sentai / Power Rangers | 37 | 60,0 | 64,9 | 62,3 |

**Bảng 7. 20 cặp nhầm nhiều nhất (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))**

| Lớp thật | Bị đoán thành | Số ảnh | Tỉ lệ trong ảnh của lớp thật | Quan hệ |
| --- | --- | --- | --- | --- |
| Thunder Ultrazord | Thunder Megazord (Power Rangers Mighty Morphin 2) | 10 | 34,5% | cùng franchise |
| GN-000 0 Gundam | GN-0000 00 Gundam | 8 | 27,6% | cùng franchise |
| Shockwave (Movie) | Shockwave (G1) | 7 | 30,4% | cùng nhân vật |
| Galaxy Megazord | Astro Megazord | 7 | 20,0% | cùng franchise |
| S.W.A.T. Megazord | Delta Squad Megazord | 7 | 23,3% | cùng franchise |
| Cosmic Dragon Megazord | Kyutama Gattai 01*03*05*07*09 KyurenOh | 6 | 17,1% | cùng franchise |
| Bruticus (G1) | Onslaught (G1) | 5 | 19,2% | cùng franchise |
| Soundwave (WFC) | Optimus Prime (G1) | 5 | 15,6% | cùng franchise |
| Optimus Prime (WFC) | Optimus Prime (Movie) | 5 | 29,4% | cùng nhân vật |
| Bumblebee (One) | Bumblebee (Movie) | 5 | 20,8% | cùng nhân vật |
| MSN-00100 Hyaku Shiki | AMS-119 Geara Doga | 5 | 4,9% | cùng franchise |
| Turbo Megazord | Rescue Megazord | 5 | 16,1% | cùng franchise |
| Rescue Megazord | Lightspeed Megazord | 5 | 21,7% | cùng franchise |
| Battleship CrocoDaiOh | BattleFleet Battleship | 5 | 20,0% | cùng franchise |
| Arcee (G1) | Cliffjumper (G1) | 4 | 11,8% | cùng franchise |
| Bonecrusher (G1) | Bonecrusher (Movie) | 4 | 21,1% | cùng nhân vật |
| Jazz (G1) | Jazz (Movie) | 4 | 15,4% | cùng nhân vật |
| Megatron (G1) | Megatron (One) | 4 | 13,3% | cùng nhân vật |
| Scavenger (G1) | Hook (G1) | 4 | 17,4% | cùng franchise |
| Bumblebee (Movie) | Bumblebee (One) | 4 | 10,3% | cùng nhân vật |

![Ma trận nhầm lẫn chuẩn hoá theo hàng, bỏ đường chéo (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)); đường kẻ chia ba franchise](../../../ml/reports/B08/ma-tran-nham.png)

*Hình: Ma trận nhầm lẫn chuẩn hoá theo hàng, bỏ đường chéo (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)); đường kẻ chia ba franchise*

**Bảng 8. Hiệu chỉnh độ tin (càng nhỏ càng tốt)**

| Chỉ số trên test | Trước hiệu chỉnh (T = 1) | Sau hiệu chỉnh |
| --- | --- | --- |
| ECE | 0,1478 ± 0,0068 | 0,0146 ± 0,0034 |
| MCE | 0,2869 ± 0,0147 | 0,0984 ± 0,0358 |
| NLL | 1,0910 ± 0,0112 | 0,9854 ± 0,0028 |
| Brier | 0,3132 ± 0,0044 | 0,2828 ± 0,0019 |
| Nhiệt độ T (chọn trên val) | 1 | 0,770 ± 0,006 |

![Biểu đồ độ tin cậy trên test (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)): cột thấp hơn đường chéo là mô hình tự tin quá mức](../../../ml/reports/B08/do-tin-cay.png)

*Hình: Biểu đồ độ tin cậy trên test (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)): cột thấp hơn đường chéo là mô hình tự tin quá mức*

**Bảng 9. Tách ảnh đã biết (test) với ảnh lạ**

| Ảnh lạ | Điểm | AUROC | AUPR-In | AUPR-Out | FPR@95%TPR (%) | Diện tích OSCR |
| --- | --- | --- | --- | --- | --- | --- |
| Robot lạ (lạ-test) | MSP | 0,822 ± 0,003 | 0,896 ± 0,002 | 0,647 ± 0,008 | 79,4 ± 1,0 | 0,718 ± 0,003 |
| Robot lạ (lạ-test) | max-logit | 0,810 ± 0,003 | 0,877 ± 0,002 | 0,656 ± 0,012 | 75,9 ± 2,5 | 0,701 ± 0,003 |
| Robot lạ (lạ-test) | −năng lượng | 0,782 ± 0,004 | 0,857 ± 0,002 | 0,638 ± 0,017 | 74,6 ± 3,1 | 0,664 ± 0,005 |
| Robot lạ (lạ-test) | MSP sau hiệu chỉnh | 0,821 ± 0,003 | 0,898 ± 0,001 | 0,642 ± 0,007 | 79,7 ± 1,0 | 0,719 ± 0,003 |
| Không phải robot (âm-test) | MSP | 0,932 ± 0,002 | 0,992 ± 0,000 | 0,603 ± 0,006 | 43,9 ± 1,0 | 0,778 ± 0,002 |
| Không phải robot (âm-test) | max-logit | 0,938 ± 0,001 | 0,992 ± 0,000 | 0,632 ± 0,015 | 40,7 ± 0,6 | 0,778 ± 0,001 |
| Không phải robot (âm-test) | −năng lượng | 0,920 ± 0,005 | 0,990 ± 0,001 | 0,520 ± 0,025 | 49,2 ± 2,8 | 0,759 ± 0,001 |
| Không phải robot (âm-test) | MSP sau hiệu chỉnh | 0,925 ± 0,002 | 0,991 ± 0,000 | 0,575 ± 0,007 | 47,0 ± 1,2 | 0,776 ± 0,002 |
|    trong đó COCO | MSP | 0,950 ± 0,003 | 0,996 ± 0,000 | 0,611 ± 0,004 | 32,9 ± 1,5 | 0,785 ± 0,003 |
|    trong đó COCO | max-logit | 0,955 ± 0,001 | 0,996 ± 0,000 | 0,642 ± 0,016 | 29,8 ± 1,6 | 0,785 ± 0,002 |
|    trong đó COCO | −năng lượng | 0,936 ± 0,004 | 0,995 ± 0,000 | 0,484 ± 0,038 | 42,5 ± 3,7 | 0,768 ± 0,001 |
|    trong đó COCO | MSP sau hiệu chỉnh | 0,943 ± 0,003 | 0,995 ± 0,000 | 0,576 ± 0,004 | 36,9 ± 1,1 | 0,783 ± 0,003 |
|    trong đó đồ chơi, xe | MSP | 0,891 ± 0,003 | 0,996 ± 0,000 | 0,180 ± 0,017 | 68,3 ± 0,0 | 0,764 ± 0,000 |
|    trong đó đồ chơi, xe | max-logit | 0,898 ± 0,005 | 0,996 ± 0,000 | 0,199 ± 0,017 | 64,9 ± 1,8 | 0,762 ± 0,002 |
|    trong đó đồ chơi, xe | −năng lượng | 0,885 ± 0,007 | 0,995 ± 0,000 | 0,180 ± 0,011 | 64,0 ± 2,5 | 0,739 ± 0,003 |
|    trong đó đồ chơi, xe | MSP sau hiệu chỉnh | 0,885 ± 0,004 | 0,996 ± 0,000 | 0,170 ± 0,017 | 69,5 ± 1,4 | 0,762 ± 0,001 |

![Trái: phân bố độ tin của ba nhóm ảnh. Giữa, phải: đường OSCR (trục ngang thang log gần 0; trong ngoặc là diện tích) (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))](../../../ml/reports/B08/tap-mo.png)

*Hình: Trái: phân bố độ tin của ba nhóm ảnh. Giữa, phải: đường OSCR (trục ngang thang log gần 0; trong ngoặc là diện tích) (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))*

**Bảng 10. Luật trả lời theo cấp: ngưỡng chọn trên val, kết quả trên test [Wilson 95%] (Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42))**

| α (trần nhận nhầm trên val) | t₁; t₂; t₃ | Lợi ích trên val (%) | Đã biết: đúng lớp % | đúng nhân vật % | đúng franchise % | trả lời sai % | từ chối oan % | Robot lạ: nhận nhầm % | Không phải robot: nhận nhầm % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1% | 1,00; 1,00; 0,96 | 21,8 | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 63,7 [62,5; 64,9] | 0,0 [0,0; 0,1] | 36,3 [35,1; 37,5] | 0,1 [0,0; 0,3] | 0,7 [0,3; 1,6] |
| 2% | 1,00; 1,00; 0,92 | 26,0 | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 76,9 [75,9; 77,9] | 0,0 [0,0; 0,1] | 23,0 [22,0; 24,1] | 0,1 [0,0; 0,3] | 2,1 [1,3; 3,4] |
| 5% | 0,96; 0,96; 0,88 | 55,1 | 39,5 [38,3; 40,7] | 1,5 [1,2; 1,8] | 40,7 [39,5; 41,9] | 1,0 [0,8; 1,3] | 17,3 [16,4; 18,2] | 3,8 [3,2; 4,5] | 3,5 [2,3; 5,0] |
| 10% | 0,92; 0,92; 0,80 | 65,4 | 52,0 [50,8; 53,3] | 1,5 [1,2; 1,9] | 33,7 [32,5; 34,9] | 1,9 [1,6; 2,3] | 10,9 [10,1; 11,6] | 7,6 [6,7; 8,5] | 8,0 [6,2; 10,2] |
| 20% | 0,78; 0,78; 0,70 | 74,4 | 65,5 [64,3; 66,7] | 1,6 [1,3; 2,0] | 22,7 [21,7; 23,7] | 3,8 [3,4; 4,3] | 6,4 [5,8; 7,0] | 17,9 [16,7; 19,3] | 17,3 [14,7; 20,2] |

**Bảng 11. Robot lạ dưới luật α = 5%: hệ thống có nói được "đây là Optimus Prime" khi gặp một dòng Optimus chưa học không?**

| Nhóm robot lạ (test) | Số ảnh | Trả lời đúng nhân vật % | Trả lời franchise % | Từ chối % | Nhận nhầm % |
| --- | --- | --- | --- | --- | --- |
| Robot lạ có nhân vật trong danh mục (ví dụ Optimus Prime dòng bị giấu) | 986 | 2,3 [1,6; 3,5] | 64,3 [61,3; 67,2] | 27,4 [24,7; 30,3] | 6,0 [4,7; 7,6] |
| Robot lạ có nhân vật không có trong danh mục | 2427 | — | 30,6 [28,8; 32,4] | 66,5 [64,6; 68,4] | 2,9 [2,3; 3,6] |

![Đánh đổi của luật trả lời theo cấp: nới trần nhận nhầm thì trả lời được nhiều hơn nhưng nhận nhầm ảnh lạ nhiều hơn](../../../ml/reports/B08/danh-doi.png)

*Hình: Đánh đổi của luật trả lời theo cấp: nới trần nhận nhầm thì trả lời được nhiều hơn nhưng nhận nhầm ảnh lạ nhiều hơn*

**Bảng 12. Mô hình tinh chỉnh so với mốc B5 (RQ2)**

| So sánh trên test | Hiệu top-1, điểm % [KTC 95%] | A đúng, B sai | A sai, B đúng | p (McNemar) | p sau Holm |
| --- | --- | --- | --- | --- | --- |
| Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42) so với linear probe B5 | 13,9 [12,8; 14,9] | 1063 | 185 | < 0,001 | < 0,001 |
| Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 43) so với linear probe B5 | 14,0 [12,9; 15,1] | 1067 | 182 | < 0,001 | < 0,001 |
| Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 44) so với linear probe B5 | 14,3 [13,3; 15,4] | 1081 | 176 | < 0,001 | < 0,001 |

### Giải thích mô hình và phân tích lỗi

![Grad-CAM, ảnh đoán đúng (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42)](../../../ml/reports/B08/gradcam-dung.png)

*Hình: Grad-CAM, ảnh đoán đúng (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42)*

![Grad-CAM, ảnh đoán sai (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42)](../../../ml/reports/B08/gradcam-sai.png)

*Hình: Grad-CAM, ảnh đoán sai (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42)*

![UMAP của đặc trưng tầng áp chót trên 6325 ảnh val (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42); mỗi chấm một ảnh](../../../ml/reports/B08/umap.png)

*Hình: UMAP của đặc trưng tầng áp chót trên 6325 ảnh val (Thêm Mixup (α = 0,2) và CutMix (α = 1,0), hạt giống 42); mỗi chấm một ảnh*

Trang để chủ dự án phân loại nguyên nhân của 100 ảnh đoán sai (nhãn sai, hai robot giống nhau, ảnh khó, sai dòng, kiểu ảnh lạ): `C:\Users\THINKPAD\WEB_MO_HINH\ml\data\store\b08\phan-tich-loi.html`. Tỉ lệ từng nguyên nhân sẽ được thêm vào báo cáo khi có kết quả.

**Bảng 14. Mô hình cuối so với mô hình chính của B6 cùng hạt giống, trên test**

| Cặp so sánh | top-1 test B6 (%) | top-1 test mô hình cuối (%) | Hiệu, điểm % [KTC 95%] | Cuối đúng, B6 sai | Cuối sai, B6 đúng | p (McNemar) | p sau Holm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hạt giống 42 | 77,4 | 79,6 | 2,2 [1,6; 2,9] | 295 | 157 | < 0,001 | < 0,001 |
| Hạt giống 43 | 78,8 | 79,7 | 0,8 [0,3; 1,4] | 206 | 153 | 0,006 | 0,006 |
| Hạt giống 44 | 78,7 | 80,0 | 1,3 [0,7; 1,9] | 238 | 156 | < 0,001 | < 0,001 |

Outlier exposure (E7) dùng đúng công thức của B6 nên được so với mô hình B6 cùng hạt giống, ở báo cáo B08b (bảng 13).

## 6. Phân tích

Các số dưới đây là của **Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42)** (mô hình đầu, có khoảng tin cậy); trung bình ± độ lệch chuẩn qua 3 hạt giống ở các bảng trên.

- Tập đóng: top-1 79,6 [78,6; 80,5]%, top-5 90,5 [89,7; 91,2]%. Ở cấp nhân vật đúng 81,4%, cấp franchise 97,7%. Trong 1290 ảnh đoán sai lớp, 8,7% là đúng nhân vật sai dòng và 13,0% là sai cả franchise: phần lớn lỗi là nhầm giữa các robot gần nhau.
- Hiệu chỉnh: T = 0,76 (mô hình thiếu tự tin, cần nâng độ tin). ECE trên test từ 0,156 xuống 0,014, NLL từ 1,103 xuống 0,987. Mục tiêu tham khảo của kế hoạch là ECE sau hiệu chỉnh ≤ 0,05: đạt.
- Robot lạ: điểm tốt nhất là MSP, AUROC 0,820, FPR@95 80,3%. Mục tiêu tham khảo AUROC ≥ 0,85: chưa đạt. Robot lạ là phần khó nhất vì chúng giống robot đã biết.
- Không phải robot: max-logit đạt AUROC 0,939 (COCO 0,956, đồ chơi và xe 0,902). Ảnh đời thường dễ tách hơn hẳn ảnh đồ chơi chụp kiểu sản phẩm.
- Luật trả lời theo cấp với α = 5% (ngưỡng 0,96, 0,96, 0,88): trên test trả lời đúng lớp 39,5% ảnh đã biết, đúng ở một cấp nào đó 81,7%, trả lời sai 1,0%, từ chối oan 17,3%; nhận nhầm 3,8% robot lạ và 3,5% ảnh không phải robot. Tỉ lệ nhận nhầm trên test có thể vượt 5% một chút vì ngưỡng chọn trên val.
- So với mốc B5 (bảng 12): Thêm Mixup (α = 0,2) và CutMix (α = 1,0) (hạt giống 42): 13,9 [12,8; 14,9] điểm, p sau Holm < 0,001; Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 43): 14,0 [12,9; 15,1] điểm, p sau Holm < 0,001; Cấu hình cuối: cấu hình chính của B6 + Mixup/CutMix (A4) (hạt giống 44): 14,3 [13,3; 15,4] điểm, p sau Holm < 0,001.

## 7. Hạn chế và rủi ro

- Số liệu trên bản dữ liệu tạm; nhãn sai còn sót trong test làm các chỉ số thấp hơn thật một chút (ảnh đúng mà nhãn sai bị tính là lỗi).
- Lớp không biết và tập âm cùng nguồn web với dữ liệu huấn luyện; robot lạ hay ảnh khách gửi ngoài đời có thể khác (thử nghiệm thực địa ở B13).
- Nhóm đồ chơi của tập âm chưa duyệt tay từng ảnh nên có thể lẫn vài ảnh robot, làm tỉ lệ nhận nhầm trên nhóm này cao hơn thật.
- Ngưỡng chọn trên một lưới bước 0,02 và trên cỡ mẫu val hữu hạn; tỉ lệ nhận nhầm trên test dao động quanh α.
- Chưa đánh giá ảnh dạng biến hình (xe, thú) riêng vì chưa có nhãn dạng.
- Miền ảnh do CLIP gán, chưa kiểm định; bảng theo miền chỉ để tham khảo.

## 8. Tái lập

| Mục | Giá trị |
| --- | --- |
| Hạt giống | 0 |
| Phiên bản dữ liệu | b04_splits.csv sha256 dff6fdbb77c0 |

```bash
ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source cuoi --arch vit_b16_clip
```
