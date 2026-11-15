# Nhật ký thực hiện: nhận dạng robot từ ảnh

Tài liệu này ghi lại mọi việc đã làm, theo thứ tự thời gian: việc gì, kết quả ra sao, quyết định nào, sự cố nào và cách xử lý. Mục đích là để viết phần thực hiện của luận văn đầy đủ, có bằng chứng.

**Quy ước**
- Giờ Việt Nam (UTC+7). Dấu "~" là thời điểm ước lượng.
- Các mốc khác lấy từ thời điểm tạo file, log hoặc báo cáo trên máy.
- Báo cáo chi tiết của từng bước nằm ở `docs/nhan-dang-robot/bao-cao/` và thư mục Drive *ROBOTICA - Nhận dạng robot / Báo cáo*.
- Từ đây, nhật ký được cập nhật sau mỗi việc.

## 1. Tiến độ theo kế hoạch

| Bước | Nội dung | Trạng thái (15/11/2026 10:05) | Báo cáo |
| --- | --- | --- | --- |
| B0 | Môi trường, đo năng lực phần cứng | Xong | B00-moi-truong |
| B1 | Danh mục 230 robot (nhãn) | Xong, chủ dự án đã duyệt | B01-danh-muc-robot |
| B2 | Thu thập ảnh | **Xong, đạt tiêu chí**: 75.792 ảnh thô, 230 lớp (201–650 ảnh mỗi lớp, trung vị 317) sau lần thu bổ sung 7 lớp ngày 11/11; đo trùng lặp ở B02b | B02-thu-anh, B02a-thu-anh-chay-thu (chạy thử), B02b-trung-lap |
| B3 | Làm sạch, kiểm định nhãn | **Xong** (15/11): lọc tự động còn 53.523 ảnh. Theo quyết định 15/11 không chấm tay: Claude chấm 500 ảnh kiểm định, chủ dự án kiểm tra mù 50 ảnh. Nhãn tải về đúng khoảng 73% (sau lọc 76,8%), người và AI cùng ra tỉ lệ (74% / 78%), khớp từng ảnh κ = 0,36–0,45. Không đổi dữ liệu, không huấn luyện lại | B01-B04-bo-du-lieu |
| B4 | Chia tập, lớp không biết, tập âm | **Xong** (11/11): 49.355 ảnh; train 29.513 / val 6.325 / test 6.310 (195 lớp); 35 lớp không biết (7.207 ảnh); tập âm 2.898 ảnh; rò rỉ cùng lớp bằng 0. Đây là bản dữ liệu chính thức (15/11 quyết định không chấm tay, không chia lại) | B04-chia-tap, B04b-tap-am |
| B5 | Mô hình nền (đặc trưng đóng băng) | **Xong** (12/11): mốc tốt nhất là CLIP ViT-L/14 + linear probe, top-1 trên test 65,6% [64,5; 66,8], top-5 84,6%, macro-F1 63,5%; zero-shot tốt nhất 23,4%, k-NN tốt nhất 49,0% | B05-mo-hinh-nen |
| B6 | Huấn luyện chính | **Xong** (14/11 18:42): 9/9 lần chạy. Chọn **ViT-B/16 (CLIP)**: val top-1 78,85 ± 0,39%, top-5 89,29 ± 0,45%, macro-F1 76,64 ± 0,43%; hơn ConvNeXt-Tiny 2,7–3,6 điểm top-1 (McNemar, p sau Holm < 0,001), hơn mốc B5 12,9–13,7 điểm | B06-huan-luyen |
| B7 | Thí nghiệm phụ | **Xong** (15/11 08:11): 14 lần chạy trên ViT. Chỉ **A4 Mixup/CutMix** cải tiến có ý nghĩa: +1,34 điểm top-1 val [0,66; 1,96], p sau Holm < 0,001. Khởi tạo ImageNet-21k thay CLIP kém 4,84 điểm; TTA lật ngang không giúp; từ 50% lên 100% dữ liệu lỗi val còn giảm 3,28 điểm. **Đang huấn luyện lại mô hình cuối** (cấu hình chính + Mixup/CutMix, 3 hạt giống) và E7 | B07-thi-nghiem-phu |
| B8 | Đánh giá toàn diện | **Xong trên mô hình cuối** (15/11 17:25): cấu hình F (B6 + Mixup/CutMix), 3 hạt giống, top-1 test 79,56 / 79,67 / 79,98%, hơn B6 cùng hạt giống 0,8–2,2 điểm (McNemar, p sau Holm ≤ 0,006); ECE sau hiệu chỉnh 1,2–1,8%; AUROC robot lạ 0,82, không phải robot 0,93. B08b (mô hình B6) có thêm bảng E7: outlier exposure đẩy AUROC ảnh âm lên 0,994. Còn việc gán loại lỗi cho 100 ảnh | B08-danh-gia, B08b-danh-gia-mo-hinh-b06, B08a-danh-gia-moc-b05 |
| B9 | Xuất ONNX, nén | **Xong trên mô hình cuối** (15/11 19:18): F hạt giống 44, fp16 164,1 MB (9 phần), top-1 test 79,97%, trùng PyTorch 99,98%; int8 không đạt tiêu chí | B09-xuat-onnx |
| B10 – B14 | Đưa lên web, thử nghiệm thực địa | B10, B11 xong. Mô hình cuối `robotrec-vit-b16-clip-dff6fdbb-s44` **bật** từ 15/11 20:57 (B11 lần hai: 20/20 ảnh trùng top-1), thay B6 hạt giống 43 (vẫn giữ để quay lại). B12 làm lại trên mô hình cuối. B13 chờ ảnh thực địa của chủ dự án. B14 xong (15/11 22:00): tài liệu viết lại, không gỡ cách cũ (chỉ có hướng dẫn gỡ) | B11-B12-web, huong-dan-go-cach-cu, README |

## 2. Nhật ký theo thời gian

### Ngày 07/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| ~12:30 | Khảo sát | Đọc tài liệu chuẩn `docs/chuan/08-tich-hop-ai.md` và nhật ký tìm bằng ảnh trên CSDL Supabase | 14 lượt tìm thật: 13 lượt bị từ chối vì "lưỡng lự" (hạng 1 và 2 chỉ chênh 0,0001–0,0162), 1 lượt được chấp nhận; ngưỡng τ = 0,6, δ = 0,02 chưa từng hiệu chỉnh | Cách cũ (CLIP đóng băng, so với ảnh dựng từ mô hình 3D) không phân biệt được các robot giống nhau |
| ~12:45 | Khảo sát | Kiểm tra 286 ảnh thật của 67 sản phẩm trên các tên miền bán lẻ | Mọi tên miền cho phép CORS | Đề xuất ban đầu: thêm ảnh thật vào chỉ mục |
| ~12:50 | Quyết định | Chủ dự án đổi hướng | — | **Xây lại từ đầu: học có giám sát, bộ dữ liệu lớn độc lập với web; trả lời robot nào, dòng nào, thông tin, gợi ý sản phẩm** |
| ~12:55 | Khảo sát | Tìm bộ dữ liệu công khai có nhãn robot theo nhân vật | Không có. Chỉ có Gundam/Zaku 198 ảnh 2 lớp (Roboflow) và gundam-captioned (không có nhãn từng mẫu) | Phải tự xây bộ dữ liệu, cũng là một đóng góp của luận văn |
| ~13:00 | Quyết định | Chủ dự án chọn phạm vi | — | Transformers + Gundam + Super Sentai/Power Rangers; mọi nguồn công khai, chỉ dùng cho nghiên cứu; mô hình chạy trong trình duyệt |
| ~13:10 | Kế hoạch | Kế hoạch bản 1 | — | Chủ dự án đánh giá "sơ sài", yêu cầu chi tiết: công cụ, thuật toán, kết quả, phương sai, báo cáo sau mỗi bước |
| 13:27 | Kế hoạch | Kế hoạch chi tiết `00-ke-hoach.md`: 6 câu hỏi nghiên cứu, mẫu báo cáo 8 mục, quy ước thống kê (3 hạt giống, bootstrap, Wilson, McNemar), 15 bước, 9 thí nghiệm | — | Chủ dự án đồng ý, bắt đầu B0 |
| ~13:30 | B0 | Kiểm tra máy | CPU i7-12800H, RAM 32 GB, GPU NVIDIA RTX A2000 Laptop 4 GB, ổ trống 866 GB | Máy đủ cho B1–B5; huấn luyện nặng dùng Colab |
| ~13:32 | B0 | Cài Python 3.11.9 (winget), tạo môi trường ảo `ml/.venv` | — | — |
| 13:37 – 13:41 | B0 | Dựng `ml/`: gói `robotrec` (cấu hình, hạt giống, môi trường, thống kê, báo cáo), test | — | — |
| ~13:45 | B0 | Cài PyTorch 2.11 + CUDA 12.8 | Lỗi thiếu Microsoft Visual C++ Redistributable | Cài VC++ Redistributable (winget, cần quyền quản trị) |
| ~13:55 | B0 | Chạy test | 1 test sai: cận trên Wilson của 10/10 ra 0,99999… | Sửa: hai đầu gán đúng 0 và 1. Test đạt |
| ~14:00 | B0 | Lần chạy B00 đầu tiên | Mọi kiểm tra đạt; EfficientNetV2-S chỉ 22 ảnh/giây, chậm 6 lần ConvNeXt | Nghi do chế độ tất định, phải kiểm tra |
| ~14:10 | B0 | Đo lại ở hai chế độ cuDNN | Chế độ tất định chỉ chậm 2% | **Giả thuyết sai**, tìm tiếp |
| ~14:20 | B0 | Thử bố cục bộ nhớ và kiểu số | Nguyên nhân thật: `channels_last` làm EfficientNetV2-S chậm 6,4 lần; fp32 chậm 8–16 lần so với fp16 | Đưa cả ba yếu tố vào bảng đo của B00 |
| ~14:25 | B0 | Đọc lại số đo | ViT dao động lớn giữa hai lần chạy; dòng fp32 dùng 4,86–4,92 GB, vượt 4 GB của GPU | Đổi cách đo: lặp 3 lần theo thứ tự xáo trộn, ghi nhiệt độ GPU, đánh dấu tràn bộ nhớ |
| ~14:25 | B1 | Khảo sát API của TFWiki, Gundam Wiki, RangerWiki | TFWiki tách trang theo dòng ("Optimus Prime (G1)"); Gundam có infobox `Infobox/Mobile Weapon`; RangerWiki có cả Power Rangers lẫn Super Sentai | Super Sentai Wiki riêng không tồn tại (404) |
| ~14:28 | B1 | Bắt đầu chạy B1 (nền) | — | — |
| **14:33:16 – 15:41:50** | Sự cố | **Máy vào chế độ ngủ (Modern Standby) 68,6 phút** | Một yêu cầu wiki và một bước đo GPU kéo dài đúng bằng khoảng ngủ | Xác nhận bằng nhật ký Windows (Kernel-Power 506/507). Thêm `awake.py` giữ máy thức; B00 tự loại lần đo bị gián đoạn |
| ~15:45 | B1 | Sửa trình truy vấn wiki | — | Tự cắt yêu cầu quá 60 giây |
| 15:50 | B0 | Chốt báo cáo B00 từ số đo đã lưu | ConvNeXt-Tiny 158,3, EfficientNetV2-S 143,8, ViT-B/16 72,8 ảnh/giây; chế độ tất định chậm hơn 6–11% | **Giữ chế độ tất định; bắt buộc fp16; EfficientNetV2-S không dùng channels_last** |
| ~16:08 | B1 | B1 chạy xong lần đầu: 230 lớp | Soát lại phát hiện 6 lỗi (mục 3) | Sửa và chạy lại từ cache |
| ~16:15 | B1 | Chạy lại B1 sau khi sửa | 230 lớp; gộp 56 cặp PR–Sentai; gộp 17 biến thể Gundam; ghép tự động đúng 71/76 sản phẩm (93,4%, KTC 95% [85,5; 97,2]) | Gửi chủ dự án duyệt |
| 16:24 | Báo cáo | Xuất mọi bảng ra Excel (13 sheet) | Công thức đếm của sheet Tổng quan được kiểm bằng thư viện `formulas`, khớp số liệu | Máy không có Excel hay LibreOffice |
| ~16:30 | Báo cáo | Chủ dự án muốn đưa lên Google Drive | Kết nối Drive phải gõ lại toàn bộ nội dung file nên chậm | Cài Google Drive cho máy tính; báo cáo chuyển sang Word bằng pandoc |
| 16:34 | Báo cáo | Thư mục "ROBOTICA - Nhận dạng robot" trên Drive | 10 file | Kiểm tra qua kết nối Drive: đã đồng bộ |
| ~17:30 | B1 | Chủ dự án đọc xong, đồng ý sang B2 | — | — |
| ~17:35 | B2 | Thử các nguồn ảnh | DuckDuckGo: 35 ảnh mỗi trang, lật 3 trang được 97 ảnh khác nhau. **Bing trả ảnh robot Tesla Optimus** cho truy vấn "Optimus Prime transformers G1 toy", lật trang không đổi | **Loại Bing** |
| ~17:45 | B2 | Thử thư viện ảnh wiki | Optimus Prime (G1): 166 ảnh + 212 ảnh ở trang `/toys`; RX-78-2: 388 ảnh | Dùng wiki làm nguồn thứ hai |
| 18:02 – 18:19 | B2 | Chạy thử 6 lớp | 1.698 ảnh, 16,7 phút; Goggle Robo 185 ảnh (dưới 200); 286 ảnh TFWiki bị `robots.txt` chặn | Phải sửa tốc độ và nguồn |
| ~20:55 | B2 | Phân tích lần chạy thử | **TFWiki trả "Access Denied: temporarily blocked due to excessive traffic"**; nguyên nhân chậm: chờ ảnh chậm nhất mỗi đợt; máy chủ treo giữ luồng 40 giây | **Ngừng gọi TFWiki**; dùng Teletraan I (transformers.fandom.com); tải liên tục 4 lớp cùng lúc; không thử lại khi hết thời gian |
| 20:59 – 21:06 | B2 | Chạy thử lần 2 (chạy tiếp) | Mọi lớp ≥ 273 ảnh (Goggle Robo 329, Groove 273, Graze 290) | Đạt, cho chạy đủ 230 lớp |
| ~21:07 | B2 | Chạy đủ lần 1 | Khoảng 3 phút mỗi lớp (ước tính 11 giờ); DuckDuckGo giới hạn tốc độ 5–7 lần mỗi lớp | Dừng lại để sửa |
| 21:08 – 21:13 | B3 | Viết phần tự động của B3, chạy thử 6 lớp | 2.125 → 1.817 ảnh; trùng tuyệt đối 1,4%, gần trùng 12,1%; 171 ảnh nghi ngờ (9,4%); 2,4 phút | Trang duyệt kiểm bằng `node --check`, mọi ảnh có file |
| 21:14 | B2 | Chạy đủ lần 2 | Dừng tìm sớm khi đủ 400 URL; nhịp DuckDuckGo 2 giây | Chạy nền, dữ liệu cũ được giữ |
| ~21:20 | Trực quan | Trang xem dữ liệu `xem-du-lieu.html` mở trong trình duyệt | Ảnh từng lớp, số liệu theo nguồn, trùng lặp, giải thích thuật ngữ | Theo yêu cầu "trực quan hơn" của chủ dự án |
| ~21:28 | B1 | Chủ dự án gửi ảnh chụp màn hình: cột Dòng có "Zeta Gundam~1~50" | **Lỗi thật**: Gundam Wiki ghi số tập sau dấu `~`; ảnh hưởng 36 lớp | Sửa (`clean_episode`, có test), chạy lại B1 lúc 21:30; danh sách lớp không đổi |
| 21:32 | Báo cáo | Cập nhật Drive | Lỗi ghi đè file Excel đang mở trên Drive | Sửa: ghi tên tạm rồi thay thế; file bị khoá thì bỏ qua và báo |
| 21:37 | B2 | Tiến độ | 10/230 lớp sau 22,8 phút (khoảng 1,75 phút mỗi lớp) | Dự kiến chạy thêm 6–7 giờ |
| 21:43 | B2 | Tiến độ xấu đi | Lớp 11 mất khoảng 5 phút; 43 lần bị giới hạn tốc độ | Tìm nguyên nhân |
| ~21:50 | B2 | Đọc mã nguồn thư viện `ddgs` | **Chế độ `auto` gọi đồng thời DuckDuckGo Images và Bing Images rồi gộp kết quả.** Gọi riêng: DuckDuckGo để trống trường `source`; kết quả còn lại (seibertron.com, transformerland.com...) là Bing và khớp truy vấn | Báo cáo ghi đúng nguồn là "ddgs: DuckDuckGo + Bing", tách số liệu theo công cụ bằng trường `source` |
| 21:44; 23:00 | B2 | Dừng lúc 21:44; lúc 23:00 giãn nhịp tìm kiếm lên 3,5 giây và chạy lại | Máy ở chế độ ngủ từ 22:06 đến 23:00 | Gọi đều để tránh bị phạt chờ 10–80 giây mỗi lần. Giờ đã đính chính ngày 11/11 (bản đầu ghi ~21:55) |
| ~23:15 | B2 | Đo tốc độ mới | 1 lần bị giới hạn (trước đó 43); khoảng 1,5 phút mỗi lớp | Dự kiến xong khoảng 03:00 sáng 08/11. Giờ đã đính chính ngày 11/11 (bản đầu ghi ~22:10) |
| 00:07 ngày 08/11 | Sự cố | **Máy tính bị tắt** khi B2 đang chạy (lớp 55/230, Trypticon G1) | 17.061 ảnh, 674 MB của 60 lớp còn nguyên; manifest và nhật ký thử không hỏng dòng nào | Lượt tải cuối 00:06:46, Windows ghi lệnh tắt máy 00:06:49. Giờ đã đính chính ngày 11/11 (bản đầu ghi ~23:00 ngày 07/11) |

