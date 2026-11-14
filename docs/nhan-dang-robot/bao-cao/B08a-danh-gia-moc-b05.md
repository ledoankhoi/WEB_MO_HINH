# B08a. Đánh giá toàn diện mốc B5 (linear probe trên đặc trưng CLIP ViT-L/14)

Báo cáo sinh tự động bởi `ml/` (mẫu ở `docs/nhan-dang-robot/00-ke-hoach.md` mục 6). Thời gian chạy: 2.2 giây. Số liệu máy đọc: `ml/reports/B08a/summary.json`.

## 1. Mục tiêu

Đo đủ các mặt của một mô hình nhận dạng theo kế hoạch B8: độ chính xác trên ảnh của lớp đã biết (tổng thể, từng lớp, theo cấp nhân vật và franchise, theo miền ảnh), độ tin mô hình báo ra có khớp thực tế không (hiệu chỉnh), khả năng nhận ra **robot lạ** (lớp không biết) và **ảnh không phải robot** (tập âm), và luật trả lời theo cấp sẽ dùng trên web. Trả lời RQ2 và RQ5.

Báo cáo này chạy trên **mốc của B5** (hồi quy logistic trên đặc trưng CLIP ViT-L/14 đóng băng), để (1) kiểm chứng toàn bộ phép đánh giá trước khi có mô hình tinh chỉnh và (2) có số liệu tập mở của mốc để so sánh ở B8. Mốc không được chọn hay chỉnh theo tập test nên dùng test ở đây không làm sai nguyên tắc "test chỉ dùng một lần" cho mô hình chính.

**Số liệu tạm**: dữ liệu là bản tạm `dff6fdbb77c0` của B4 (chưa có nhãn tay của B3).

## 2. Đầu vào, đầu ra

**Bảng 1. Các tập dùng trong đánh giá**

| Nhóm ảnh | val (chọn ngưỡng, nhiệt độ) | test (báo số liệu) | Ghi chú |
| --- | --- | --- | --- |
| Đã biết (195 lớp) | 6325 | 6310 | Ảnh của lớp mô hình đã học |
| Lớp không biết (robot lạ) | 3794 | 3413 | 35 robot bị giấu khỏi lúc huấn luyện (B4) |
| Tập âm (không phải robot) | 723 | 724 | COCO val2017 và ảnh đồ chơi, mô hình, xe (B4b) |

Mô hình: Linear probe CLIP ViT-L/14 (B5).

## 3. Công cụ và môi trường

**Môi trường**

| Mục | Giá trị |
| --- | --- |
| Thời điểm chạy (UTC) | 2026-11-12T05:05:45+00:00 |
| Hệ điều hành | Windows 11 (build 10.0.26300, AMD64) |
| Python | 3.11.9 |
| CPU | 12th Gen Intel(R) Core(TM) i7-12800H (20 luồng) |
| RAM | 31.7 GB |
| GPU (PyTorch) | NVIDIA RTX A2000 Laptop GPU (4.0 GB) |
| CUDA của PyTorch | 12.8 |
| Driver (nvidia-smi) | NVIDIA RTX A2000 Laptop GPU, 4096 MiB, 596.52 |
| Google Colab | không |
| Commit git | e0d7aa7 (có thay đổi chưa commit) |

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

| Chỉ số trên test | Giá trị | Khoảng tin cậy 95% (Linear probe CLIP ViT-L/14 (B5)) |
| --- | --- | --- |
| top-1 (%) | 65,64 | 65,64 [64,44; 66,81] |
| top-5 (%) | 84,58 | 84,58 [83,77; 85,44] |
| macro-F1 (%) | 63,50 | 63,50 [61,84; 64,28] |
| balanced accuracy (%) | 63,43 | — |
| precision, macro (%) | 65,23 | — |
| recall, macro (%) | 63,43 | — |
| precision, weighted (%) | 66,29 | — |
| recall, weighted (%) | 65,64 | — |
| F1, weighted (%) | 65,24 | — |

**Bảng 3. Độ chính xác theo cấp (xác suất cộng theo cây nhãn)**

| Cấp | top-1 trên test (%) |
| --- | --- |
| Lớp (nhân vật + dòng) | 65,64 |
| Nhân vật | 67,64 |
| Franchise | 96,51 |

**Bảng 4. Mức nghiêm trọng của lỗi (Linear probe CLIP ViT-L/14 (B5))**

