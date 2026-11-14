# Nhật ký thực hiện: nhận dạng robot từ ảnh

Tài liệu này ghi lại mọi việc đã làm, theo thứ tự thời gian: việc gì, kết quả ra sao, quyết định nào, sự cố nào và cách xử lý. Mục đích là để viết phần thực hiện của luận văn đầy đủ, có bằng chứng.

**Quy ước**
- Giờ Việt Nam (UTC+7). Dấu "~" là thời điểm ước lượng.
- Các mốc khác lấy từ thời điểm tạo file, log hoặc báo cáo trên máy.
- Báo cáo chi tiết của từng bước nằm ở `docs/nhan-dang-robot/bao-cao/` và thư mục Drive *ROBOTICA - Nhận dạng robot / Báo cáo*.
- Từ đây, nhật ký được cập nhật sau mỗi việc.

## 1. Tiến độ theo kế hoạch

| Bước | Nội dung | Trạng thái (12/11/2026) | Báo cáo |
| --- | --- | --- | --- |
| B0 | Môi trường, đo năng lực phần cứng | Xong | B00-moi-truong |
| B1 | Danh mục 230 robot (nhãn) | Xong, chủ dự án đã duyệt | B01-danh-muc-robot |
| B2 | Thu thập ảnh | **Xong, đạt tiêu chí**: 75.792 ảnh thô, 230 lớp (201–650 ảnh mỗi lớp, trung vị 317) sau lần thu bổ sung 7 lớp ngày 11/11; đo trùng lặp ở B02b | B02-thu-anh, B02a-thu-anh-chay-thu (chạy thử), B02b-trung-lap |
| B3 | Làm sạch, kiểm định nhãn | **Phần máy xong** (11/11): còn 53.523 ảnh sau lọc tự động, 4.168 ảnh nghi ngờ chờ duyệt. **Đang chờ chủ dự án chấm tay** hai trang (500 ảnh kiểm định, duyệt từng lớp); sau đó mới có độ chính xác nhãn và báo cáo B03 | B03a-lam-sach-tu-dong (phần máy) |
| B4 | Chia tập, lớp không biết, tập âm | **Xong trên bản dữ liệu tạm** (11/11): 49.355 ảnh; train 29.513 / val 6.325 / test 6.310 (195 lớp); 35 lớp không biết (7.207 ảnh); tập âm 2.898 ảnh; rò rỉ cùng lớp bằng 0. Chạy lại khi có kết quả chấm tay của B3 | B04-chia-tap, B04b-tap-am |
| B5 | Mô hình nền (đặc trưng đóng băng) | **Xong trên bản dữ liệu tạm** (12/11): mốc tốt nhất là CLIP ViT-L/14 + linear probe, top-1 trên test 65,6% [64,5; 66,8], top-5 84,6%, macro-F1 63,5%; zero-shot tốt nhất 23,4%, k-NN tốt nhất 49,0% | B05-mo-hinh-nen |
| B6 | Huấn luyện chính | **Đang chạy** (tiến trình riêng từ 13/11 13:53): xong 1/9 lần (ConvNeXt-Tiny hạt giống 42: val top-1 75,7%, macro-F1 73,4%, hơn mốc B5 10,3 điểm); báo cáo tạm B06 | B06-huan-luyen (tạm) |
| B7 | Thí nghiệm phụ | Script đã viết và chạy thử trên CPU (12/11); chờ B6 chọn kiến trúc | — |
| B8 | Đánh giá toàn diện | **Đã viết và chạy trên mốc B5** (12/11): báo cáo B08a; chờ mô hình B6 để chạy bản chính | B08a-danh-gia-moc-b05 |
| B9 | Xuất ONNX, nén | Script đã viết và chạy thử trọn vòng với mô hình chạy thử của B6 (12/11); chờ mô hình chính | B09-chay-thu-xuat-onnx (chạy thử) |
| B10 – B14 | Đưa lên web, thử nghiệm thực địa | Đã viết và kiểm thử phần logic nhận dạng dùng chung cho trình duyệt và máy chủ (`src/lib/recognition.ts`, khớp Python trên 48 ca mẫu); chưa đụng CSDL, API, giao diện (chờ chủ dự án duyệt sau B8) | — |

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