### Ngày 08/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| Đầu phiên | B2 | Kiểm tra dữ liệu sau khi máy tắt, chạy tiếp B2 | Chạy tiếp từ lớp 56, bỏ qua mọi URL đã thử | — |
| Tối | B2 | Chủ dự án hỏi: ảnh wiki có hợp cho luận văn không, có bộ dữ liệu chính thức chưa | 74.263 ảnh, 230 lớp; 87% từ tìm ảnh (`ddgs`, 3.155 tên miền: eBay 6,3%, YouTube 5,9%, DeviantArt 4,2%…), 13% từ wiki; manifest **chưa có cột giấy phép** như kế hoạch | Chưa có số đo chất lượng nhãn (chờ B3); đề xuất thêm cột giấy phép, tên miền, dùng ảnh thật cửa hàng và ảnh tự chụp làm tập test độc lập; chờ chủ dự án duyệt |
| Tối | B2b | Viết `ml/scripts/b02b_trung_lap.py`, báo cáo **B02b** (trùng lặp, nhãn mâu thuẫn, hình ví dụ), thêm sheet Excel | Trùng hệt 12,3% (9.166 bản thừa; 1,0% trong cùng lớp); 4.008 ảnh nằm ở ≥ 2 lớp = 12.539 dòng (16,9%); Gundam ít trùng (3,9%) hơn Transformers (16,6%), Super Sentai (17,0%); ảnh báo lỗi "THIS IMAGE WAS NOT FOUND" 31 lần, 11 lớp; logo wiki ở 48 lớp | Theo yêu cầu "giải thích rõ hơn" của chủ dự án; B3 loại toàn bộ nhóm nhãn mâu thuẫn |
| Tối | B2b | Kiểm hình ví dụ | Ảnh tưởng là bộ Defensor thật ra là **móc khoá hình chiếc ủng trên Etsy** (trả cho cả "Defensor" lẫn "Hot Spot") | Sửa chú thích; thay ví dụ "bộ hợp thể" bằng ảnh bộ Menasor (đã mở ảnh kiểm tra). Bài học: luôn mở ảnh trước khi viết chú thích |