| Loại lỗi | Số ảnh | Tỉ lệ trong các lỗi |
| --- | --- | --- |
| Đúng nhân vật, sai dòng (ví dụ Optimus Prime G1 thành Optimus Prime phim) | 115 | 5,3% |
| Sai nhân vật, cùng franchise | 1794 | 82,7% |
| Sai franchise | 259 | 11,9% |
| Tổng số ảnh đoán sai lớp | 2168 | 100% |

**Bảng 5. top-1 theo nhóm ảnh (Linear probe CLIP ViT-L/14 (B5))**

| Nhóm | Giá trị | Ảnh test | top-1 % [Wilson 95%] |
| --- | --- | --- | --- |
| Franchise | Transformers | 2526 | 66,0 [64,2; 67,9] |
| Franchise | Gundam | 2432 | 69,3 [67,4; 71,1] |
| Franchise | Super Sentai / Power Rangers | 1352 | 58,4 [55,7; 61,0] |
| Nguồn | Wiki người hâm mộ | 1065 | 60,8 [57,9; 63,7] |
| Nguồn | Tìm ảnh (ddgs) | 5245 | 66,6 [65,3; 67,9] |
| Miền ảnh (CLIP gán) | hộp sản phẩm | 802 | 60,1 [56,7; 63,4] |
| Miền ảnh (CLIP gán) | tranh vẽ | 51 | 37,3 [25,3; 51,0] |
| Miền ảnh (CLIP gán) | ảnh CGI / phim | 625 | 62,7 [58,9; 66,4] |
| Miền ảnh (CLIP gán) | ảnh chụp màn hình hoạt hình / anime | 844 | 55,0 [51,6; 58,3] |
| Miền ảnh (CLIP gán) | ảnh chụp đồ chơi / mô hình | 3988 | 69,8 [68,4; 71,2] |

**Bảng 6. 20 lớp kém nhất theo F1 (Linear probe CLIP ViT-L/14 (B5))**

| Lớp | Franchise | Ảnh test | Precision (%) | Recall (%) | F1 (%) |
| --- | --- | --- | --- | --- | --- |
| Optimus Prime (WFC) | Transformers | 17 | 14,3 | 5,9 | 8,3 |
| GN-0000 00 Gundam | Gundam | 26 | 24,0 | 23,1 | 23,5 |
| GN-000 0 Gundam | Gundam | 29 | 31,8 | 24,1 | 27,5 |
| X Emperor Slash | Super Sentai / Power Rangers | 34 | 38,1 | 23,5 | 29,1 |
| Bonecrusher (G1) | Transformers | 19 | 33,3 | 26,3 | 29,4 |
| Long Haul (G1) | Transformers | 16 | 29,4 | 31,2 | 30,3 |
| DualDrive Megazord | Super Sentai / Power Rangers | 17 | 44,4 | 23,5 | 30,8 |
| Thunder Ultrazord | Super Sentai / Power Rangers | 29 | 37,5 | 31,0 | 34,0 |
| Megatron (WFC) | Transformers | 28 | 38,5 | 35,7 | 37,0 |
| WF-02MD Virgo II | Gundam | 20 | 50,0 | 30,0 | 37,5 |
| EB-06 Graze | Gundam | 24 | 34,5 | 41,7 | 37,7 |
| Rescue Megazord | Super Sentai / Power Rangers | 23 | 53,8 | 30,4 | 38,9 |
| Lightspeed Megazord | Super Sentai / Power Rangers | 22 | 53,8 | 31,8 | 40,0 |
| DriveMax Megazord | Super Sentai / Power Rangers | 35 | 37,2 | 45,7 | 41,0 |
| Scrapper (G1) | Transformers | 21 | 53,8 | 33,3 | 41,2 |
| First Aid (G1) | Transformers | 18 | 60,0 | 33,3 | 42,9 |
| Shockwave (Movie) | Transformers | 23 | 43,5 | 43,5 | 43,5 |
| Zeo Megazord | Super Sentai / Power Rangers | 19 | 53,8 | 36,8 | 43,8 |
| STH-05 Hyakuren | Gundam | 20 | 42,9 | 45,0 | 43,9 |
| Arcee (G1) | Transformers | 34 | 52,0 | 38,2 | 44,1 |

**Bảng 7. 20 cặp nhầm nhiều nhất (Linear probe CLIP ViT-L/14 (B5))**

| Lớp thật | Bị đoán thành | Số ảnh | Tỉ lệ trong ảnh của lớp thật | Quan hệ |
| --- | --- | --- | --- | --- |
| GN-001 Gundam Exia | GN-0000 00 Gundam | 13 | 17,1% | cùng franchise |
| Shockwave (Movie) | Shockwave (G1) | 7 | 30,4% | cùng nhân vật |
| Optimus Prime (WFC) | Optimus Prime (Movie) | 7 | 41,2% | cùng nhân vật |
| XXXG-00W0 Wing Gundam Zero | XXXG-01W Wing Gundam | 7 | 13,5% | cùng franchise |
| Thunder Ultrazord | Thunder Megazord (Power Rangers Mighty Morphin 2) | 7 | 24,1% | cùng franchise |
| MS-14A Gelgoog | MS-06F Zaku II | 6 | 12,8% | cùng franchise |
| AMS-119 Geara Doga | MS-06F Zaku II | 6 | 13,3% | cùng franchise |
| MSZ-010 ΖΖ Gundam | MSZ-006 Zeta Gundam | 6 | 15,8% | cùng franchise |
| XXXG-01W Wing Gundam | XXXG-00W0 Wing Gundam Zero | 6 | 11,8% | cùng franchise |
| ZGMF-X20A Strike Freedom Gundam | ZGMF-X10A Freedom Gundam | 6 | 12,0% | cùng franchise |
| S.W.A.T. Megazord | Delta Squad Megazord | 6 | 20,0% | cùng franchise |
| Storm Megazord | Thunder Megazord (Ninpu Sentai Hurricaneger / Power Rangers Ninja Storm) | 6 | 20,7% | cùng franchise |
| Ironhide (G1) | Cliffjumper (G1) | 5 | 15,6% | cùng franchise |
| Jazz (Movie) | Jazz (G1) | 5 | 17,9% | cùng nhân vật |
| Bumblebee (ES) | Bumblebee (Cyberverse) | 5 | 23,8% | cùng nhân vật |
| MS-06F Zaku II | MS-14A Gelgoog | 5 | 9,8% | cùng franchise |
| RGM-79 GM | RMS-179 GM II | 5 | 9,3% | cùng franchise |
| AMS-119 Geara Doga | MS-07B Gouf | 5 | 11,1% | cùng franchise |
| GN-0000 00 Gundam | XVX-016 Gundam Aerial | 5 | 19,2% | cùng franchise |
| XVX-016 Gundam Aerial | GN-001 Gundam Exia | 5 | 5,7% | cùng franchise |

![Ma trận nhầm lẫn chuẩn hoá theo hàng, bỏ đường chéo (Linear probe CLIP ViT-L/14 (B5)); đường kẻ chia ba franchise](../../../ml/reports/B08a/ma-tran-nham.png)

*Hình: Ma trận nhầm lẫn chuẩn hoá theo hàng, bỏ đường chéo (Linear probe CLIP ViT-L/14 (B5)); đường kẻ chia ba franchise*

**Bảng 8. Hiệu chỉnh độ tin (càng nhỏ càng tốt)**

| Chỉ số trên test | Trước hiệu chỉnh (T = 1) | Sau hiệu chỉnh |
| --- | --- | --- |
| ECE | 0,2040 | 0,0478 |
| MCE | 0,3374 | 0,1086 |
| NLL | 1,6240 | 1,4960 |
| Brier | 0,5175 | 0,4661 |
| Nhiệt độ T (chọn trên val) | 1 | 0,714 |

![Biểu đồ độ tin cậy trên test (Linear probe CLIP ViT-L/14 (B5)): cột thấp hơn đường chéo là mô hình tự tin quá mức](../../../ml/reports/B08a/do-tin-cay.png)

*Hình: Biểu đồ độ tin cậy trên test (Linear probe CLIP ViT-L/14 (B5)): cột thấp hơn đường chéo là mô hình tự tin quá mức*

**Bảng 9. Tách ảnh đã biết (test) với ảnh lạ**