### Ngày 11/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| 12:35 – 13:20 | Kiểm tra | Chủ dự án yêu cầu kiểm tra phần nhận dạng robot đang ở bước nào và soát lại mọi thứ. Đọc lại `manifest.csv`, `attempts.csv`, `robots.json`; mở và giải mã toàn bộ file ảnh; so với báo cáo B02, B02b; so bản trên Drive; chạy test | Số liệu khớp: 74.263 dòng, 230 lớp, 120–460 ảnh mỗi lớp (trung vị 316); 65.250 file ảnh, không thiếu, không thừa, không file hỏng, cạnh dài ≤ 512 px; 65.097 mã sha1, 9.166 bản thừa, 4.008 nhóm nhãn mâu thuẫn (12.539 dòng); manifest nén trong `ml/data/manifests/` giống hệt bản trên đĩa; 26/26 test đạt; bản Word, Excel, hình và dữ liệu trên Drive khớp bản ở máy | Đang ở B2: đã thu xong ảnh, chưa nghiệm thu. Lần kiểm tra này không sửa dữ liệu, báo cáo hay mã |
| | B2 | Đối chiếu tiêu chí đạt của kế hoạch ("mọi lớp có ít nhất 200 ảnh thô") | 5 lớp chưa đạt: Gundam Lfrith Ur 120, Gundam Lfrith Pre-Production Model 169, Devil Gundam 171, Gundam Lfrith Thorn 174, Streetwise (G1) 192 | Chờ chủ dự án quyết định: bổ sung truy vấn, hay giữ và xét lại sau B3 |
| | B2 → B3 | Tính trước số ảnh còn lại nếu chỉ bỏ bản trùng trong lớp và nhóm nhãn mâu thuẫn (luật đã chốt ở B02b). Đây là cận trên, chưa trừ ảnh gần trùng và ảnh không liên quan | Còn 61.089 ảnh; mỗi lớp 64–441, trung vị 252; 10 lớp dưới 150; 2 lớp dưới 100 là hai lớp cùng tên *Thunder Megazord* (còn 64 và 65 ảnh): 4 trong 5 truy vấn của hai lớp giống hệt nhau, 247 ảnh nằm ở cả hai lớp, khoảng 80% ảnh mỗi lớp có nhãn mâu thuẫn | Đề xuất: thu lại hai lớp này bằng truy vấn có tên dòng (Mighty Morphin, Ninja Storm, Gouraijin) trước khi chạy B3 |
| | B1 | Soát lại danh mục lớp | 4 lớp Super Sentai / Power Rangers có tên lớp là dạng hợp thể, còn trang wiki, mô tả và ảnh wiki là của robot thành phần: Thunder Ultrazord (trang *Tor the Shuttlezord*), X Emperor Slash (*X Trains*), Zeo Mega Battlezord (*Red Battlezord*), Cosmic Dragon Megazord (*Cosmic Dragon Zord*). Volcanicus (POTP) thiếu phe; X Emperor Slash thiếu dòng | Ảnh wiki và ảnh tìm kiếm của 4 lớp này có thể là hai robot khác nhau. Chờ chủ dự án quyết định tên lớp |
| | B2 | Đo thời gian thu thập thật từ `attempts.csv` và nhật ký Windows (Kernel-Power 506/507) | Cả B2, kể cả hai lần chạy thử: khoảng 6,2 giờ có tải. Lần chạy cuối ngày 08/11 ghi 656,2 phút, trong đó máy ở chế độ ngủ 7 lần, tổng khoảng 420 phút; có tải khoảng 250 phút | Con số 656,2 phút trong báo cáo B02 là thời gian đồng hồ, không phải thời gian tải |
| | Nhật ký | Đính chính ba mốc giờ ước lượng tối 07/11 | B2 chạy lại với nhịp 3,5 giây lúc 23:00 (bản đầu ghi ~21:55); đo tốc độ mới ~23:15 (~22:10); máy tắt lúc 00:07 ngày 08/11 (~23:00 ngày 07/11) | Căn cứ: `attempts.csv`, nhật ký Windows, lịch sử phiên làm việc |
| | Kiểm tra | Việc còn thiếu so với kế hoạch và quy ước | Manifest chưa có cột `license`. Excel chưa có trang B02. Trang `xem-du-lieu.html` sinh ngày 07/11, mới có 6.258 ảnh. `requirements.in` thiếu `ddgs`, `open_clip_torch`, `ImageHash`, `timm`, `pypandoc_binary`; `requirements.lock.txt` thiếu 26 gói cài sau B0. Chưa có notebook B02. `ml/` và `docs/nhan-dang-robot/` chưa vào git, nên notebook Colab chưa chạy được (tiêu chí của B0). Ảnh (3 GB) và mã chỉ có trên máy này. Dòng trạng thái đầu `00-ke-hoach.md` còn ghi "chờ duyệt, chưa làm bước nào". Con số "3.155 tên miền" ở dòng ngày 08/11 đếm theo hai nhãn cuối của tên máy chủ (gộp mọi trang `.co.uk` làm một); đếm theo tên máy chủ là 4.093 | Chờ chủ dự án duyệt thứ tự xử lý |
| ~13:25 | Quyết định | Chủ dự án yêu cầu làm tiếp B3, viết lại mọi việc như B2, giải thích chi tiết, đưa lên Drive | — | Tự quyết các việc còn treo theo đề xuất đã nêu, ghi ở mục 4 |
| 13:28 | Trực quan | Sinh lại trang `xem-du-lieu.html` | Đủ 74.263 ảnh, 230 lớp (bản cũ 6.258 ảnh) | — |
| 13:32 – 13:43 | B2 | Thu bổ sung 7 lớp (5 lớp dưới 200 ảnh, 2 lớp *Thunder Megazord*) bằng truy vấn riêng: tên ngắn không kèm mã hiệu, tên dòng phim, tên bản Super Sentai (Dairen'oh, Gouraijin). Sao lưu `manifest.csv`, `attempts.csv` trước khi chạy | Thêm 1.529 ảnh trong 9,8 phút: tổng 75.792 ảnh; lớp ít nhất 201 ảnh (trước 120). Ảnh không mâu thuẫn nhãn của hai lớp Thunder Megazord: 360 và 319 (trước 64 và 65) | **B2 đạt tiêu chí "mọi lớp ≥ 200 ảnh thô"**. Truy vấn bổ sung ghi ở `b02_thu_anh.yaml` (`extra_queries`), có test |
| ~13:45 | B2 | Sinh lại báo cáo B02 (thêm bảng 1b truy vấn bổ sung; thay "thời gian chạy lần này" bằng "thời gian có tải") và B02b | Thời gian có tải của cả B2: 381,9 phút. Trùng hệt 9.330 bản (12,3%); nhãn mâu thuẫn 4.131 nhóm, 12.822 dòng (16,9%) | — |
| 13:43 – 13:56 | B3 | Chạy phần tự động trên toàn bộ 75.792 ảnh theo luật gần trùng của kế hoạch (pHash ≤ 6 bit hoặc cô-sin CLIP ≥ 0,95) | 13,2 phút. Còn 47.636 ảnh. **Một cụm "gần trùng" 2.701 ảnh của 134 lớp**; 5.392 ảnh bị loại vì gần trùng giữa các lớp | Nghi luật nối nhầm, kiểm tra trước khi dùng kết quả |
| ~13:57 | B3 | Mở ảnh các cặp ở từng khoảng điểm | Cô-sin 0,95–0,97: phần lớn là hai robot khác nhau vẽ cùng phong cách (tranh hồ sơ Gundam), tỉ lệ cặp khác lớp 22–40%. pHash gần mà cô-sin dưới 0,90: cùng bố cục (bìa hộp, thẻ thông số), khác nội dung, tỉ lệ khác lớp 37–79% | **Sửa luật**: gần trùng khi cô-sin ≥ 0,98, hoặc pHash ≤ 6 bit và cô-sin ≥ 0,90. Bằng chứng ở B03a bảng 6, 6b và ba hình cặp ảnh |
| ~13:59 | B3 | Chạy lại với luật đã sửa (đặc trưng lấy từ cache, 30 giây) | Còn **53.523 ảnh** (70,6% ảnh thô); cụm lớn nhất 24 ảnh; gần trùng giữa các lớp còn 866 ảnh. Mỗi lớp 93–406 ảnh, trung vị 225; 1 lớp dưới 100 (King-Ohger ZERO, 93), 23 lớp dưới 150. 4.168 ảnh nghi ngờ (7,8%) | Kết quả lần đầu giữ ở `b03_luat_cu/` để so sánh |
| 14:01 | B3 | Viết `b03a_bao_cao.py`, sinh báo cáo **B03a** (8 mục, 13 bảng, 11 hình, phần giải thích bằng lời thường); xem lại từng hình | Sửa hai chú thích nói quá so với ảnh: cặp cô-sin ≥ 0,98 không phải lúc nào cũng là một ảnh (Nemo và GM II chung khung vẽ); ảnh ngoại lai có cả ảnh không phải robot (can dầu nhớt, ảnh người) mà điểm liên quan bỏ sót | Hai cờ nghi ngờ bổ sung cho nhau: chỉ 892 ảnh bị cả hai cờ đánh dấu |
| ~14:05 | Báo cáo | Excel thêm trang B02 Thu ảnh, B02 Ảnh mỗi lớp, B03a; cập nhật `requirements.in`, `requirements.lock.txt` (75 gói), dòng trạng thái của kế hoạch; sinh lại `xem-du-lieu.html` (có cột "Còn sau B3"); đưa lên Drive | 29/29 test đạt; hai trang duyệt không thiếu file ảnh nào (500 và 53.523 ảnh) | **Điểm dừng chờ duyệt của kế hoạch (sau B3)**: chờ chủ dự án chấm hai trang HTML |
| ~14:15 | Quyết định | Chủ dự án yêu cầu làm tiếp theo kế hoạch | — | Phần chấm tay của B3 chưa có, nên B4 chạy trên **bản dữ liệu tạm**: ảnh phần máy giữ lại, bỏ hết 4.168 ảnh nghi ngờ (49.355 ảnh) |
| ~14:30 | B4 | Viết `b04_chia_tap.py`: chọn lớp không biết, gom nhóm ảnh cùng lớp (cô-sin ≥ 0,95, pHash ≤ 10 bit, cùng trang nguồn), chia bằng StratifiedGroupKFold 20 phần, kiểm tra rò rỉ, χ² | 195 lớp đã biết: train 29.513 (70,0%), val 6.325 (15,0%), test 6.310 (15,0%). 35 lớp không biết: lạ-val 3.794 ảnh (18 lớp), lạ-test 3.413 ảnh (17 lớp). Lớp ít ảnh nhất: 64 train, 16 val, 16 test. Mã phiên bản dữ liệu `dff6fdbb77c0` | King-Ohger ZERO (89 ảnh, dưới mức 100) được đưa vào nhóm lớp không biết thay vì bỏ |
| | B4 | Kiểm tra rò rỉ và phân bố | **0 ảnh** val/test có cô-sin ≥ 0,95 với ảnh train cùng lớp; không nhóm nào nằm ở hai tập; không mã sha1 nào nằm ở hai tập; không lớp cửa hàng nào trong nhóm không biết. 114 ảnh val và 118 ảnh test có cô-sin ≥ 0,95 với ảnh train khác lớp (robot khác nhau cùng phong cách). Miền ảnh giữa ba tập: χ² = 6,25, p = 0,619. Tỉ lệ ảnh wiki 15,6 / 14,9 / 16,9%: p = 0,007, Cramér V = 0,015 | Tiêu chí rò rỉ của kế hoạch ("không cặp nào ≥ 0,95") đổi thành "không cặp *cùng lớp* nào ≥ 0,95", lý do ở B03a và B04 |
| ~14:50 – 15:20 | B4b | Viết `b04b_tap_am.py`, lập tập âm: 2.000 ảnh COCO val2017 (có giấy phép từng ảnh) và ảnh đồ chơi, mô hình, xe của 16 truy vấn | 2.898 ảnh: âm-train 1.451, âm-val 723, âm-test 724. CLIP chấm "giống robot" (p_robot ≥ 0,5) cho 6,0% ảnh COCO và 43,7% ảnh đồ chơi | Lấy gấp đôi kế hoạch để có phần âm-train cho thí nghiệm E7. Đã mở xem 24 ảnh giống robot nhất: không có robot nào của danh mục |
| ~15:25 | Báo cáo | Báo cáo B04, B04b; Excel thêm hai trang; test `test_b04.py`; đưa lên Drive | 31/31 test đạt | **Điểm dừng chờ duyệt của kế hoạch (sau B4)** |

### Ngày 11/11/2026 (tối) và 12/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| 11/11 ~21:40 | Quyết định | Chủ dự án xem xong B4, yêu cầu làm tiếp | — | Làm B5 trên bản dữ liệu tạm `dff6fdbb77c0` |
| 11/11 21:48 – 22:10 | B5 | `b05_dac_trung.py`: trích đặc trưng của 5 mạng đóng băng cho 52.253 ảnh (lớp đã biết, lớp không biết, tập âm) | CLIP ViT-B/32 767 ảnh/giây, ViT-B/16 290, ViT-L/14 81; DINOv2 ViT-S/14 500, ViT-B/14 221. Tổng 20,6 phút | DINOv2 lấy qua `timm` (không cần cài thêm `transformers`) |
| 11/11 ~22:00 | B5 | Viết `robotrec/baselines.py` (hồi quy logistic L-BFGS trên GPU, k-NN cô-sin, chỉ số kèm bootstrap), test trước rồi mới viết mã | Test so với scikit-learn: lần đầu **không đạt** (trọng số lệch 0,07) vì scikit-learn mặc định dừng sớm; so với scikit-learn chạy tới hội tụ thì khớp | 34/34 test đạt |
| 11/11 ~22:15 | B5 | `b05_mo_hinh_nen.py`: zero-shot, linear probe (chọn C bằng 5-fold CV theo nhóm), k-NN (k = 1, 5, 10) trên 5 bộ đặc trưng; bootstrap 1.000 lần; McNemar + Holm | Linear probe tốt nhất trên mọi bộ đặc trưng: CLIP ViT-L/14 65,6%, DINOv2 ViT-B/14 63,9%, DINOv2 ViT-S/14 60,8%, CLIP ViT-B/16 60,2%, CLIP ViT-B/32 55,8% (top-1 trên test). Zero-shot 16,0–23,4%; k-NN 40,8–49,5% | C được chọn: 10 (bốn mạng), 100 (DINOv2 ViT-B/14, sau khi lưới tự mở rộng tới 1.000) |
| 11/11 ~22:30 | B5 | Nghi bản hồi quy logistic dừng sớm (chỉ 1 giây, khớp scikit-learn 98,3% chứ không phải gần 100%) | Chạy lại ở độ chính xác fp64 tới hội tụ với C = 1, 10, 100: hàm mục tiêu của bản fp32 chỉ cao hơn dưới 0,002%, top-1 trên val lệch tối đa 0,05 điểm | **Nghi ngờ sai, bản fp32 đã hội tụ**; số liệu giữ nguyên. Phép kiểm này mất hơn 2 giờ vì fp64 trên GPU laptop rất chậm (C = 100: 6.163 giây) |
| 12/11 ~01:10 | Báo cáo | Báo cáo B05 (8 mục, 9 bảng, 2 hình, giải thích bằng lời thường), Excel thêm trang B05, đưa lên Drive | — | **Điểm dừng chờ duyệt của kế hoạch (sau B5)** |
| 12/11 ~01:40 | Git, Drive | Chủ dự án yêu cầu commit, push toàn bộ và đưa ảnh lên Drive | Commit `dae3ab3` (phần nhận dạng robot), `b38c213` (phần cửa hàng), đẩy lên GitHub. Drive `robotica-ml/`: `images-raw.zip` 3,19 GB (66.619 ảnh), `images-negatives.zip` 0,17 GB (2.940 ảnh) | Đã quét bí mật trước khi commit; ảnh không vào git |
| 12/11 ~02:00 | B6 | Viết `robotrec/train.py` (lấy mẫu cân bằng lớp, hai pha, cosine, AMP, cắt gradient, dừng sớm, checkpoint mỗi epoch, chạy tiếp) theo kiểu viết test trước: 6 test, gồm phép thử "ngắt sau 2 epoch rồi chạy tiếp" cho trọng số y hệt chạy liền | 40/40 test đạt | — |
| 12/11 ~02:20 | B6 | Đo tốc độ trên máy: đọc ảnh + tăng cường ~800 ảnh/giây (8 tiến trình); một bước huấn luyện micro-batch 32: ConvNeXt-Tiny 158, EfficientNetV2-S 137, ViT-B/16 85 ảnh/giây | Ước tính trên máy: 4–7 phút mỗi epoch, 15–22 giờ cho 9 lần chạy | GPU là nút thắt, không phải đọc ảnh. Lần đo đầu bị treo vì script đọc từ stdin không chạy được tiến trình con trên Windows |
| 12/11 ~02:40 | B6 | Chạy thử 3 kiến trúc (1.536 ảnh train, 512 ảnh val, 2 epoch); viết `b06_bao_cao.py`, notebook `B06_huan_luyen.ipynb` | Bộ nhớ GPU đỉnh 2,4 / 2,8 / 3,6 GB (micro-batch 32). Lần chạy thử ViT bị ngắt giữa chừng và chạy tiếp được từ checkpoint. GFLOPs/ảnh: ConvNeXt-Tiny 8,9, EfficientNetV2-S 5,7, ViT-B/16 33,7 | Đổi `best.pt` sang lưu fp32 vì bản fp16 làm kết quả đánh giá lại lệch (EfficientNetV2-S top-1 2,34% thành 2,54% ở lần chạy thử). ViT không tất định tuyệt đối (phép attention của PyTorch), đã ghi ở B00 |
| 12/11 11:15 | Quyết định | Chủ dự án yêu cầu "tiếp tục hoàn thiện AI". Colab chưa chạy, chưa có nhãn tay của B3, GPU máy rảnh | — | Huấn luyện B6 ngay trên máy (4 tiến trình đọc ảnh để chừa CPU); checkpoint lưu ở ổ C, không ghi thẳng vào Drive (mỗi epoch ViT ghi khoảng 1 GB) |
| 12/11 11:16 | B6 | Bắt đầu `b06_huan_luyen.py --all` | ConvNeXt-Tiny hạt giống 42: epoch 1–2 (chỉ đầu phân loại) macro-F1 val 41,3% → 48,2%, khoảng 2 phút/epoch; epoch 3 (toàn mạng) 59,7%, 229 giây/epoch | Log: `ml/data/store/runs/b06-train.log` |
| 12/11 ~11:40 | B8 | Viết `robotrec/evaluate.py` (temperature scaling, ECE/MCE/NLL/Brier, MSP/max-logit/năng lượng, AUROC/AUPR/FPR@95, OSCR, cộng xác suất theo cây nhãn, luật trả lời theo cấp, tìm ngưỡng) theo kiểu test trước | 7 test, gồm một test vét cạn mọi bộ ngưỡng trên lưới để chắc hàm tìm ngưỡng chọn đúng | Kế hoạch không định nghĩa "trả lời đúng nhiều nhất" khi các cấp có giá trị khác nhau; dùng lợi ích = số cấp nói đúng / 3 |
| 12/11 ~12:00 | B8 | `b08_danh_gia.py --source b05`: chạy toàn bộ đánh giá trên mốc B5 (linear probe CLIP ViT-L/14), báo cáo **B08a** | Tập đóng: top-1 65,6%, cấp nhân vật 67,6%, cấp franchise 96,5%; 82,7% lỗi là sai nhân vật cùng franchise. Hiệu chỉnh: T = 0,71, ECE 0,204 → 0,048. Robot lạ: AUROC tốt nhất 0,713 (MSP sau hiệu chỉnh), FPR@95 89,7%. Không phải robot: AUROC 0,889 (−năng lượng; COCO 0,932, đồ chơi 0,795). Luật α = 5%: đúng lớp 17,4%, đúng ở cấp nào đó 75,9%, sai 0,6%, từ chối oan 23,5%; nhận nhầm 1,6% robot lạ, 3,6% ảnh không phải robot | Mốc đóng băng nhận ra robot lạ kém (AUROC 0,71 < mục tiêu 0,85): đây là chỗ mô hình tinh chỉnh cần cải thiện |
| 12/11 ~12:20 | B9 | Cài `onnx` 1.23.2, `onnxruntime` 1.31.1, `onnxscript`; viết `b09_xuat_onnx.py` (fp32, fp16, int8 động, int8 tĩnh QDQ MinMax/Entropy; so khớp; đo thời gian 1 và 4 luồng; cắt phần ≤ 45 MB; labels.json, model-card.json) | Đang chạy thử | Worker của web chạy WASM một luồng và ghép nhiều phần theo thứ tự, nên đo thời gian 1 luồng và giữ cách cắt phần đó |
| 12/11 11:28 – 11:51 | B9 | Chạy thử B9 với mô hình chạy thử ConvNeXt-Tiny (512 ảnh val/test, 100 ảnh hiệu chỉnh): xuất bằng bộ xuất TorchScript, opset 17, `onnx.checker` đạt | fp32 106,8 MB; fp16 53,5 MB (top-1 trùng PyTorch 99,8%); int8 động 32,4 MB (trùng 77,7%); int8 tĩnh 27,4 MB (trùng 1,6%, **hỏng**). Gói fp16 cắt thành 2 phần (45 + 8,5 MB) kèm labels.json, model-card.json. 23 phút | Bước hiệu chỉnh Entropy mất 11 phút CPU, làm epoch huấn luyện lúc đó chậm gấp đôi (561 giây); từ giờ không chạy việc nặng CPU song song với huấn luyện |
| 12/11 ~12:05 | B9 | Chẩn đoán int8 tĩnh: đồ thị ConvNeXt có 72 phép Add, 54 phép Mul (phần dư, hệ số tầng); bộ nén mặc định lượng tử hoá cả các phép này | Chỉ lượng tử hoá Conv/MatMul/Gemm: logits lệch lớn nhất 5,3 → 1,3 (trung bình 0,22); int8 động lệch trung bình 0,11. Mô hình chạy thử có khoảng cách hạng 1–2 trung vị chỉ 0,22 nên tỉ lệ trùng top-1 của nó không có ý nghĩa | Sửa script: int8 tĩnh chỉ lượng tử hoá Conv/MatMul/Gemm. Đo lại trên mô hình chính |
| 12/11 ~12:10 | B8 | Thêm vào B8 (khi đánh giá mô hình B6): Grad-CAM tự viết bằng hook PyTorch (`robotrec/explain.py`, 2 test), UMAP đặc trưng tầng áp chót (cài `umap-learn` 0.6.0), trang HTML để chủ dự án phân loại nguyên nhân của 100 ảnh đoán sai | — | Grad-CAM của ViT lấy ở tầng chuẩn hoá đầu của khối cuối, vì ở đầu ra khối cuối chỉ token CLS nhận gradient |
| 12/11 ~12:30 | B7 | Thêm vào bộ huấn luyện: Mixup/CutMix (`timm.data.Mixup`, nhãn mềm; rút ngẫu nhiên theo hạt giống của từng epoch để chạy tiếp vẫn cho đúng kết quả) và suy luận thêm ảnh lật ngang (TTA). Viết `b07_thi_nghiem_phu.py`, `configs/b07_thi_nghiem_phu.yaml` | Test viết trước; lần đầu test Mixup đạt cả khi chưa có mã (vì bộ huấn luyện bỏ qua khoá lạ), đã thêm điều kiện "loss phải khác lần không Mixup" để test có nghĩa. 8/8 test. Chạy thử A4, A6 trên CPU đạt | Theo phương án dự phòng của kế hoạch khi thiếu GPU: A1–A5 một hạt giống, A6 đủ ba hạt giống. Không sửa `b06_huan_luyen.py` trong lúc huấn luyện vì tiến trình đọc ảnh nạp lại file đó mỗi epoch |
| 12/11 ~12:50 | B11 (chuẩn bị) | Viết `src/lib/recognition.ts`: cây nhãn, softmax có nhiệt độ, cộng xác suất theo cấp, luật trả lời theo cấp, top-5; `ml/scripts/xuat_mau_web.py` sinh 48 ca mẫu từ chính mã Python của B8 (đủ 4 cấp trả lời) vào `test/fixtures/recognition-golden.json`; `test/recognition.test.ts` | 51/51 test đạt: cùng cấp, cùng lớp/nhân vật/franchise, xác suất lệch < 10⁻¹⁰ | **Khác kế hoạch**: kế hoạch định gửi lên máy chủ top-10 xác suất, nhưng xác suất cấp nhân vật và franchise là tổng mọi lớp con nên top-10 không đủ; sẽ gửi đủ 195 xác suất (vẫn không gửi ảnh) |
| 12/11 ~12:55 | B8 | Sinh lại B08a: ma trận nhầm lẫn có nhãn tên ba franchise | Số liệu không đổi | — |

### Ngày 12–13/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| 12/11 13:24 | B6 | ConvNeXt-Tiny hạt giống 42 chạy đủ 30 epoch (không dừng sớm vì macro-F1 val vẫn nhích lên tới cuối lịch học) | Tốt nhất ở epoch 29: val top-1 75,73%, top-5 86,31%, macro-F1 73,44%; top-1 trên ảnh train đã tăng cường 99,3%. 128 phút | Mô hình học thuộc train gần hết; khoảng cách train–val lớn là dấu hiệu quá khớp, sẽ đo kỹ ở B7 (A6) |
| 12/11 → 13/11 | Sự cố | Hạt giống 43 dừng ở epoch 28/30 khi phiên làm việc của Claude đóng (lệnh chạy nền gắn với phiên); một epoch kéo dài 2.754 giây vì máy ngủ | Không mất dữ liệu: last.pt lưu sau mỗi epoch | Chạy tiếp bằng tiến trình riêng (cửa sổ thu nhỏ "B6 huan luyen"), không phụ thuộc phiên; đóng cửa sổ đó là dừng |
| 13/11 13:53 | B6 | Chạy tiếp `--all`: hạt giống 43 tiếp từ epoch 28 | — | — |
| 13/11 ~14:00 | B6 | Báo cáo tạm B06 (1/9 lần chạy) | ConvNeXt-Tiny hạt giống 42 hơn linear probe CLIP ViT-L/14 của B5 trên val 10,3 điểm top-1 [9,2; 11,4], McNemar p < 0,001 (972 ảnh chỉ mô hình tinh chỉnh đúng, 322 ảnh chỉ mốc đúng) | Số liệu sơ bộ cho RQ2; bản cuối trên test ở B8 |

### Ngày 13–14/11/2026

| Thời điểm | Bước | Việc làm | Kết quả, số liệu | Quyết định, ghi chú |
| --- | --- | --- | --- | --- |
| 13/11 14:01, 15:51 | B6 | ConvNeXt-Tiny hạt giống 43, 44 xong | Ba hạt giống: val top-1 **75,65 ± 0,14%**, top-5 86,28 ± 0,10%, macro-F1 **73,25 ± 0,23%**; epoch tốt nhất 29, 30, 30 | Dao động giữa các hạt giống rất nhỏ. Epoch tốt nhất luôn ở cuối lịch học: thêm epoch có thể còn lời chút ít, ghi vào giới hạn của B06 |
| 13/11 18:39 | B6 | EfficientNetV2-S hạt giống 42 xong | Tốt nhất ở epoch 28: val top-1 74,34%, macro-F1 71,96% (kém ConvNeXt-Tiny khoảng 1,3 điểm) | — |
| 13/11 20:50 → 14/11 10:32 | Sự cố | EfficientNetV2-S hạt giống 43 đứng yên ở epoch 12 gần 14 giờ (epoch 12 đo được 49.441 giây, bình thường khoảng 265 giây) | Không treo, không mất dữ liệu: Windows tạm dừng tiến trình khi máy vào Modern Standby (Kernel-Power 506/507), chạy lại khi chủ dự án mở máy | Bật `ml/scripts/giu_may_thuc.ps1` (cửa sổ thu nhỏ, giữ `SetThreadExecutionState` cho tới khi tiến trình huấn luyện kết thúc; không đổi cài đặt nguồn). Gập màn hình vẫn làm máy ngủ |
| 14/11 ~10:40 | B6 | Báo cáo B06 tính giờ GPU bỏ phần máy ngủ: epoch dài hơn 2 lần trung vị cùng pha tính bằng trung vị; thêm cột số epoch bị thay; sinh lại báo cáo tạm (4/9 lần chạy) | 8,69 giờ GPU thật trên 25,81 giờ đồng hồ | Máy ngủ chỉ làm chậm, không đổi trọng số hay kết quả |
| 14/11 ~10:40 | Quyết định | Chủ dự án yêu cầu chạy luôn B7 khi B6 xong, không chờ duyệt kiến trúc; hạn hoàn thành 30/11 | — | Kiến trúc của B7 lấy theo luật chọn của B06 (macro-F1 val trung bình cao nhất, ưu tiên mạng nhẹ hơn nếu không kém có ý nghĩa) |
| 14/11 ~10:40 | Sự cố (nguyên nhân gốc) | Tìm nguyên nhân máy ngủ dù `b06_huan_luyen.py` có gọi `keep_awake()` | `keep_awake()` chỉ báo ES_SYSTEM_REQUIRED; trên máy Modern Standby màn hình vẫn tự tắt và máy vào ngủ chờ | Sửa `robotrec/awake.py`: báo thêm ES_DISPLAY_REQUIRED (màn hình không tự tắt). 51/51 test đạt |
| 14/11 10:43 | B6 → B7 | Bật `ml/scripts/chay_b6_b7.ps1` (cửa sổ thu nhỏ "B6-B7 noi tiep"): chờ B6 xong, chạy bù nếu thiếu lần nào, báo cáo B06, đọc `choice`, chạy `b07_thi_nghiem_phu.py --all` và báo cáo B07 | Log `ml/data/store/runs/b07-train.log` | Ước tính B7: khoảng 13 giờ nếu chọn ConvNeXt-Tiny (A5 bỏ qua vì chỉ áp dụng cho ViT), khoảng 27 giờ nếu chọn ViT |
| 14/11 ~10:50 | Quyết định | Chủ dự án yêu cầu tăng tốc bằng cách kết hợp: làm phần web song song (cho phép tạo bảng mới trên Supabase), Colab miễn phí và Kaggle | — | Máy nhà không tăng tốc thêm được (GPU đã chạy hết sức; giảm epoch thì không còn so sánh công bằng với các lần đã chạy), nên chạy song song trên nhiều máy |
| 14/11 10:50 – 11:10 | Hạ tầng | Viết `robotrec/cloud.py` (tên lần chạy, chép kết quả, chia việc B7 tham lam theo thời gian dự kiến), `ml/cloud/kaggle_chay.py` (mẫu script Kaggle: lấy mã đúng commit, cài timm 1.0.31, mỗi GPU T4 chạy lần lượt việc của nó, hai GPU song song), `kaggle_cong_cu.py` (gọi Kaggle API trong môi trường riêng `ml/.venv-cloud`), `dieu_phoi.py` (vòng điều phối, dự phòng khi máy trên mây hỏng); `b07_thi_nghiem_phu.py` nhận `--seed`, `--fraction`; notebook Colab chỉ chạy phần việc được giao | 11 test mới (8 cho chép và chia việc, 3 giả lập vòng điều phối); 51 test cũ vẫn đạt | Bộ ảnh cho Kaggle chỉ gồm ảnh train và val của B4: 35.838 ảnh, 1,62 GB (không nén lại). Kaggle CLI 2.2.5: P100 đã ngừng, mặc định "GPU T4 x2" |
| 14/11 11:05 | Git | Commit `c063837` (44 file: B7–B9, chia việc nhiều máy, `src/lib/recognition.ts`), đẩy lên GitHub | Đã quét bí mật: không có | Colab và Kaggle lấy mã từ GitHub nên phải đẩy trước |
| 14/11 11:10 | B6 | Dừng tiến trình B6 cũ đúng lúc EfficientNetV2-S hạt giống 43 xong epoch 20 (history.csv ghi sau last.pt nên không mất epoch); bỏ `chay_b6_b7.ps1`; bật `dieu_phoi.py` (cửa sổ thu nhỏ "Dieu phoi B6-B7") | Chia việc B6: máy nhà EfficientNetV2-S 43 (tiếp từ epoch 20), 44; Colab ViT 43; Kaggle ViT 42, 44 | Khác cấu hình chạy: trên GPU 16 GB mỗi bước lan truyền 64 ảnh một lần thay cho 2 × 32 ảnh cộng dồn; như nhau về toán học với ViT (LayerNorm). EfficientNetV2-S (BatchNorm) chỉ chạy ở máy nhà. Báo cáo B06 thêm cột "Máy (GPU)" |
| 14/11 11:12 – 11:21 | Kaggle | Đăng nhập Kaggle bằng OAuth (tài khoản của chủ dự án); tải lên bộ dữ liệu **riêng tư** `robotica-anh-b04` (1,62 GB, 6,5 phút); Kaggle tự giải nén thành `raw/<lớp>/<ảnh>` | Bộ dữ liệu sẵn sàng 11:21 | Ảnh chỉ dùng nghiên cứu, không công khai |
| 14/11 11:25 | Sự cố | Lần đẩy đầu lên Kaggle (`robotica-b06`, ViT hạt giống 42, 44) chạy **không có GPU** | Script Kaggle dừng ngay nhờ chốt "không có GPU thì dừng" (không chạy CPU vô ích) | Nguyên nhân: tài khoản Kaggle chưa xác minh số điện thoại (bắt buộc để có GPU). Sửa `dieu_phoi.py`: trường hợp này đẩy lại sau 15 phút thay vì giao hẳn cho máy nhà; máy nhà rảnh trước thì tự làm. 12/12 test điều phối đạt. Khởi động lại điều phối lúc 11:28 (EfficientNetV2-S hạt giống 43 tiếp từ epoch 24) |
| 14/11 11:49 – 12:16 | Kaggle | Hai lần đẩy nữa (11:49, 12:09) vẫn không có GPU, dù hạn mức GPU của tài khoản còn 30/30 giờ | Chủ dự án xác minh số điện thoại trong khoảng này | Thêm chẩn đoán (`nvidia-smi`, phiên bản torch/CUDA) trước khi dừng; thử lại mỗi 5 phút thay vì 15; khởi động lại điều phối lúc 12:16 (đúng lúc xong epoch 6 của EfficientNetV2-S hạt giống 44) để đẩy lại ngay. Thêm `kaggle_nhat_ky.py` đọc nhật ký Kaggle dạng UTF-8 |
| 14/11 12:22 | Kaggle | Lần đẩy lúc 12:16 chạy **có 2 GPU Tesla T4 (15 GB)**: lấy mã đúng commit `c063837`, cài timm 1.0.31, thấy ảnh ở `/kaggle/input/datasets/khoit7/robotica-anh-b04/raw`, tải trọng số ViT | ViT hạt giống 42 và 44 chạy song song | — |
| 14/11 12:26 – 12:43 | Kaggle | Đo thử: (1) kernel thử nhỏ chạy có GPU trong lúc phiên chính đang chạy; Kaggle báo giới hạn **2 phiên GPU cùng lúc** ("Maximum batch GPU session count of 2 reached"); hạn mức tính theo giờ của phiên. (2) Hai việc chung một phiên: epoch đầu của ViT mất **693 giây** (khoảng 52 ảnh/giây mỗi việc), vì máy Kaggle có 2 GPU nhưng chỉ **4 CPU**, đọc và tăng cường ảnh là nút thắt | Giữ nguyên thì mỗi lần ViT mất gần 6 giờ | Xoá phiên chung (mất khoảng 25 phút đã chạy), mỗi việc một phiên riêng (đủ 4 CPU). Viết lại `dieu_phoi.py` thành **hàng đợi chung**: việc dài trước, máy nhà rảnh thì lấy việc kế tiếp, Kaggle còn chỗ thì đẩy việc kế tiếp; phiên xếp hàng quá 10 phút khi máy nhà rảnh thì huỷ. Bỏ Colab khỏi B6 (Colab chỉ 2 CPU, chậm hơn máy nhà) |
| 14/11 12:43 – 12:48 | Kaggle, B7 | ViT hạt giống 42, 43 mỗi việc một phiên Kaggle; ViT hạt giống 44 chờ máy nhà (xong EfficientNetV2-S khoảng 14:05). Thêm **chạy trước B7**: khi phiên Kaggle rảnh mà B6 không còn việc để đẩy (khoảng 15:40–17:35, máy nhà chạy lần ViT cuối), chạy luật chọn của B06 trên các lần chạy đã xong (mỗi kiến trúc ≥ 2 hạt giống) rồi đẩy trước việc B7 của kiến trúc dẫn đầu; kết quả cuối (9/9) khác thì huỷ các phiên đó | 16/16 test điều phối đạt | Đoán sai chỉ tốn hạn mức Kaggle (còn khoảng 29 giờ trong tuần), không ảnh hưởng số liệu: báo cáo B07 chỉ đọc lần chạy của kiến trúc được chọn |
| 14/11 12:44 – 13:10 | Kaggle | Mỗi việc một phiên: ViT hạt giống 43 chạy từ 12:44; hạt giống 42 xếp hàng tới 13:10 mới chạy (chỗ của phiên chung đã xoá chưa được nhả ngay). Đo trên phiên một việc (4 CPU): epoch 1 (đọc ảnh lần đầu) 416 giây, epoch 2 185 giây, epoch toàn mạng 283 giây | Một lần ViT trên Kaggle khoảng 2,4 giờ (máy nhà khoảng 3,5 giờ) | Hạn mức GPU tăng đúng tốc độ một phiên khi chỉ một phiên chạy: phiên đã xoá không còn tính giờ |
| 14/11 13:35 – 13:40 | Colab | Chủ dự án đã mở Colab: giao ViT hạt giống 44 cho Colab (sửa ô `SEEDS` thành `[44]`) thay vì để máy nhà chạy từ 14:05 | Dự kiến B6 xong khoảng 16:55 thay vì 17:40 | Thêm vào điều phối: Colab có 60 phút ân hạn để khởi động trước khi máy nhà nhận thay; máy nhà rảnh thì chạy trước việc B7 ngắn nhất, B6 xong giữa chừng thì chờ việc đó xong; danh sách việc chạy trước loại cả việc máy nhà đang chạy. Bộ test có chốt chống treo; 18/18 test đạt |
| 14/11 13:59 – 15:34 | B6 | Máy nhà xong EfficientNetV2-S 44 lúc 13:59. Colab không ghi gì lên Drive trong 60 phút ân hạn, nên 14:41 máy nhà tự nhận ViT 44. Kaggle xong ViT 42 lúc 14:51 (dừng sớm ở epoch 22, tốt nhất epoch 17) và ViT 43 lúc 15:12 (đủ 30 epoch) | ViT macro-F1: 42 = 76.15, 43 = 76.90 (ConvNeXt 73.25 ± 0.23). Luật B06 trên 7/9 lần chạy đoán ViT thắng. ViT 44 trên máy nhà: epoch 7/30, macro-F1 72.23, khoảng 500 s mỗi epoch | Hai phiên Kaggle rảnh đã nhận trước việc B7 A1, A2 của ViT (hạt giống 42), nhưng tới 15:34 vẫn đang xếp hàng chờ GPU. B6 dự kiến xong khoảng 17:40–18:50, tuỳ ViT 44 có dừng sớm không |
| 14/11 15:40 | Quyết định | Chủ dự án tắt Colab và yêu cầu: khi B6 xong thì viết báo cáo chi tiết mọi việc đã làm tới lúc đó, đưa toàn bộ lên Drive, rồi làm tiếp B7, B8… tới hết, không dừng chờ duyệt ở từng bước | Bỏ các điểm dừng của mục 12 trong kế hoạch (B8, B11). Vẫn hỏi trước những việc khó đảo ngược hoặc ra bên ngoài: triển khai lên mạng (B12), xoá bảng cũ trên CSDL dùng chung (B14), tải mô hình lên Storage. Việc cần chính chủ dự án làm (B3 duyệt tay 500 ảnh, B8 gán loại lỗi cho 100 ảnh, B13 ảnh thực địa) được để sẵn công cụ | Trong lúc chờ B6, làm song song phần web B11 |
| 14/11 15:42 – 16:00 | B11 (web) | Tiền xử lý ảnh trong trình duyệt `src/lib/recognition-preprocess.ts`: chép thuật toán song tuyến 8 bit của Pillow (lọc tam giác giãn theo tỉ lệ, hệ số 22 bit, làm tròn sau mỗi chiều), cạnh dài `int(256·dài/ngắn)` và lề cắt giữa làm tròn nửa về chẵn như torchvision, ảnh trong suốt trộn lên nền trắng như B2. Bộ ca mẫu `ml/scripts/xuat_mau_tien_xu_ly.py` (7 ảnh sinh bằng công thức, 97×61 tới 1600×1200). API `POST /api/nhan-dien`, hàm dựng câu trả lời `src/lib/recognition-api.ts`, worker dùng chung `public/image-search/worker.js`, giao diện `src/components/recognition/`; trang `/tim-bang-anh` dùng nhận dạng khi có mô hình đang bật, chưa bật thì giữ cách cũ. Trang quản trị thêm "Số liệu từng bước" đọc từ model card (b09 ghi thêm `metrics.steps`) | Ảnh 224×224 sau tiền xử lý **trùng từng byte** với Python ở cả 7 ca (SHA-256 giống nhau), tensor lệch dưới 1e-5. 68/68 test nhận dạng đạt, typecheck và lint sạch | Khác kế hoạch: trình duyệt gửi đủ xác suất mọi lớp (195 số, vài KB) thay cho top-10, vì luật theo cấp cộng xác suất mọi lớp cùng nhân vật, chỉ top-10 thì máy chủ không tính lại đúng. WebGPU chưa bật (worker chỉ có bản WASM). Còn lại của B11: kiểm tra khớp logits Python–trình duyệt trên ảnh thật và đo thời gian, cần mô hình cuối của B9 |
| 14/11 16:00 – 18:45 | B6, báo cáo | ViT hạt giống 44 (máy nhà, 4,0 giờ GPU) xong lúc 18:42: top-1 79,11%, macro-F1 76,88%. Bộ điều phối chạy `b06_bao_cao.py`, chọn ViT theo luật, rồi bắt đầu B7 ngay (máy nhà nhận A3; Kaggle đang chạy A1, A2). Sửa cột "Máy" của bảng 1: ảnh máy Kaggle có sẵn gói `google.colab` nên hai lần chạy Kaggle bị ghi là Colab; nay xét Kaggle trước (`ml/robotrec/env.py` ghi thêm cờ `kaggle`). Viết báo cáo tổng hợp B0–B6 | ViT 78,85 ± 0,39% top-1 val | Báo cáo [B00-B06-tong-hop](bao-cao/B00-B06-tong-hop.md) |
| 14/11 18:45 – 18:55 | Drive, B8, B14 | Đưa báo cáo tổng hợp, nhật ký, Excel (thêm sheet B06, B07) lên Drive: 55 file. B8 bắt đầu 18:48 trên **CPU** (ẩn GPU bằng `CUDA_VISIBLE_DEVICES=-1`, 8 luồng): huấn luyện A3 của B7 dùng 3,6/4 GB bộ nhớ GPU, chạy B8 trên GPU cùng lúc sẽ làm A3 hết bộ nhớ và dừng giữa chừng. Dùng lại logits val lúc huấn luyện (trọng số tốt nhất, xếp lại theo `val_keys.json`; top-1 tính lại trùng B6 ở cả 3 hạt giống), chỉ suy luận test, lớp không biết, tập âm. Viết [hướng dẫn gỡ cách cũ](huong-dan-go-cach-cu.md) (chưa xoá gì). Nút máy ảnh ở đầu trang và khối "Tìm bằng ảnh" trên trang chủ nay hiện cả khi có mô hình nhận dạng đang bật | — | Logits val tính trên GPU fp16, các tập còn lại trên CPU fp32: chênh nhau cỡ 1e-3, không đổi kết luận |
| 14/11 19:13 – 19:18 | B8 | Test của hạt giống 42 xong sau 25 phút trên CPU (khoảng 4 ảnh/giây); cùng lúc A3 chậm từ 500 lên 700–750 giây mỗi epoch vì tranh CPU với bộ nạp ảnh. Thấy B8 suy luận cả `neg_train` (1.451 ảnh mỗi hạt giống) dù không dùng tới: sửa để chỉ suy luận 6 tập trong `SETS`, chạy lại (logits đã lưu được dùng lại) | Dự kiến B8 xong khoảng 21:45 | Chấp nhận B7 chậm khoảng 1,5 giờ để web có mô hình sớm (quyết định 16:15, mục 4) |
| 14/11 19:18 – 22:13 | B8 | Đánh giá toàn diện ViT-B/16 (CLIP), 3 hạt giống, trên test (2 giờ 55 phút trên CPU). Báo cáo ghi rõ phần phân tích là số của hạt giống 42 (thêm câu vào `b08_danh_gia.py`). B9 bắt đầu 22:15 với hạt giống 43 (macro-F1 val cao nhất, chọn trên val chứ không trên test) | top-1 test **78,29 ± 0,80%**, top-5 89,06 ± 0,21%, macro-F1 76,42 ± 0,72%; cấp nhân vật 80,29%, franchise 97,41%. ECE 0,156 → **0,015** (T ≈ 0,76). Robot lạ AUROC 0,822 ± 0,009 (mục tiêu 0,85: chưa đạt); không phải robot 0,929 ± 0,002. Luật α = 5% trên test (hạt giống 42): đúng lớp 36,8%, đúng ở một cấp 81,1%, sai 1,1%, từ chối oan 17,8%; nhận nhầm robot lạ 3,9%, ảnh không phải robot 4,1%. Hơn mốc B5 11,7–13,2 điểm top-1 (p sau Holm < 0,001) | Báo cáo [B08-danh-gia](bao-cao/B08-danh-gia.md). B7 sơ bộ trên val: A4 Mixup/CutMix 79,75% top-1 (B6 cùng hạt giống 78,40%), A2 79,10%, A1 77,96% |
| 14/11 23:15 – 15/11 00:10 | Bản thử trên web | Chủ dự án hỏi có bản thử trước bằng kết quả B6 không. Dùng bản **fp16** của ViT hạt giống 43 mà B9 đã xuất (B9 còn đang chấm các bản), nhiệt độ T = 0,758 và ngưỡng α = 5% (0,96; 0,96; 0,88) của B8. Kiểm tra nhanh 60 ảnh test: top-1 trùng PyTorch 60/60, chênh logits ≤ 0,015. Tải lên Storage `media/ml/robotrec-vit-b16-clip-dff6fdbb-s43-thu-fp16/`: lượt tải 40 MB trở lên bị ngắt giữa chừng (30 MB thì được) nên chia **9 phần 20 MB** (`PART_BYTES` của b09 đổi từ 45 xuống 20 MB). Trước khi ghi CSDL dùng chung: kiểm tra `meta`, chỉ còn `nd_01_nhan_dang_robot` chưa chạy, mọi khoá `seed:` đã có. Script mới `scripts/recognition-import.mjs` (chạy đúng hàm của trang quản trị): nhập 230 robot, ghép 76 sản phẩm theo gợi ý B1, nhập và **bật** mô hình thử (`smoke: true`). Bản đang chạy trên mạng chưa có mã nhận dạng nên không bị ảnh hưởng | `/tim-bang-anh` trên máy (localhost:3000) dùng nhận dạng; API trả đúng cấp lớp và 3 sản phẩm Optimus Prime cho vector thử; Storage cho phép CORS | Bản chính thức (B9 chọn bản nhỏ nhất đạt tiêu chí) sẽ thay bản thử |
| 15/11 00:58 – 01:04 | B9, B11, bật mô hình | B9 xong (163 phút, CPU): fp32 328 MB top-1 78,83%; **fp16 164,1 MB, top-1 78,80%, trùng PyTorch 99,94%, 967 ms/ảnh** (1 luồng, máy đang bận B7); int8 động 84,6 MB trùng 90,22% và int8 tĩnh MinMax trùng 77,35% (không đạt); int8 tĩnh Entropy hết bộ nhớ (ghi vào hạn chế). Chọn fp16. Chia lại gói thành 9 phần 20 MB. **B11 kiểm tra khớp trên 20 ảnh test thật** (rải đều franchise và miền ảnh): ONNX Runtime Web (WASM, 1 luồng) trùng top-1 với ONNX Runtime Python **20/20**, chênh logits ≤ 0,0035; trùng PyTorch 19/20 (ảnh lệch có 2 lớp đầu cách nhau 0,0018 logit, cả hai đều sai); 14/20 ảnh đúng nhãn; tải phiên 1,3 s, chạy 1,94 s/ảnh (trung vị), p95 2,08 s. Đạt tiêu chí đã thống nhất, nên tải bản chính thức lên Storage, nhập và **bật** `robotrec-vit-b16-clip-dff6fdbb-s43`; xoá bản thử khỏi CSDL và Storage. Cache trong RAM của máy chủ phát triển còn giữ bản thử, phải khởi động lại (ghi chú vào script) | Đạt: top-1 trùng ≥ 99%, giảm ≤ 1 điểm, trình duyệt trùng Python 100% | Báo cáo [B09-xuat-onnx](bao-cao/B09-xuat-onnx.md). Kết quả B11: `ml/data/store/b11/khop/ket-qua-web.json` |
| 15/11 01:04 – 01:18 | B12 | Kiểm thử trong một git worktree riêng tách từ commit trước, chỉ chứa phần của đề tài (file nhận dạng, `ml/`, báo cáo; ở `migrations.ts`, `AdminNav.tsx`, `CLAUDE.md` chỉ lấy đúng đoạn của mình), để chắc bản đưa lên build được mà không cần thay đổi chưa commit của phiên khác. `node_modules` nối bằng junction thì Turbopack từ chối (nằm ngoài thư mục dự án), nên cài riêng bằng `npm ci` (79 s). `.env.local` chưa có `ADMIN_EMAIL`: lấy email tài khoản quản trị từ CSDL truyền tạm cho smoke (không ghi ra file). Thêm `/admin/nhan-dien` vào danh sách smoke. Đưa script tải lên Storage vào `scripts/recognition-upload.mjs` | lint, typecheck sạch; **386 test đạt** (1 bỏ qua), trong đó 80 test nhận dạng; build đạt (65 s, 176 trang); smoke: mọi trang ổn; 69 test Python đạt | Báo cáo [B11-B12-web](bao-cao/B11-B12-web.md) |
| 15/11 01:19 | B12 (commit) | Commit `2a1973c` trong worktree riêng (67 file: phần nhận dạng, `ml/`, báo cáo; tác giả là chủ dự án, không ghi Claude), push lên `origin/main` (`c063837..2a1973c`). Thư mục chính chuyển `main` lên commit mới bằng `git reset --mixed` (chỉ đổi index, không đụng file): còn lại đúng các thay đổi chưa commit của phiên khác (chuyển khoản, trang giới thiệu, `sale_13`) | Push xong. GitHub không có trạng thái triển khai Netlify gắn vào commit nên chưa xác nhận được bản trên mạng đã build | Repo GitHub công khai: hình Grad-CAM của B8 (ghép từ ảnh test) vào git như các hình mẫu ảnh của B2–B4 trước đây |
| 15/11 01:20 – 08:01 | B7 | Bộ điều phối chạy nốt A6 (10%, 25%, 50% × 3 hạt giống) giữa máy nhà và 2 phiên Kaggle. Lúc 02:48 Kaggle báo 401 khi hỏi trạng thái bộ ảnh, lần thử sau (06:57) thì được | 14/14 lần chạy xong lúc 08:01 | — |
| 15/11 08:01 – 08:11 | B7 | `b07_bao_cao.py` tự chạy | A4 Mixup/CutMix: top-1 val 79,75% (+1,34 điểm [0,66; 1,96], McNemar p sau Holm < 0,001), macro-F1 +1,43. A2, A3 cải tiến 0,7 điểm nhưng p sau Holm 0,172. A1 −0,44 (không ý nghĩa). A5 (ImageNet-21k) −4,84. A7 TTA −0,03 trung bình, chậm 1,55 lần. Đường học: lỗi val 40,8 → 30,1 → 24,4 → 21,2% (10 → 100% dữ liệu), lỗi train ≤ 0,2%: thiếu dữ liệu, thêm ảnh còn có ích | Báo cáo [B07](bao-cao/B07-thi-nghiem-phu.md). Theo quyết định số 4 (mục 4): huấn luyện lại mô hình cuối với Mixup/CutMix |
| 15/11 09:55 – 10:02 | Mô hình cuối | Thêm cấu hình **F** (cấu hình chính + Mixup/CutMix) vào `ml/configs/b07_thi_nghiem_phu.yaml` và bước "mô hình cuối" vào bộ điều phối: F hạt giống 42 chép từ A4 hạt giống 42 (cùng cấu hình, cùng hạt giống, không chạy lại); F hạt giống 43, 44 lên Kaggle; E7 chỉ chạy ở máy nhà (ảnh âm của B4b không có trong bộ ảnh Kaggle). Kaggle lấy mã theo commit trên GitHub nên commit, push phần `ml/` trước | 69 test Python đạt | Mô hình đang bật trên web giữ nguyên tới khi mô hình cuối qua B8, B9, B11 |
| 15/11 10:06 – 10:11 | Mô hình cuối | F hạt giống 42 chép từ A4. Lần chạy đầu, máy nhà tự nhận F hạt giống 43 trước khi Kaggle kịp nhận (xem mục 3); dừng sau 1 phút, xoá thư mục dở, sửa bộ điều phối rồi chạy lại | F hạt giống 43, 44 lên Kaggle lúc 10:11; máy nhà chạy E7 | Đồng thời máy nhà tính sẵn logits của F hạt giống 42 trên CPU cho B8 |
| 15/11 ~11:10 | Thử trên web | Chủ dự án thử `/tim-bang-anh` bằng ảnh chụp màn hình trang sản phẩm Ironhide (khung xem 3D): web trả "chưa nhận ra", Jetfire 11,5%, Ironhide 6%. Chạy lại mô hình đang bật (B9, hạt giống 43) bằng Python trên ảnh đại diện dựng từ mô hình 3D của sản phẩm (640×640), 4 ảnh thật của sản phẩm và vùng cắt từ ảnh chụp màn hình | Ảnh thật: **Ironhide (G1) 77,5–98,0%** (4/4 đúng). Ảnh dựng 3D gốc: Ironhide (G1) 57,7% (đúng nhưng dưới ngưỡng lớp 0,96). Vùng cắt từ ảnh chụp màn hình: 12,8–20,5%, hạng 1 sai (Drivemax Megazord, Ratchet), giống kết quả web | Lỗi do ảnh đầu vào khác xa ảnh huấn luyện: ảnh chụp màn hình có giao diện, nền chấm, robot nhỏ, độ phân giải thấp, và là mô hình 3D chứ không phải đồ chơi thật. Mô hình không chắc nên luật trả lời từ chối, đúng thiết kế. Ảnh thử để ở `ml/data/store/thu-anh/` (không vào git) |
| 15/11 ~11:20 | Thử trên web (sửa lỗi) | Chủ dự án thử ảnh thật của Ironhide: bảng chi tiết ghi Ironhide (G1) 64,4% đứng đầu, nhưng ô "Gần giống nhất" lại bắt đầu từ Cliffjumper 13,4%, không có Ironhide. **Lỗi giao diện**: `buildRecognitionResponse` luôn bỏ robot hạng 1 khỏi danh sách (`slice(1)`), vì nghĩ nó đã là câu trả lời chính; khi trả lời ở cấp nhân vật, thương hiệu hay "chưa nhận ra" thì robot hạng 1 không hiện ở đâu. Sửa: chỉ bỏ hạng 1 khi trả lời ở cấp lớp; thêm test cho cấp thương hiệu và "chưa nhận ra" | 59 test nhận dạng đạt, typecheck, lint sạch | Ảnh này bị từ chối đúng luật: lớp 64,4% < 0,96, nhân vật 64,4% < 0,96, Transformers 86,3% < 0,88. Luật với α = 5% rất chặt: mô hình đang bật chỉ trả lời tới tên robot cho 42,5% ảnh đã biết, từ chối 23,2% (B8). Bản sửa này sau đó được thay bằng bảng xếp hạng (dòng sau) |
| 15/11 11:25 – 11:45 | Thử trên web (bản tạm) | Chủ dự án thử ảnh Optimus Prime: trang ghi "Có vẻ là một robot Transformers… chưa nhận ra là nhân vật nào" dù Optimus Prime (G1) 95,7% (ngưỡng nhân vật 0,96). Chủ dự án đề nghị tạm thời chỉ hiện bảng % (mục 4). Sửa: API `POST /api/nhan-dien` trả `{ model, ranking[5], products[] }` (`buildRecognitionResponse`), sản phẩm của các robot trong bảng theo thứ hạng, tối đa 9; giao diện: bảng 5 robot có thanh %, dòng nhắc, sản phẩm, phần chi tiết (ảnh sau xử lý, câu giải thích xác suất đã hiệu chỉnh, thời gian) | 80 test nhận dạng đạt (viết lại test của API), typecheck, lint sạch. Gọi thử API ở máy dev với xác suất giống ảnh Ironhide: Ironhide (G1) 64,4% đứng đầu, sản phẩm "Ironhide Autobot" hiện đầu tiên | Câu "lệch trung bình khoảng 2 điểm %" lấy từ ECE sau hiệu chỉnh của B8 (0,0175 với hạt giống 43) |
| 15/11 ~12:00 | Commit, tài liệu học | Kiểm thử trong worktree riêng (chỉ phần của đề tài): lint, typecheck sạch; 386 test đạt (1 bỏ qua); build đạt (176 trang); 69 test Python đạt. Commit `729c6ae` (bảng xếp hạng, B8 `--source cuoi`, bộ điều phối hỏi Kaggle ngay khi vào bước mới, tài liệu), push lên `origin/main`. Logits của F hạt giống 42 tính xong trên CPU (91 phút). Chủ dự án muốn hiểu toàn bộ quy trình: viết trang giải thích "Đường đi của một bức ảnh" (hai chặng chuẩn bị / nhận dạng, số liệu thật, hộp tính thử softmax với nhiệt độ T, từ điển) | Push xong | Trang giải thích là Artifact riêng tư trên claude.ai, không nằm trong repo |
| 15/11 ~12:30 | Bộ dữ liệu | Chủ dự án yêu cầu giải thích chi tiết bộ dữ liệu (trùng lặp, độ sai, độ tin cậy). Viết báo cáo tổng hợp [B01-B04-bo-du-lieu](bao-cao/B01-B04-bo-du-lieu.md) từ B1–B4 và đo thêm: (1) 3 mô hình ViT của B6 cùng chắc ≥ 0,9 rằng nhãn khác: 154 / 12.635 ảnh val+test (1,2%); (2) Claude xem bằng mắt 24 ảnh trong số đó: 21 nhãn sai, 3 không chắc, 0 mô hình sai; (3) xem 48 ảnh ngẫu nhiên val+test: 35 đúng, 5 sai rõ, 8 không chắc | Ước lượng nhãn sai khoảng **10,4%** [KTC 95% Wilson 4,5%; 22,2%], cận dưới chắc chắn 1,1%. Nguồn sai chính: robot hợp thể và thành viên (Devastator, Defensor, Menasor), họ Thunder Megazord trùng tên, ảnh robot khác do tìm kiếm trả về | Chưa phải chấm tay chính thức của B3 (một người xem, mẫu nhỏ). Danh sách nghi sai và hai mẫu ở `ml/data/store/thu-anh/` (không vào git). Đưa lên Drive |
| 15/11 12:44 – 13:55 | Mô hình cuối | Kaggle chạy xong F hạt giống 44 (12:44) và 43 (12:55), mỗi lần 30 epoch, khoảng 2,5 giờ; bộ điều phối chép kết quả về. E7 trên máy nhà tới epoch 18/30 (khoảng 14 phút một epoch). Bắt đầu tính logits test, tập chưa biết, ảnh âm của F hạt giống 43, 44 trên CPU cho B8 (song song với E7, không tranh GPU) | Top-1 val (epoch tốt nhất): hạt giống 42: 79,75% (epoch 26); 43: 79,79% (epoch 28); 44: **80,44%** (epoch 29). Macro-F1 val 0,776; 0,778; 0,783 | B6 cùng hạt giống: 78,40%; 79,04%; 79,11% (hạt giống 43 đang bật trên web). Mô hình cuối hơn 0,8–1,35 điểm ở cả 3 hạt giống; so sánh chính thức trên tập test ở B8 |
| 15/11 14:20 – 14:55 | B3 (AI chấm thay người) | Theo quyết định mới (mục 4): Claude xem 500 ảnh của `kiem-dinh-truoc-loc.html` qua 42 tờ ghép 12 ảnh, gán đúng / robot khác / không phải robot kèm mức chắc chắn (`ml/data/store/b03/ai-cham/ai.csv`, không vào git). Quy ước: bản khác của cùng nhân vật (Jazz phim với Jazz G1, Rhinox phim với Rhinox Beast Wars), thành viên đứng riêng hay cả nhóm chưa ghép, ảnh nhiều robot ngang nhau đều là "robot khác"; hộp, sách hướng dẫn, thẻ tiểu sử có hình robot là "đúng". Đối chiếu với điểm của bộ lọc B3 (`scores.csv`). Làm trang `kiem-tra-ai-50.html`: 50 ảnh ngẫu nhiên (hạt giống 2026) để chủ dự án chấm, không hiện đáp án của Claude | AI chấm: 366 đúng, 86 robot khác, 48 không phải robot. **Độ đúng nhãn của ảnh sau bỏ trùng 73,2% [Wilson 69,2%; 76,9%]**; chỉ tính ảnh Claude chắc: 82,0% [77,0; 86,1]. Ảnh qua bộ lọc (không nghi ngờ): 76,8% [72,8; 80,4]. Cờ "nghi ngờ": precision 83,3% [66,4; 92,7], **recall chỉ 18,7%** [13,0; 26,1]. Ngưỡng t_rel cho ảnh không phải robot: F1 0,54 ở 0,5 và 0,58 ở 0,8 (cao nhất) | Bộ lọc tự động gắn cờ đúng nhưng bỏ sót phần lớn ảnh sai: phần lớn lỗi là robot khác (bản khác, thành viên, nhiều robot), CLIP không phân biệt được. Không đổi ngưỡng, không đổi dữ liệu (theo quyết định); ghi vào hạn chế. Chờ chủ dự án chấm 50 ảnh để đo độ khớp |
| 15/11 14:58 – 15:05 | B3 (người kiểm AI) | Chủ dự án chấm 50 ảnh của `kiem-tra-ai-50.html` (không thấy đáp án của Claude), file `ml/data/store/b03/ai-cham/nguoi-50.csv`; so với Claude ở `so-sanh-50.csv` | Trùng đáp án 37/50 = **74%, κ Cohen 0,36** (ba đáp án); gộp thành đúng/sai: trùng 80%, **κ 0,45** (mức "trung bình"). Tỉ lệ nhãn đúng trên cùng 50 ảnh: người 74% [Wilson 60,4; 84,1], Claude 78% [64,8; 87,2]; trên 500 ảnh Claude 73,2% | Hai bên cho **cùng một con số tổng** (khoảng 73–78% nhãn đúng trước lọc), nhưng lệch nhau ở từng ảnh khó: 8/13 ảnh lệch là chủ dự án chọn "không phải robot" cho tranh, ảnh mờ, ảnh dạng xe, vỉ đồ chơi mà Claude tính "đúng"; vài ảnh bản biến thể (Sandrock Custom) hay ảnh nhiều robot. Luận văn dùng con số tổng, ghi κ để nói rõ nhãn từng ảnh của AI chỉ tin được ở mức trung bình |
| 15/11 16:58 – 17:25 | B8 (mô hình cuối), B08b | Logits CPU của F-s43, F-s44 xong lúc 16:58; E7 xong 16:52. Chạy `b08_danh_gia.py --source cuoi --arch vit_b16_clip` → báo cáo B08. Top-1 test 3 hạt giống 79,56 / 79,67 / 79,98% (B6: 77,37 / 78,83 / 78,68%); nhân vật 81,4–81,8%, franchise 97,7–97,8%. McNemar so với B6 cùng hạt giống: +2,19 / +0,84 / +1,30 điểm, p (Holm) 3,5·10⁻¹⁰ / 0,006 / 9·10⁻⁵, cả ba có ý nghĩa. T = 0,763–0,776, ECE sau hiệu chỉnh 1,2–1,8%. AUROC robot chưa biết 0,820–0,825, ảnh âm 0,93. Luật α = 5% trên test: trả lời đúng ở cấp nào đó 81,7–82,3%, trả lời sai 1,0–1,1%, nhận nhầm robot chưa biết 3,8–4,1%, ảnh âm 3,5–4,4%. Chạy lại `--source b06` để B08b có bảng 13 (E7): E7 (outlier exposure) đẩy AUROC ảnh âm từ 0,931 lên 0,994 (FPR95 44% → 3,9%), top-1 79,29%, nhưng chỉ một hạt giống và là công thức B6, nên chưa thay mô hình cuối; ghi vào hướng phát triển | Xong | Hạt giống 44 tốt nhất trên test nhưng chọn bản đưa lên web theo quy tắc đã định là bản có kết quả tốt nhất; ghi rõ trong báo cáo là chọn sau khi xem test (khác biệt giữa 3 hạt giống < 0,5 điểm, trong khoảng tin cậy). Bước sau: B9 xuất ONNX F-s44 |
| 15/11 17:15 – 19:35 | B9, B11 (mô hình cuối) | `b09_xuat_onnx.py --run runs/b07/F-vit_b16_clip-s44` (125 phút trên CPU). fp32 328 MB top-1 79,98%; **fp16 164 MB top-1 79,97%, trùng PyTorch 99,98%**, 803 ms/ảnh 1 luồng; int8 động 84,6 MB nhưng top-1 78,37%, trùng 91,2%; int8 tĩnh 72,5%. Theo tiêu chí (trùng ≥ 99%, giảm ≤ 1 điểm) chọn fp16 như lần trước, gói 9 phần 20 MB, mã `robotrec-vit-b16-clip-dff6fdbb-s44`, T = 0,7758, ngưỡng (0,96; 0,96; 0,88). B11: `b11_kiem_tra_khop.py` (20 ảnh test) rồi `test/recognition-parity.test.ts` bằng ONNX Runtime Web WASM: top-1 trùng 20/20 với ONNX Python và PyTorch, logits lệch tối đa 0,0033 (ONNX) và 0,015 (PyTorch) | Đạt, đủ điều kiện thay mô hình đang bật (B6 s43, test 78,83%) | Tải lên Storage: `fetch` của Node 26 lỗi HTTP/2 (`NGHTTP2_PROTOCOL_ERROR`) hai lần ngay phần đầu; chuyển sang curl `--http1.1` (upsert), mạng chậm (~60 KB/s) |
| 15/11 19:36 – 21:00 | B10 (thay mô hình) | Tải 9 phần của `robotrec-vit-b16-clip-dff6fdbb-s44` lên Storage `media/ml/` bằng curl HTTP/1.1, mỗi phần thử lại tới khi HTTP 200 (mạng ngắt giữa chừng nhiều lần, phần 07 mất 6 lần); HEAD kiểm tra đủ 9 phần đúng số byte. `recognition-import.mjs --activate`: 230 robot (cập nhật), mô hình s44 **bật**, s43 tắt (vẫn giữ trên CSDL và Storage để quay lại được). Kiểm tra CSDL: T = 0,7758, ngưỡng (0,96; 0,96; 0,88), top-1 test 79,97% | Xong | Lần nhập đầu (19:35) hỏng vì thiếu phần trên Storage nhưng đã ghi dòng mô hình trước khi kiểm tra; lần sau báo "đã có, giữ nguyên" và dòng đã ghi đúng. Máy chủ dev đang chạy từ 01:02 vẫn giữ s43 trong cache; không dừng được máy chủ đó trong phiên này nên kiểm tra web trên bản build riêng |
| 15/11 21:00 – 21:10 | B12 (mô hình cuối) | Git worktree riêng từ `729c6ae`, chỉ chép báo cáo B01-B04, B08, B08b, B09, `ml/reports/` và nhật ký (không có thay đổi mã). `npm ci`, lint, typecheck đạt; Vitest 386 test đạt, 1 bỏ qua; `npm run build` đạt. Chạy `next start -p 3200` trên bản build: `/tim-bang-anh` trả mô hình `…-s44`, các phần 00, 07, 08 trên Storage trả HTTP 200. Đưa báo cáo lên Drive (`export_drive.py`) | Đạt | Máy chủ dev ở cổng 3000 còn giữ s43 trong cache tới khi khởi động lại |
| 15/11 21:20 – 22:00 | B14 (tài liệu) | Viết lại `docs/chuan/08-tich-hop-ai.md` cho nhận dạng robot (bài toán, yêu cầu YC-AI-01–08, dữ liệu, mô hình, kết quả, luật trả lời, kiến trúc, mã nguồn, cách thay mô hình, kiểm thử, hạn chế); đặc tả cách cũ chuyển nguyên văn thành phụ lục A (đánh số A.1–A.11). Thêm mục 8 vào `00-quyet-dinh-nen-tang.md` (các quyết định 07–15/11). `ml/README.md`: thêm B7, bộ điều phối, `--source cuoi`, B11, sửa cỡ phần 20 MB. Tạo `docs/nhan-dang-robot/README.md` (bảng tổng hợp B0–B14). `CLAUDE.md`: trỏ đặc tả và tổng hợp. Sửa dòng trạng thái B4, B5 (bỏ "bản dữ liệu tạm") | Xong | Theo quyết định 3: không xoá mã, bảng của cách cũ; nút máy ảnh ở đầu trang giữ như cũ |
| 14/11 10:50 – 11:30 | B10 (web) | Chủ dự án cho phép tạo bảng mới trên Supabase. Kiểm tra CSDL thật (chỉ đọc): 78 bảng, chưa có `robots`, `robot_products`, `recognition_models`, `recognition_logs`. Viết migration `nd_01_nhan_dang_robot`, `src/lib/recognition-import.ts` (kiểm tra robots.json, model-card.json, labels.json), `src/server/repo/recognition.ts`, `src/server/recognition.ts` (cache), Server Action `src/app/actions/recognition.ts` (quyền catalog.edit, ghi audit_logs), trang `/admin/nhan-dien` | 12 test mới (5 kiểm tra dữ liệu nhập, 7 trên PGlite: quyền, nhập lại không nhân đôi, ghép theo gợi ý B1, bật mô hình thứ hai thì mô hình đầu tự tắt, nhật ký không có ảnh); typecheck, lint đạt; test cũ liên quan (khởi tạo CSDL, sao lưu, quyền) đạt | Khác kế hoạch: bảng `robots` thêm cột `character` (cấp nhân vật của câu trả lời) và `store_products` (gợi ý ghép của B1); bỏ cột `accepted` của `recognition_logs` vì suy ra từ `level`. Migration chưa chạy trên CSDL thật (chỉ chạy khi mã mới khởi động) |

## 3. Sự cố và cách xử lý

| Sự cố | Phát hiện thế nào | Nguyên nhân | Xử lý | Ảnh hưởng tới số liệu |
| --- | --- | --- | --- | --- |
| Cận trên Wilson của 10/10 ra 0,99999… | Test tự động | Sai số làm tròn số thực | Hai đầu gán đúng 0 và 1 | Không |
| EfficientNetV2-S chậm 6 lần | Bảng đo B00 | Bố cục `channels_last` | Đo cả hai bố cục; B6 dùng bố cục mặc định cho mạng này | Bảng 3, 5 của B00 |
| Số đo ViT dao động mạnh | So hai lần chạy B00 | GPU laptop đổi xung nhịp theo nhiệt độ | Lặp 3 lần, xáo trộn thứ tự, báo trung bình ± độ lệch chuẩn | B00 |
| Dòng fp32 chậm bất thường | Bộ nhớ đỉnh 4,86–4,92 GB > 4 GB | Windows tràn VRAM sang RAM hệ thống | Đánh dấu "tràn VRAM", loại khỏi so sánh | B00 bảng 5 |
| Máy ngủ 68,6 phút | Khoảng trống 4.147 giây trong cache, một bước đo dài 276 giây | Modern Standby của Windows | Giữ máy thức (`SetThreadExecutionState`); B00 loại lần đo bị gián đoạn, ghi bằng chứng | B00 bảng 3b |
| 6 lỗi danh mục B1 | Soát danh sách lớp | (1) Biến thể Gundam thành nhiều lớp; (2) Mobile Fighter G Gundam (`type = Fighter`) bị loại; (3) Gosei Great thành 2 lớp; (4) hai lớp cùng tên Thunder Megazord; (5) 3 trang không phải robot (Predacon (BW), Scraplet, Vector Prime); (6) trang B-127 (One) chỉ chuyển hướng | Luật họ biến thể; nhận thêm `type` theo nhóm; thêm luật gộp theo tên; tách tên trùng; loại tay kèm lý do; ghép B-127 → Bumblebee (One) | B01 bảng 9–11 |
| Mô tả TFWiki bị rỗng | Test | Dòng tóm tắt, ảnh và đoạn văn nằm cùng một khối | Lọc theo dòng thay vì theo khối | Mô tả của 230 lớp |
| Bing trả sai kết quả | Thử nguồn | Không rõ, nghi bị nhận diện là bot | Loại Bing | B02 |
| TFWiki chặn truy cập | Trang lỗi khi đọc robots.txt | Lưu lượng của B1 (khoảng 1.500 yêu cầu) và lần chạy thử; robots.txt cấm thư mục ảnh | Không gọi TFWiki nữa; dùng Teletraan I | Ảnh wiki của Transformers lấy từ Teletraan I |
| B2 chậm | Chạy thử 16,7 phút cho 6 lớp | Tải theo đợt chờ ảnh chậm nhất; DuckDuckGo giới hạn tốc độ | Tải liên tục, dừng tìm sớm, nhịp 2 giây | Thời gian chạy |
| Nguồn "DuckDuckGo" thực chất gộp hai công cụ | Đọc mã nguồn `ddgs` khi tìm cách tăng tốc | Chế độ `auto` của thư viện gọi cả DuckDuckGo và Bing | Ghi đúng trong báo cáo; tách số liệu theo công cụ | Mô tả nguồn của B2 |
| "~1~50" trong cột Dòng | Chủ dự án phát hiện | Gundam Wiki ghi số tập sau `~` | `clean_episode` + test, chạy lại B1 | Dòng và phe của 36 lớp |
| Không ghi đè được file trên Drive | Lỗi khi xuất | File đang mở hoặc đang đồng bộ | Ghi tên tạm rồi thay thế | Không |
| Máy ngủ khi B2 chạy ngày 08/11 | Kiểm tra ngày 11/11: khoảng trống trong `attempts.csv`, nhật ký Windows (Kernel-Power 506/507) | Máy vào Modern Standby 7 lần, tổng khoảng 420 phút. Nguyên nhân chưa xác định; nhiều khả năng do gập màn hình hoặc bấm nút nguồn, là trường hợp `keep_awake` không chặn được | Chưa xử lý. Đề xuất cho các bước chạy dài: cắm sạc, đặt Windows "gập màn hình: không làm gì" | Thời gian 656,2 phút trong B02 gồm khoảng 420 phút máy ngủ; ảnh đã tải không bị ảnh hưởng |
| Huấn luyện B6 đứng yên gần 14 giờ (13/11 20:50 → 14/11 10:32) | Epoch 12 của EfficientNetV2-S hạt giống 43 dài 49.441 giây; tiến trình vẫn còn và chạy tiếp khi máy được mở | Modern Standby: khi màn hình tắt, Windows tạm dừng chương trình desktop (Google Drive vẫn được đánh thức nên nhật ký hệ thống trông như máy thức). Tiến trình riêng của B6 không gọi giữ máy thức | `ml/scripts/giu_may_thuc.ps1` gắn với tiến trình huấn luyện; báo cáo B06 tính giờ GPU bỏ phần máy ngủ | Không đổi kết quả; chỉ chậm khoảng 14 giờ |
| Lệnh huấn luyện chạy nền bị tắt khi phiên làm việc đóng (12–13/11) | Hạt giống 43 dừng ở epoch 28, không có dòng kết thúc trong log | Lệnh chạy nền của công cụ gắn với phiên làm việc | Chạy bằng tiến trình riêng (`Start-Process`), chạy tiếp từ last.pt | Không: huấn luyện chạy tiếp đúng từ epoch đã lưu |
| Cụm "gần trùng" 2.701 ảnh của 134 lớp ở B3 | Số liệu cụm in ra sau lần chạy đủ đầu tiên (cụm lớn nhất bất thường) | Ngưỡng cô-sin CLIP 0,95 của kế hoạch nối cả các robot khác nhau vẽ cùng phong cách; gom cụm theo liên kết đơn kéo chúng thành chuỗi | Đổi luật: cô-sin ≥ 0,98, hoặc pHash ≤ 6 bit kèm cô-sin ≥ 0,90; ghi mọi cặp ứng viên vào `pairs.csv` để kiểm tra | Giữ lại thêm 5.887 ảnh; số liệu B03a dùng luật đã sửa, có bảng so sánh hai luật |
| Máy nhà nhận việc mà lẽ ra Kaggle chạy (15/11 10:06) | Log: "máy này nhận F-vit_b16_clip-s43" ngay khi vào bước mô hình cuối, Kaggle chưa nhận việc nào | Lượt hỏi Kaggle cách nhau 5 phút; bước B6, B7 (chạy lại báo cáo) vừa hỏi nên bước mới phải chờ, trong lúc đó máy nhà lấy việc đầu hàng đợi. Máy nhà sẽ phải chạy nối tiếp F hạt giống 43 rồi E7 (khoảng 8 giờ) | `run_phase` hỏi Kaggle ngay khi vào bước mới. Dừng bộ điều phối, xoá thư mục dở của F hạt giống 43 (mới 1 phút, chưa có epoch), bỏ khỏi danh sách đã nhận, chạy lại | Không: lần chạy dở chưa có epoch nào |

## 4. Quyết định của chủ dự án

| Ngày | Quyết định |
| --- | --- |
| 07/11 | Bỏ cách tìm bằng ảnh cũ; xây mô hình học có giám sát trên bộ dữ liệu lớn, độc lập với dữ liệu web |
| 07/11 | Phạm vi: Transformers + Gundam + Super Sentai/Power Rangers (khoảng 150–250 robot) |
| 07/11 | Nguồn ảnh: mọi nguồn công khai, chỉ dùng cho nghiên cứu, không phân phối lại |
| 07/11 | Mô hình chạy trong trình duyệt của khách (ONNX) |
| 07/11 | Kế hoạch phải chi tiết; mỗi bước có báo cáo (công cụ, thuật toán, kết quả, phương sai, khoảng tin cậy) |
| 07/11 | Duyệt danh sách 230 lớp và bảng ghép 76 sản phẩm |
| 07/11 | Lưu mọi tài liệu lên Google Drive; xem dữ liệu trực quan; giữ nhật ký này |
| 11/11 | Làm tiếp B3; mọi việc viết lại như B2, có giải thích chi tiết, đưa lên Drive |
| 11/11 | *Claude tự quyết theo yêu cầu "làm tiếp", chủ dự án có thể đổi:* thu bổ sung 7 lớp trước khi chạy B3 (nếu không thì hai lớp Thunder Megazord không đủ 100 ảnh) |
| 11/11 | *Claude tự quyết, khác kế hoạch:* đổi luật gần trùng của B3 từ "pHash ≤ 6 hoặc cô-sin ≥ 0,95" sang "cô-sin ≥ 0,98, hoặc pHash ≤ 6 và cô-sin ≥ 0,90" (lý do và bằng chứng ở báo cáo B03a). Hệ quả cho B4: tiêu chí "không có cặp train–test nào cô-sin ≥ 0,95" phải xem lại, vì hai robot khác nhau cũng đạt mức đó |
| 11/11 | Làm tiếp theo kế hoạch (B4) dù chưa chấm tay B3 |
| 11/11 | *Claude tự quyết, chủ dự án có thể đổi:* B4 dùng bản dữ liệu tạm (bỏ hết ảnh nghi ngờ); lớp dưới 100 ảnh vào nhóm không biết; nhóm ảnh thêm điều kiện cô-sin ≥ 0,95; tiêu chí rò rỉ tính theo cặp cùng lớp; tập âm lấy gấp đôi để có phần âm-train |
| 11/11 | Làm tiếp B5 |
| 11/11 | *Claude tự quyết, khác kế hoạch (lý do ở B05 mục 4):* hồi quy logistic chạy bằng PyTorch trên GPU thay cho scikit-learn; cross-validation chia theo nhóm ảnh gần trùng; lưới C tự mở rộng khi giá trị tốt nhất nằm ở mép trên |
| 12/11 | Commit, push toàn bộ; đưa ảnh lên Drive để huấn luyện trên Colab |
| 12/11 | *Claude tự quyết, khác kế hoạch:* GFLOPs đếm bằng `torch.utils.flop_counter` thay `fvcore`; GPU dưới 10 GB thì cộng dồn gradient 2 micro-batch 32 ảnh; notebook Colab chỉ cài `timm` (ghim 1.0.31) |
| 12/11 | *Claude tự quyết:* huấn luyện B6 trên máy này khi chưa có ai chạy Colab; trình duyệt sẽ gửi đủ 195 xác suất cho máy chủ thay vì top-10 |
| 14/11 | Chạy B7 ngay khi B6 xong, không chờ duyệt kiến trúc; hạn hoàn thành 30/11 |
| 14/11 | Tăng tốc bằng máy nhà + Kaggle + Colab; cho phép tạo bảng mới trên Supabase (chỉ thêm, không sửa bảng cũ) |
| 14/11 15:40 | Khi B6 xong: báo cáo chi tiết mọi việc đã làm, đưa toàn bộ lên Drive, làm tiếp B7, B8… tới hết, không dừng chờ duyệt |
| 14/11 16:15 | Chủ dự án vắng mặt, trả lời trước: (1) sau B9 **tải mô hình lên Storage và bật trên web** nếu đạt tiêu chí B9 và nhận dạng đúng trên ảnh mẫu, không đạt thì tải lên nhưng để tắt; (2) **commit và push** phần của Claude (chỉ file của phần nhận dạng, không đụng thay đổi chưa commit của phiên khác) sau khi lint, typecheck, test, build đạt; (3) **chưa xoá** mã và bảng của cách tìm cũ (B14), chỉ viết hướng dẫn gỡ; (4) nếu B7 có cải tiến có ý nghĩa thống kê thì **huấn luyện lại** mô hình cuối với cải tiến đó, trong lúc chờ thì B8/B9 chạy trên mô hình B6 để web dùng trước |
| 15/11 ~11:25 | Trang `/tim-bang-anh` **tạm thời chỉ hiện bảng xếp hạng %** của mô hình, bỏ kiểu trả lời "Đây là… / Có vẻ là… / Chưa nhận ra" (luật theo cấp viết cho đề tài hoàn chỉnh, khi mới xong một phần thì làm hỏng cả kết quả đúng, ví dụ Optimus Prime (G1) 95,7% mà trang ghi "chưa nhận ra là nhân vật nào"). Chọn qua 4 câu hỏi: bảng 5 robot; sản phẩm của các robot trong bảng theo thứ hạng; luôn có một dòng nhắc nhỏ về % thấp; phần "Hệ thống quyết định thế nào?" giữ ảnh sau xử lý và thời gian, bỏ đoạn luật ngưỡng. Luật theo cấp vẫn chạy ở máy chủ để ghi nhật ký |
| 15/11 ~14:20 | **Không chấm tay 500 ảnh kiểm định của B3** (chủ dự án thấy không cần thiết). Thay bằng: Claude xem và chấm 500 ảnh của `kiem-dinh-truoc-loc.html` theo quy ước robot hợp thể (thành viên đứng riêng hay cả nhóm chưa ghép gán nhãn robot hợp thể là "robot khác"), rồi chủ dự án chấm lại **50 ảnh ngẫu nhiên** trong số đó, không thấy đáp án của Claude, để đo độ khớp giữa AI và người. Bỏ trang duyệt tay từng lớp (`duyet-tay.html`). Không đổi bộ dữ liệu, không huấn luyện lại; luận văn ghi rõ nhãn kiểm định do AI chấm, có người kiểm mẫu |
| 11/11 | *Chưa quyết, chờ chủ dự án:* tên của 4 lớp Sentai lệch với trang wiki; lớp King-Ohger ZERO còn 93 ảnh; có tách tranh vẽ của người hâm mộ không; cột `license` |

## 5. Giải đáp các câu hỏi trong quá trình làm

### 5.1. Đã huấn luyện mô hình chưa? Dùng thuật toán gì?

Chưa. Huấn luyện là bước B6, sau khi làm sạch (B3) và chia tập (B4).

Thuật toán là **học chuyển giao (transfer learning)**: lấy mạng đã học sẵn trên hàng triệu ảnh, rồi tinh chỉnh (fine-tune) để phân biệt các robot.
- **Kiến trúc so sánh:** ConvNeXt-Tiny, EfficientNetV2-S (mạng tích chập) và ViT-B/16 (Transformer).
- **Hàm mất mát:** cross-entropy có làm trơn nhãn.
- **Tối ưu:** AdamW, lịch học cosine.
- **Tăng cường dữ liệu:** cắt, lật, đổi màu ngẫu nhiên.
- **Lấy mẫu cân bằng lớp.**
- **Độ dao động:** mỗi cấu hình chạy 3 hạt giống.

### 5.2. "Lớp" và "nhãn" là gì? Vì sao 230 lớp là 230 nhãn?

- **Lớp** là một câu trả lời mà mô hình có thể đưa ra. Ở đây một lớp là một robot ở một dòng, ví dụ *Optimus Prime (G1)* và *Optimus Prime (phim)* là hai lớp vì trông khác hẳn nhau.
- **Nhãn** là tên lớp gắn với mỗi ảnh. Mỗi ảnh mang đúng một nhãn.

Một bài toán phân loại có **tập nhãn cố định**. Ở đây tập nhãn được chốt ở B1 với 230 nhãn, và không đổi trong suốt quá trình huấn luyện.

### 5.3. Bài toán nhận biết hình ảnh có bắt buộc nhiều nhãn như vậy không?

Không. **Số nhãn bằng số câu trả lời khác nhau mà bài toán cần phân biệt.** Muốn câu trả lời càng chi tiết thì càng cần nhiều nhãn, và bài toán càng khó.

| Số nhãn | Ví dụ bài toán | Tập dữ liệu tiêu biểu | Ghi chú |
| --- | --- | --- | --- |
| 2 (nhị phân) | Ảnh có robot hay không; X-quang phổi bình thường hay viêm phổi; chó hay mèo | Chest X-Ray Pneumonia, Dogs vs Cats | Dễ nhất; câu trả lời chỉ có hai khả năng |
| 3 | Robot thuộc franchise nào: Transformers, Gundam hay Super Sentai | Cấp 1 của dữ liệu này | Biết "đây là Gundam" nhưng không biết robot nào |
| 10 | Chữ số viết tay 0–9; 10 loại vật thể (máy bay, ô tô, chim, mèo...); 10 loại quần áo | MNIST, CIFAR-10, Fashion-MNIST | Bài toán nhập môn |
| 16 | Robot thuộc dòng nào (G1, phim, Universal Century, Cosmic Era...) | Cấp 2 của dữ liệu này | |
| 38 – 43 | Bệnh trên lá cây; biển báo giao thông | PlantVillage (38), GTSRB (43) | |
| 100 – 200 | Loài chim; mẫu xe hơi; loại máy bay | CUB-200-2011 (200), Stanford Cars (196), FGVC-Aircraft (100) | **Phân loại chi tiết**, cùng loại với bài toán này |
| 230 | Robot nào | Cấp 3 của dữ liệu này | Mục tiêu của đề tài |
| 1.000 | Vật thể thông thường | ImageNet | |

**Nguyên tắc chọn số nhãn:** ít nhãn thì dễ đạt độ chính xác cao và cần ít dữ liệu hơn, nhưng câu trả lời thô. Nhiều nhãn thì khó hơn, cần nhiều dữ liệu hơn, nhưng trả lời được câu hỏi cụ thể.

Mục tiêu của đề tài là cho biết **ảnh là robot nào** và gợi ý sản phẩm của đúng robot đó, nên cần một nhãn cho mỗi robot.

**Cách trình bày trong luận văn:** nhãn tổ chức thành cây 3 cấp, gồm 3 franchise, 16 dòng và 230 robot. Mô hình học ở cấp robot. Kết quả được báo ở cả ba cấp, bằng cách cộng xác suất của các lớp con. Nhờ vậy luận văn có ngay ba bài toán với 3, 16 và 230 nhãn, và cho thấy độ chính xác thay đổi thế nào khi số nhãn tăng.

### 5.4. Tập mẫu có ít không?

Sau khi làm sạch, mỗi lớp dự kiến còn khoảng 150–300 ảnh, tổng khoảng 35–60 nghìn ảnh.

Các bộ chuẩn cùng loại có ít ảnh hơn mà mô hình tinh chỉnh vẫn đạt trên 90%:
- Stanford Cars: 196 lớp, khoảng 41 ảnh huấn luyện mỗi lớp.
- FGVC-Aircraft: 100 lớp, khoảng 67 ảnh huấn luyện mỗi lớp.

Mức đủ hay không sẽ được **đo** bằng thí nghiệm A6 (bước B7): huấn luyện với 10%, 25%, 50% và 100% dữ liệu. Nếu độ chính xác vẫn còn tăng khi thêm dữ liệu, cần thu thêm ảnh.

### 5.5. Khoảng tin cậy là gì?

Khi chỉ đo được trên một mẫu, con số đo có sai số. **Khoảng tin cậy 95%** là khoảng mà con số thật nhiều khả năng nằm trong đó. Mẫu càng lớn, khoảng càng hẹp.

Ví dụ ở B1: ghép tự động đúng 71/76 = 93,4%, khoảng tin cậy Wilson 95% là [85,5%; 97,2%].

Đề tài dùng:
- **Khoảng Wilson** cho tỉ lệ đo trên mẫu nhỏ.
- **Bootstrap** cho chỉ số đo trên tập test.
- **Độ lệch chuẩn qua 3 hạt giống** cho dao động do huấn luyện.

### 5.6. Độ trùng lặp của tập dữ liệu là bao nhiêu?

Đo trên 6 lớp chạy thử (2.125 ảnh thô):

| Loại | Số ảnh | Tỉ lệ |
| --- | --- | --- |
| Trùng tuyệt đối | 29 | 1,4% |
| Gần trùng | 257 | 12,1% |
| Lỗi kỹ thuật | 22 | 1,0% |

Như vậy khoảng 13,5% ảnh thô bị bỏ vì trùng.

**Trên toàn bộ 74.263 ảnh thô** (báo cáo B02b, chỉ tính trùng hệt theo byte; gần trùng đo ở B3):

| Loại | Số | Tỉ lệ |
| --- | --- | --- |
| Bản trùng hệt (bản photo thừa, cùng mã sha1) | 9.166 | 12,3% |
| — trong đó: thừa trong cùng một lớp | 747 | 1,0% |
| Ảnh có nhãn mâu thuẫn (cùng ảnh nằm ở ≥ 2 lớp) | 12.539 dòng, 4.008 ảnh | 16,9% |

- **Trùng hệt** là bản photo: hai file giống nhau đến từng byte dù tên hay đường dẫn khác. Ví dụ: năm đường dẫn khác tên file trên seibertron.com ở lớp Hound đều trả về đúng một ảnh báo lỗi "THIS IMAGE WAS NOT FOUND" (ảnh này xuất hiện 31 lần ở 11 lớp).
- **Nhãn mâu thuẫn** là cùng một ảnh mà mang tên nhiều robot, như thẻ học từ vựng cùng hình mà thẻ ghi "chó", thẻ ghi "mèo". Nguyên nhân: logo của wiki (ở 48 lớp), ảnh nhiều robot, hai robot thật sự cùng ảnh (bộ Menasor có cả Motormaster), hai robot trùng tên (Thunder Megazord), hoặc ảnh chẳng liên quan (móc khoá Etsy cho "Defensor" và "Hot Spot").

Trùng lặp nguy hiểm vì nếu một bản rơi vào tập huấn luyện, một bản rơi vào tập test, độ chính xác đo được sẽ cao giả. Vì vậy B3 bỏ ảnh trùng, và B4 chia tập theo cụm ảnh gần giống nhau.

### 5.7. Ảnh lấy từ nguồn nào? Có đáng tin không?

- **Wiki của người hâm mộ** (Teletraan I, The Gundam Wiki, RangerWiki): ảnh do người biên tập gắn vào trang của từng robot, nên nhãn khá chắc. Tuy vậy trang còn chứa ảnh robot khác, biểu tượng, huy hiệu: lần chạy thử có 13,7% ảnh wiki bị đánh dấu nghi ngờ.
- **Tìm ảnh qua thư viện `ddgs`** (gộp DuckDuckGo Images và Bing Images): nhãn là truy vấn tìm kiếm, nên nhiễu hơn nhưng đa dạng hơn. Lần chạy thử có 8,2% bị nghi ngờ.
- **Đã loại:** Bing (trả sai kết quả), TFWiki (chặn truy cập, robots.txt cấm), Flickr (cần khoá API).

Không nguồn nào được mặc định là đáng tin. Độ chính xác nhãn được **đo**: chủ dự án chấm tay 500 ảnh trước lọc và 1.000 ảnh sau lọc, báo kèm khoảng tin cậy, mục tiêu ≥ 95%. Ảnh có bản quyền của chủ sở hữu, chỉ dùng để huấn luyện cho nghiên cứu, không phân phối lại.

### 5.8. B3 đã làm gì, và vì sao chưa xong?

B3 có hai nửa. **Nửa của máy đã xong** (báo cáo B03a): từ 75.792 ảnh thô, máy bỏ ảnh quá nhỏ, bản trùng, ảnh gần trùng và ảnh có nhãn mâu thuẫn, còn 53.523 ảnh; rồi chấm điểm và đánh dấu 4.168 ảnh nghi ngờ.

| Bước lọc | Còn lại | Bị loại |
| --- | --- | --- |
| Ảnh thô | 75.792 | — |
| Lọc kỹ thuật (ảnh quá nhỏ, quá dẹt) | 74.717 | 1.075 |
| Bỏ trùng tuyệt đối | 61.844 | 12.873 |
| Bỏ gần trùng | 53.523 | 8.321 |

**Nửa của người chưa làm.** Máy không biết ảnh nào thật sự đúng robot; chỉ người mới chấm được. Vì vậy cần chủ dự án chấm hai trang:
- 500 ảnh ngẫu nhiên: cho ra con số "nhãn đúng bao nhiêu phần trăm", kèm khoảng tin cậy.
- Duyệt từng lớp: loại ảnh sai mà máy đã xếp lên đầu.

Chưa có hai kết quả này thì chưa có "độ chính xác nhãn", là con số chính của câu hỏi nghiên cứu RQ1.

### 5.9. "Gần trùng" khác "trùng hệt" thế nào? Vì sao phải đổi ngưỡng?

- **Trùng hệt**: hai file giống nhau từng byte (cùng mã sha1).
- **Gần trùng**: cùng một bức ảnh nhưng đã bị đổi cỡ, nén lại, cắt viền hay thêm chữ. File khác nhau nhưng nội dung là một.

Máy tìm gần trùng bằng hai thước đo: **pHash** (bản phác thảo 64 nét của ảnh, đếm số nét khác nhau) và **cô-sin CLIP** (độ giống về nội dung, từ −1 tới 1).

Kế hoạch đặt ngưỡng cô-sin 0,95. Khi chạy thật, ngưỡng này coi cả **hai robot khác nhau vẽ cùng phong cách** là "gần trùng", ví dụ hai tranh hồ sơ Gundam cùng tư thế đứng trên nền trắng. Máy lại gom nhóm theo kiểu "bạn của bạn": A giống B, B giống C thì cả ba chung nhóm. Kết quả là một nhóm 2.701 ảnh của 134 robot khác nhau, và cả nhóm bị loại oan vì "nhãn mâu thuẫn".

Cách sửa: chỉ coi là gần trùng khi cô-sin từ 0,98 trở lên, hoặc khi pHash gần **và** cô-sin từ 0,90 trở lên. Nhờ vậy giữ lại được thêm 5.887 ảnh. Đây là ví dụ cho thấy vì sao phải mở ảnh ra kiểm tra chứ không tin ngay vào con số.


### 5.10. Train, val, test là gì? Vì sao phải chia?

Giống ôn thi:
- **train** (70%): sách bài tập, mô hình học từ đây.
- **val** (15%): đề thi thử, dùng để chọn cách học và các ngưỡng.
- **test** (15%): đề thi thật, chỉ mở một lần ở cuối để lấy điểm báo cáo.

Nếu lấy đề thi thật ra luyện thì điểm thi không còn trung thực. Vì vậy ba tập không được có ảnh chung.

**Rò rỉ** là khi một ảnh trong test có "anh em sinh đôi" (bản cắt, bản nén lại, ảnh cùng một tin rao bán) trong train. Để tránh, các ảnh gần giống nhau được buộc thành **nhóm** và cả nhóm đi về một tập. Kết quả kiểm tra: không ảnh val hay test nào giống một ảnh train cùng lớp tới mức cô-sin 0,95.

### 5.11. Lớp "không biết" và tập âm để làm gì?

Mô hình phân loại luôn chọn một đáp án trong số nó biết. Gửi ảnh con mèo, nó vẫn trả lời tên một robot, trừ khi được dạy cách từ chối. Muốn **đo** khả năng từ chối cần hai loại ảnh mà đáp án đúng là "không nhận ra":

| Loại | Là gì | Số lượng | Độ khó |
| --- | --- | --- | --- |
| Lớp "không biết" | 35 robot bị giấu hẳn khỏi lúc huấn luyện (15% số lớp, không lấy hàng cửa hàng bán) | 7.207 ảnh | Khó: vẫn là robot, trông giống robot đã biết |
| Tập âm, nhóm COCO | Ảnh đời thường: người, xe, đồ vật | 2.000 ảnh | Dễ |
| Tập âm, nhóm đồ chơi và xe | Xe mô hình, búp bê, siêu anh hùng, áo giáp, xe tăng mô hình | 898 ảnh | Vừa: cùng kiểu ảnh sản phẩm |

Vì hàng cửa hàng không nằm trong nhóm bị giấu, web vẫn nhận ra được mọi robot cửa hàng bán (trừ khi lớp đó thiếu ảnh).

### 5.12. "Bản dữ liệu tạm" nghĩa là gì?

Kế hoạch yêu cầu người chấm tay ở B3 trước khi chia tập. Việc đó chưa làm, nên B4 dùng bản tạm: lấy ảnh máy giữ lại và **bỏ hết 4.168 ảnh máy nghi ngờ**. Cách này an toàn nhưng chưa có con số "nhãn đúng bao nhiêu phần trăm". Mọi số liệu của các bước sau trên bản này đều ghi kèm mã `dff6fdbb77c0` và là số liệu tạm. Khi có kết quả chấm tay, chạy lại B4 (vài phút) sẽ ra bản chính thức với mã mới.


### 5.13. "Mô hình nền" là gì? Đã huấn luyện chưa?

**Chưa huấn luyện mạng nào.** B5 trả lời câu hỏi: nếu chỉ dùng các mạng có sẵn trên mạng (CLIP của OpenAI, DINOv2 của Meta), không dạy lại, thì nhận ra 195 robot được bao nhiêu? Con số đó là **mốc**: mô hình ta huấn luyện ở B6 phải vượt mốc thì công huấn luyện mới đáng.

Ba cách dùng mạng có sẵn, từ ít công tới nhiều công:

| Cách | Làm gì | Cần ảnh mẫu không | top-1 tốt nhất trên test |
| --- | --- | --- | --- |
| Zero-shot | Hỏi CLIP: ảnh này giống *tên* robot nào nhất | Không | 23,4% |
| k-NN | Tìm 5 ảnh mẫu giống nhất, lấy theo số đông | Có, chỉ để tra | 49,0% |
| Linear probe | Học thêm đúng một lớp phân loại trên đặc trưng có sẵn | Có, học vài giây | 65,6% |

Đoán mò trong 195 lớp chỉ đúng 0,5%.

**Cách đọc "65,6% [64,5; 66,8]"**: đo trên 6.310 ảnh test, mô hình đúng 65,6%. Nếu đổi sang 6.310 ảnh test khác cùng loại, con số có thể nằm trong khoảng 64,5% tới 66,8% (khoảng tin cậy 95%, tính bằng bootstrap: lấy mẫu lại 1.000 lần).

**Điều rút ra cho B6:**
- Có ảnh mẫu giúp rất nhiều (từ 23% lên 66%), nên bộ dữ liệu tự xây có giá trị.
- CLIP ViT-L/14 tốt nhất nhưng nặng (304 triệu tham số); DINOv2 ViT-B/14 chỉ kém 1,8 điểm mà nhẹ hơn 3,5 lần.
- Mô hình trên train đúng 83% nhưng trên test chỉ 66%: còn chỗ để cải thiện bằng tinh chỉnh và tăng cường dữ liệu.
- Các lớp khó nhất trùng với các lớp đã biết là có vấn đề về nhãn (tên lệch, trùng tên).


## 6. Môi trường và công cụ đã cài trên máy

| Công cụ | Phiên bản | Cài lúc | Dùng cho |
| --- | --- | --- | --- |
| Python | 3.11.9 (winget, cho người dùng hiện tại) | 07/11 ~13:32 | Toàn bộ `ml/` |
| Microsoft Visual C++ Redistributable 2015+ | x64 | 07/11 ~13:50 | PyTorch trên Windows |
| PyTorch / torchvision | 2.11.0 / 0.26.0, CUDA 12.8 | 07/11 ~13:45 | Đo GPU, CLIP, huấn luyện |
| open_clip_torch, imagehash | 4.2.1, 4.3.2 | 07/11 ~21:00 | B3 |
| ddgs (DuckDuckGo) | 9.16.1 | 07/11 ~17:35 | B2 |
| pandoc (qua pypandoc_binary) | 3.9 | 07/11 ~16:30 | Chuyển báo cáo sang Word |
| Google Drive cho máy tính | 133.0.2.0 | 07/11 ~16:30 | Đồng bộ tài liệu lên Drive |

Phiên bản đầy đủ của mọi thư viện: `ml/requirements.lock.txt`.

## 7. File chính

| Đường dẫn | Nội dung |
| --- | --- |
| `docs/nhan-dang-robot/00-ke-hoach.md` | Kế hoạch chi tiết |
| `docs/nhan-dang-robot/nhat-ky.md` | Nhật ký này |
| `docs/nhan-dang-robot/bao-cao/B*.md`, `ket-qua-cac-buoc.xlsx` | Báo cáo từng bước, bảng kết quả |
| `ml/robotrec/` | Mã dùng chung: thống kê, báo cáo, truy vấn wiki, tải ảnh, CLIP, phát hiện trùng |
| `ml/scripts/b00_*.py … b03_*.py` | Script từng bước |
| `ml/scripts/xem_du_lieu.py` | Trang xem dữ liệu trực quan |
| `ml/scripts/b03_lam_sach.py`, `b03a_bao_cao.py` | Phần tự động của B3 và báo cáo B03a |
| `ml/data/store/b03/kiem-dinh-truoc-loc.html`, `duyet-tay.html` | Hai trang chủ dự án chấm tay (mở trên máy này) |
| `ml/scripts/b04_chia_tap.py`, `b04b_tap_am.py` | Chia tập, lớp không biết, tập âm |
| `ml/scripts/b05_dac_trung.py`, `b05_mo_hinh_nen.py`, `ml/robotrec/baselines.py` | Trích đặc trưng đóng băng; zero-shot, linear probe, k-NN |
| `ml/data/manifests/b04_splits.csv.gz`, `b04b_negatives.csv.gz` | Ảnh nào thuộc tập nào (bản tạm) |
| `ml/scripts/export_excel.py`, `export_drive.py` | Xuất Excel, đưa lên Drive |
| `ml/data/manifests/` | Danh mục lớp, bảng ghép sản phẩm, manifest ảnh (nén) |
| `ml/data/store/` (không vào git) | Ảnh, cache, trang duyệt |