| Ảnh lạ | Điểm | AUROC | AUPR-In | AUPR-Out | FPR@95%TPR (%) | Diện tích OSCR |
| --- | --- | --- | --- | --- | --- | --- |
| Robot lạ (lạ-test) | MSP | 0,712 [0,702; 0,723] | 0,842 | 0,495 | 90,3 [88,8; 91,7] | 0,554 |
| Robot lạ (lạ-test) | max-logit | 0,679 [0,668; 0,689] | 0,815 | 0,467 | 91,9 [90,4; 93,4] | 0,523 |
| Robot lạ (lạ-test) | −năng lượng | 0,641 [0,630; 0,653] | 0,785 | 0,440 | 91,9 [90,7; 93,5] | 0,485 |
| Robot lạ (lạ-test) | MSP sau hiệu chỉnh | 0,713 [0,702; 0,722] | 0,841 | 0,500 | 89,7 [88,4; 91,4] | 0,554 |
| Không phải robot (âm-test) | MSP | 0,771 [0,756; 0,787] | 0,968 | 0,228 | 83,3 [80,2; 86,5] | 0,581 |
| Không phải robot (âm-test) | max-logit | 0,861 [0,851; 0,872] | 0,982 | 0,342 | 69,8 [64,9; 74,9] | 0,615 |
| Không phải robot (âm-test) | −năng lượng | 0,889 [0,880; 0,899] | 0,986 | 0,412 | 57,3 [53,0; 62,4] | 0,618 |
| Không phải robot (âm-test) | MSP sau hiệu chỉnh | 0,747 [0,731; 0,762] | 0,964 | 0,206 | 86,6 [83,8; 89,8] | 0,570 |
|    trong đó COCO | MSP | 0,805 | 0,981 | 0,201 | 78,6 | 0,596 |
|    trong đó COCO | max-logit | 0,900 | 0,991 | 0,333 | 60,2 | 0,631 |
|    trong đó COCO | −năng lượng | 0,932 | 0,994 | 0,424 | 42,2 | 0,636 |
|    trong đó COCO | MSP sau hiệu chỉnh | 0,775 | 0,978 | 0,174 | 83,8 | 0,583 |
|    trong đó đồ chơi, xe | MSP | 0,696 | 0,986 | 0,055 | 93,8 | 0,548 |
|    trong đó đồ chơi, xe | max-logit | 0,772 | 0,990 | 0,072 | 91,1 | 0,580 |
|    trong đó đồ chơi, xe | −năng lượng | 0,795 | 0,991 | 0,079 | 91,1 | 0,579 |
|    trong đó đồ chơi, xe | MSP sau hiệu chỉnh | 0,684 | 0,985 | 0,054 | 92,9 | 0,541 |

![Trái: phân bố độ tin của ba nhóm ảnh. Giữa, phải: đường OSCR (trục ngang thang log gần 0; trong ngoặc là diện tích) (Linear probe CLIP ViT-L/14 (B5))](../../../ml/reports/B08a/tap-mo.png)

*Hình: Trái: phân bố độ tin của ba nhóm ảnh. Giữa, phải: đường OSCR (trục ngang thang log gần 0; trong ngoặc là diện tích) (Linear probe CLIP ViT-L/14 (B5))*

**Bảng 10. Luật trả lời theo cấp: ngưỡng chọn trên val, kết quả trên test [Wilson 95%] (Linear probe CLIP ViT-L/14 (B5))**

| α (trần nhận nhầm trên val) | t₁; t₂; t₃ | Lợi ích trên val (%) | Đã biết: đúng lớp % | đúng nhân vật % | đúng franchise % | trả lời sai % | từ chối oan % | Robot lạ: nhận nhầm % | Không phải robot: nhận nhầm % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1% | 1,00; 1,00; 1,00 | 0,0 | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 100,0 [99,9; 100,0] | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,5] |
| 2% | 1,00; 1,00; 0,98 | 23,1 | 0,0 [0,0; 0,1] | 0,0 [0,0; 0,1] | 67,8 [66,7; 69,0] | 0,1 [0,1; 0,2] | 32,0 [30,9; 33,2] | 0,1 [0,1; 0,3] | 1,9 [1,2; 3,2] |
| 5% | 0,94; 0,94; 0,96 | 37,9 | 17,4 [16,5; 18,4] | 1,6 [1,3; 2,0] | 56,9 [55,6; 58,1] | 0,6 [0,4; 0,8] | 23,5 [22,5; 24,6] | 1,6 [1,2; 2,1] | 3,6 [2,5; 5,2] |
| 10% | 0,84; 0,84; 0,92 | 48,4 | 29,8 [28,7; 30,9] | 2,1 [1,8; 2,5] | 49,8 [48,6; 51,0] | 1,4 [1,2; 1,8] | 16,9 [16,0; 17,8] | 5,1 [4,4; 5,9] | 10,1 [8,1; 12,5] |
| 20% | 0,68; 0,68; 0,86 | 57,3 | 42,1 [40,9; 43,4] | 2,3 [1,9; 2,6] | 40,2 [39,0; 41,4] | 3,7 [3,3; 4,2] | 11,7 [10,9; 12,5] | 13,1 [12,0; 14,3] | 19,9 [17,1; 23,0] |

**Bảng 11. Robot lạ dưới luật α = 5%: hệ thống có nói được "đây là Optimus Prime" khi gặp một dòng Optimus chưa học không?**

| Nhóm robot lạ (test) | Số ảnh | Trả lời đúng nhân vật % | Trả lời franchise % | Từ chối % | Nhận nhầm % |
| --- | --- | --- | --- | --- | --- |
| Robot lạ có nhân vật trong danh mục (ví dụ Optimus Prime dòng bị giấu) | 986 | 1,0 [0,6; 1,9] | 65,4 [62,4; 68,3] | 32,3 [29,4; 35,2] | 1,4 [0,8; 2,4] |
| Robot lạ có nhân vật không có trong danh mục | 2427 | — | 62,9 [60,9; 64,8] | 35,4 [33,6; 37,4] | 1,7 [1,2; 2,3] |

![Đánh đổi của luật trả lời theo cấp: nới trần nhận nhầm thì trả lời được nhiều hơn nhưng nhận nhầm ảnh lạ nhiều hơn](../../../ml/reports/B08a/danh-doi.png)

*Hình: Đánh đổi của luật trả lời theo cấp: nới trần nhận nhầm thì trả lời được nhiều hơn nhưng nhận nhầm ảnh lạ nhiều hơn*

## 6. Phân tích

- Tập đóng: top-1 65,6 [64,4; 66,8]%, top-5 84,6 [83,8; 85,4]%. Ở cấp nhân vật đúng 67,6%, cấp franchise 96,5%. Trong 2168 ảnh đoán sai lớp, 5,3% là đúng nhân vật sai dòng và 11,9% là sai cả franchise: phần lớn lỗi là nhầm giữa các robot gần nhau.
- Hiệu chỉnh: T = 0,71 (mô hình thiếu tự tin, cần nâng độ tin). ECE trên test từ 0,204 xuống 0,048, NLL từ 1,624 xuống 1,496. Mục tiêu tham khảo của kế hoạch là ECE sau hiệu chỉnh ≤ 0,05: đạt.
- Robot lạ: điểm tốt nhất là MSP sau hiệu chỉnh, AUROC 0,713, FPR@95 89,7%. Mục tiêu tham khảo AUROC ≥ 0,85: chưa đạt. Robot lạ là phần khó nhất vì chúng giống robot đã biết.
- Không phải robot: −năng lượng đạt AUROC 0,889 (COCO 0,932, đồ chơi và xe 0,795). Ảnh đời thường dễ tách hơn hẳn ảnh đồ chơi chụp kiểu sản phẩm.
- Luật trả lời theo cấp với α = 5% (ngưỡng 0,94, 0,94, 0,96): trên test trả lời đúng lớp 17,4% ảnh đã biết, đúng ở một cấp nào đó 75,9%, trả lời sai 0,6%, từ chối oan 23,5%; nhận nhầm 1,6% robot lạ và 3,6% ảnh không phải robot. Tỉ lệ nhận nhầm trên test có thể vượt 5% một chút vì ngưỡng chọn trên val.

## 7. Hạn chế và rủi ro

- Số liệu trên bản dữ liệu tạm; nhãn sai còn sót trong test làm các chỉ số thấp hơn thật một chút (ảnh đúng mà nhãn sai bị tính là lỗi).
- Lớp không biết và tập âm cùng nguồn web với dữ liệu huấn luyện; robot lạ hay ảnh khách gửi ngoài đời có thể khác (thử nghiệm thực địa ở B13).
- Nhóm đồ chơi của tập âm chưa duyệt tay từng ảnh nên có thể lẫn vài ảnh robot, làm tỉ lệ nhận nhầm trên nhóm này cao hơn thật.
- Ngưỡng chọn trên một lưới bước 0,02 và trên cỡ mẫu val hữu hạn; tỉ lệ nhận nhầm trên test dao động quanh α.
- Chưa đánh giá ảnh dạng biến hình (xe, thú) riêng vì chưa có nhãn dạng; chưa thử outlier exposure (E7, cần huấn luyện lại).
- Miền ảnh do CLIP gán, chưa kiểm định; bảng theo miền chỉ để tham khảo.

## 8. Tái lập

| Mục | Giá trị |
| --- | --- |
| Hạt giống | 0 |
| Phiên bản dữ liệu | b04_splits.csv sha256 dff6fdbb77c0 |

```bash
ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source b05
```
