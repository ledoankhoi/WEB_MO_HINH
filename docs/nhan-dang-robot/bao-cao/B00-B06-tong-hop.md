# Tổng hợp: mọi việc đã làm từ B0 tới B6 (07–14/11/2026)

Báo cáo này gom lại toàn bộ phần đã làm của đề tài nhận dạng robot từ ảnh, từ lúc lập kế hoạch (07/11) tới khi xong huấn luyện chính B6 (14/11). Mỗi bước có báo cáo chi tiết riêng trong cùng thư mục; ở đây chỉ tóm tắt kết quả, cách làm, sự cố, quyết định và việc còn lại, viết cho người đọc chưa quen học máy. Mốc giờ chi tiết ở [nhat-ky.md](../nhat-ky.md).

## 1. Tóm tắt một trang

**Bài toán.** Khách gửi một ảnh robot, web cho biết đó là robot nào (ví dụ "Optimus Prime – G1"), thuộc dòng nào, kèm thông tin robot và mô hình cửa hàng đang bán. Cách cũ (so ảnh với hình dựng từ mô hình 3D bằng CLIP không huấn luyện) từ chối 13/14 lượt thật, nên chủ dự án quyết định xây lại bằng học có giám sát.

**Đã có:**

| Hạng mục | Kết quả |
| --- | --- |
| Danh mục (B1) | 230 robot của Transformers (110), Gundam (70), Super Sentai / Power Rangers (50); ghép tự động đúng 71/76 sản phẩm của cửa hàng (93,4%, KTC 95% [85,5; 97,2]) |
| Ảnh thu thập (B2) | 75.792 ảnh thô, mọi lớp ≥ 201 ảnh (trung vị 317) |
| Làm sạch tự động (B3, phần máy) | Còn 53.523 ảnh (70,6%); 4.168 ảnh bị đánh dấu nghi ngờ, chờ người duyệt |
| Chia tập (B4) | 195 robot đã biết: train 29.513 / val 6.325 / test 6.310 ảnh; 35 robot "lạ" (7.207 ảnh) để thử khả năng từ chối; 2.898 ảnh không phải robot; **rò rỉ cùng lớp giữa train và test: 0** |
| Mô hình nền (B5) | Tốt nhất: đặc trưng CLIP ViT-L/14 đóng băng + hồi quy logistic, top-1 trên test **65,6%** [64,5; 66,8] |
| Huấn luyện chính (B6) | 9 lần chạy (3 kiến trúc × 3 hạt giống). ViT-B/16 khởi tạo từ CLIP tốt nhất: top-1 trên val **78,85 ± 0,39%**, macro-F1 **76,64 ± 0,43%**, hơn ConvNeXt-Tiny 73,25 ± 0,23% và EfficientNetV2-S 71,59 ± 0,42%; hơn mốc B5 khoảng 13 điểm top-1 |
| Chuẩn bị B7–B9 | Script thí nghiệm phụ, đánh giá toàn diện, xuất ONNX đã viết và chạy thử trọn vòng |
| Web (B10, B11) | 4 bảng mới trên CSDL, trang quản trị nhập robot và mô hình, API `POST /api/nhan-dien`, trang khách; tiền xử lý ảnh trong trình duyệt **trùng từng byte** với Python |
| Hạ tầng | Chạy song song máy nhà + Kaggle (2 phiên GPU T4) + Colab, có điều phối tự động và dự phòng |

**Câu hỏi nghiên cứu đã trả lời được tới đâu:**

| Mã | Câu hỏi | Trạng thái |
| --- | --- | --- |
| RQ1 | Chất lượng nhãn của bộ dữ liệu tự thu? | **Chưa**: cần chủ dự án chấm tay 500 ảnh kiểm định (B3) |
| RQ2 | Tinh chỉnh hơn đặc trưng đóng băng bao nhiêu? | Sơ bộ trên val: hơn 10–13 điểm top-1, McNemar p < 0,001. Số cuối trên test ở B8 |
| RQ3 | Kiến trúc nào cân bằng nhất? | Độ chính xác: ViT > ConvNeXt > EfficientNetV2 (B6). Phần kích thước và tốc độ trong trình duyệt ở B9 |
| RQ4 | Kỹ thuật nào đóng góp bao nhiêu? | B7, đang chạy |
| RQ5 | Từ chối ảnh lạ, độ tin có đúng không? | Mốc B5: AUROC robot lạ 0,713, ECE sau hiệu chỉnh 0,048. Bản chính ở B8 |
| RQ6 | Độ chính xác ngoài thực tế? | B13, cần bộ ảnh tự chụp |

## 2. Bối cảnh và mục tiêu

- **Vì sao đổi cách làm.** Bảng `image_search_logs` trên CSDL có 14 lượt tìm thật: 13 lượt bị từ chối vì hạng 1 và hạng 2 chỉ chênh 0,0001–0,0162 điểm. Nguyên nhân: ảnh dựng từ mô hình 3D khác xa ảnh chụp, CLIP đóng băng không phân biệt được các robot giống nhau, và ngưỡng chưa từng được hiệu chỉnh.
- **Quyết định ngày 07/11:**
  - Huấn luyện mô hình riêng trên bộ dữ liệu độc lập với web.
  - Nhận dạng robot nói chung, không chỉ hàng đang bán.
  - Ảnh lấy từ nguồn công khai, chỉ dùng nghiên cứu.
  - Mô hình chạy trong trình duyệt của khách.
- **Không có bộ dữ liệu công khai** gắn nhãn robot theo nhân vật (chỉ có một bộ Gundam/Zaku 198 ảnh, 2 lớp), nên bộ dữ liệu phải tự xây. Đây cũng là một đóng góp của luận văn.
- **Mỗi lớp là một robot ở một dòng** (cùng Optimus Prime nhưng G1 và phim người đóng là hai lớp, vì trông khác hẳn). Mỗi lớp có ba cấp để trả lời ở mức chắc chắn nhất: lớp → nhân vật → franchise.

## 3. Từng bước

### B0. Môi trường (07/11) — [B00-moi-truong](B00-moi-truong.md)

- **Máy:** i7-12800H, RAM 32 GB, GPU RTX A2000 Laptop 4 GB; Python 3.11.9, PyTorch 2.11 + CUDA 12.8.
- **Kiểm tra tái lập:** cùng hạt giống thì cùng loss và cùng trọng số (lệch 0,0).
- **Đo tốc độ** 3 kiến trúc ở các chế độ (tất định hay nhanh, fp16 hay fp32, bố cục bộ nhớ):
  - ConvNeXt-Tiny 158, EfficientNetV2-S 144, ViT-B/16 73 ảnh/giây (fp16).
  - fp32 chậm hơn 8–16 lần và tràn bộ nhớ 4 GB, nên **bắt buộc dùng fp16**.
  - Bố cục `channels_last` làm EfficientNetV2-S chậm 6,4 lần, nên tắt bố cục này cho mạng đó.
- **Sự cố đầu tiên với chế độ ngủ:** máy vào Modern Standby 68,6 phút giữa lúc đo. Đã thêm cơ chế giữ máy thức, và lần đo bị gián đoạn được loại khỏi số liệu.

### B1. Danh mục robot (07/11) — [B01-danh-muc-robot](B01-danh-muc-robot.md)

- **Nguồn:** đọc trang của 3 wiki (TFWiki, Gundam Wiki, RangerWiki) qua API MediaWiki.
- **Chọn lớp:** xếp theo độ phổ biến (độ dài trang, số liên kết đến), ưu tiên robot có sản phẩm trong cửa hàng.
- **Gộp và làm sạch:**
  - Gộp 56 cặp Power Rangers – Super Sentai là cùng một robot.
  - Gộp 17 biến thể Gundam.
  - Sửa 6 lỗi danh mục, chi tiết trong báo cáo.
- **Kết quả:** 230 lớp; ghép tự động đúng 71/76 sản phẩm. 5 ca sai rơi vào ba kiểu: tên sản phẩm không ghi dòng, tên khác tên trang wiki, cấu hình trang bị có trang riêng. Vì vậy vẫn cần quản trị xác nhận ghép.
- **Chủ dự án đã duyệt** danh sách lớp và bảng ghép.

### B2. Thu thập ảnh (07–11/11) — [B02-thu-anh](B02-thu-anh.md), [B02b-trung-lap](B02b-trung-lap.md)

- **Nguồn:**
  - Thư viện ảnh wiki, chiếm khoảng 13%.
  - Tìm ảnh qua thư viện `ddgs`, chiếm khoảng 87%. Đọc mã nguồn mới biết thư viện này gộp cả DuckDuckGo lẫn Bing, nên báo cáo ghi đúng như vậy.
- **Nguồn bị loại:**
  - Bing gọi riêng trả ảnh robot Tesla cho truy vấn "Optimus Prime".
  - TFWiki chặn truy cập vì lưu lượng lớn; ảnh wiki Transformers lấy từ Teletraan I thay thế.
- **Kết quả:**
  - 75.792 ảnh, cạnh dài ≤ 512 px, khoảng 6,2 giờ có tải.
  - Sau lần thu bổ sung 7 lớp ngày 11/11, mọi lớp đạt ≥ 200 ảnh.
- **Trùng lặp (B02b):**
  - 12,3% ảnh là bản trùng hệt nhau.
  - 4.131 ảnh mang nhãn mâu thuẫn (cùng ảnh nằm ở nhiều lớp). Nhóm lan rộng nhất là logo và banner của trang web, có ảnh nằm ở tới 48 lớp.
  - Quyết định: B3 loại cả nhóm có nhãn mâu thuẫn.

### B3. Làm sạch (phần máy, 11/11) — [B03a-lam-sach-tu-dong](B03a-lam-sach-tu-dong.md)

- **Phễu lọc:**
  1. Lọc kỹ thuật (ảnh hỏng, quá nhỏ, tỉ lệ khung lạ).
  2. Bỏ trùng tuyệt đối.
  3. Bỏ ảnh gần trùng (pHash + đặc trưng CLIP).
  4. Đánh dấu ảnh nghi ngờ: điểm liên quan thấp theo CLIP zero-shot, hoặc là ngoại lai trong lớp.
- **Sửa luật gần trùng** (khác kế hoạch, có bằng chứng):
  - Luật của kế hoạch nối cả các robot khác nhau vẽ cùng phong cách thành một cụm 2.701 ảnh của 134 lớp.
  - Luật mới: cô-sin ≥ 0,98, hoặc pHash ≤ 6 bit kèm cô-sin ≥ 0,90.
  - Nhờ vậy giữ thêm 5.887 ảnh, và cụm lớn nhất chỉ còn 24 ảnh.
- **Kết quả:** còn 53.523 ảnh (70,6%), mỗi lớp 93–406 ảnh. 4.168 ảnh nghi ngờ (7,8%): đây là cận trên của số ảnh cần người duyệt, không phải số ảnh sai.
- **Chưa xong:** phần chấm tay gồm 500 ảnh kiểm định (cho RQ1) và duyệt từng lớp. Công cụ đã có: `ml/data/store/b03/kiem-dinh-truoc-loc.html`.

### B4. Chia tập (11/11) — [B04-chia-tap](B04-chia-tap.md), [B04b-tap-am](B04b-tap-am.md)

- **Bản dữ liệu tạm:** giữ ảnh phần máy để lại, bỏ hết ảnh nghi ngờ, còn 49.355 ảnh. Mã phiên bản `dff6fdbb77c0`. Sẽ chạy lại khi có kết quả chấm tay của B3.
- **Cách chia:** gom ảnh gần giống nhau thành nhóm, rồi chia theo nhóm (StratifiedGroupKFold), để hai ảnh gần giống nhau không rơi vào hai tập khác nhau.
- **35 lớp "không biết"** được giữ riêng, không dùng để huấn luyện, để đo khả năng từ chối robot lạ.
- **Tập âm** (ảnh không phải robot): 2.000 ảnh COCO + 898 ảnh đồ chơi và xe.
- **Kiểm tra:**
  - 0 ảnh val/test gần trùng (cô-sin ≥ 0,95) với ảnh train cùng lớp.
  - Phân bố miền ảnh giữa ba tập như nhau (p = 0,619).
  - Robot lạ trông giống robot đã biết gần bằng chính robot đã biết (cô-sin trung vị 0,891 so với 0,899). Vì vậy từ chối robot lạ sẽ là phần khó nhất.

### B5. Mô hình nền (11–12/11) — [B05-mo-hinh-nen](B05-mo-hinh-nen.md), [B08a-danh-gia-moc-b05](B08a-danh-gia-moc-b05.md)

- **Cách làm:** dùng 5 mạng đóng băng (CLIP ViT-B/32, B/16, L/14; DINOv2 ViT-S/14, B/14), mỗi mạng thử ba cách: zero-shot, hồi quy logistic (linear probe) và k-NN. Tham số chọn bằng cross-validation 5 phần theo nhóm; khoảng tin cậy bằng bootstrap 1.000 lần; so sánh bằng McNemar có hiệu chỉnh Holm.
- **Kết quả trên test:**
  - Linear probe trên CLIP ViT-L/14 tốt nhất: top-1 65,6%, top-5 84,6%, macro-F1 63,5%.
  - Zero-shot tốt nhất 23,4%; k-NN tốt nhất 49,0%.
  - Cả 9 so sánh có ý nghĩa thống kê.
- **Đánh giá đủ bộ của B8 trên mốc này (B08a):**
  - Đúng ở cấp nhân vật 67,6%, cấp franchise 96,5%.
  - Hiệu chỉnh độ tin: T = 0,71, ECE 0,204 → 0,048.
  - Từ chối: robot lạ AUROC 0,713; ảnh không phải robot AUROC 0,889.
- **Ý nghĩa:** đây là con số mô hình tinh chỉnh phải vượt.

### B6. Huấn luyện chính (12–14/11) — [B06-huan-luyen](B06-huan-luyen.md)

- **Cách làm:** tinh chỉnh 3 mạng đã huấn luyện sẵn (`timm`): ConvNeXt-Tiny (CNN, 28 triệu tham số), EfficientNetV2-S (CNN nhẹ, 20 triệu), ViT-B/16 khởi tạo từ CLIP (Transformer, 86 triệu).
- **Công thức giống nhau cho cả ba:**
  - Tăng cường mạnh: RandomResizedCrop, lật, RandAugment, ColorJitter, RandomErasing.
  - Làm trơn nhãn ε = 0,1.
  - Lấy mẫu cân bằng lớp theo căn bậc hai số ảnh.
  - Hai pha: 2 epoch chỉ học đầu phân loại, sau đó tinh chỉnh toàn mạng. AdamW, lịch học cosine, fp16.
  - Tối đa 30 epoch, dừng sớm theo macro-F1 trên val.
- **Hạt giống:** 3 hạt giống (42, 43, 44) cho mỗi kiến trúc để đo độ dao động.

**Kết quả trên val** (trung bình ± độ lệch chuẩn qua 3 hạt giống; tập test để dành cho B8):

| Kiến trúc | Top-1 | Top-5 | Macro-F1 | Tham số | GFLOPs |
| --- | --- | --- | --- | --- | --- |
| ViT-B/16 (CLIP) | **78,85 ± 0,39** | **89,29 ± 0,45** | **76,64 ± 0,43** | 85,9 triệu | 33,7 |
| ConvNeXt-Tiny | 75,65 ± 0,14 | 86,28 ± 0,10 | 73,25 ± 0,23 | 28,0 triệu | 8,9 |
| EfficientNetV2-S | 74,01 ± 0,38 | 85,53 ± 0,10 | 71,59 ± 0,42 | 20,4 triệu | 5,7 |

- **Kiến trúc được chọn** theo luật của B06 (macro-F1 trung bình cao nhất, ưu tiên mạng nhẹ hơn nếu không kém có ý nghĩa): **ViT-B/16 (CLIP)**. ViT hơn ConvNeXt-Tiny 2,7–3,6 điểm top-1 ở cả ba cặp cùng hạt giống (McNemar, p sau Holm < 0,001), nên không thể đổi sang mạng nhẹ hơn. Đổi lại ViT nặng gấp 3 lần (86 so với 28 triệu tham số) và tốn gấp 4 lần phép tính, nên chạy chậm hơn trên trình duyệt; B9 đo cái giá này.
- **Từng hạt giống của ViT:** top-1 78,40 / 79,04 / 79,11%, macro-F1 76,15 / 76,90 / 76,88%. Hạt giống 42 dừng sớm ở epoch 22 (tốt nhất epoch 17), hai hạt giống còn lại chạy đủ 30 epoch.
- **Nhận xét:**
  - Mọi mô hình tinh chỉnh đều hơn hẳn mốc B5 (≥ 10 điểm top-1, McNemar p < 0,001).
  - Độ dao động giữa các hạt giống rất nhỏ (độ lệch chuẩn ≤ 0,4 điểm), nên chênh lệch giữa ba kiến trúc là thật.
  - Khoảng cách giữa top-1 trên ảnh train và trên val là 19–24 điểm: mô hình học thuộc ảnh train, dấu hiệu quá khớp. B7 (A6, đường học theo lượng dữ liệu) sẽ đo xem thêm dữ liệu còn giúp được bao nhiêu.
  - ConvNeXt có epoch tốt nhất luôn ở cuối lịch học, nên có thể còn tăng chút ít nếu học thêm epoch. Điều này được ghi vào phần giới hạn.

### Đã chuẩn bị cho B7–B9 (12/11)

- **B7:** Mixup/CutMix, suy luận thêm ảnh lật (TTA), script 6 thí nghiệm A1–A6; chạy thử trên CPU đạt.
- **B8:** temperature scaling; các chỉ số ECE, MCE, NLL, Brier; điểm "lạ" MSP, max-logit, năng lượng; AUROC, AUPR, FPR@95, OSCR; luật trả lời theo cấp kèm tìm ngưỡng; Grad-CAM; UMAP; trang để chủ dự án gán loại lỗi. Đã chạy đủ trên mốc B5.
- **B9:** xuất ONNX và các bản fp32, fp16, int8 động, int8 tĩnh. Chạy thử trên mô hình nhỏ: fp16 nặng 53,5 MB (2 phần) và trùng top-1 với PyTorch 99,8%. int8 tĩnh hỏng vì lượng tử hoá cả phép Add/Mul của nhánh dư; đã sửa để chỉ lượng tử hoá Conv/MatMul/Gemm.

### Web: B10 (CSDL, quản trị) và B11 (trình duyệt, API, trang khách) — 14/11

- **Bốn bảng mới** trên Supabase: `robots`, `robot_products`, `recognition_models`, `recognition_logs`. Trước khi tạo đã kiểm tra tên bảng trên CSDL thật (78 bảng, không trùng).
  - Chỉ thêm, không sửa bảng cũ.
  - Nhật ký nhận dạng không lưu ảnh.
- **Trang quản trị `/admin/nhan-dien`:**
  - Nhập `robots.json` và model card, có kiểm tra cấu trúc, slug, số nhãn và URL.
  - Bật mô hình (mô hình cũ tự tắt), ghép robot với sản phẩm (gợi ý từ B1).
  - Thống kê 30 ngày; số liệu từng bước đọc từ model card.
- **Trình duyệt khách:**
  - Tiền xử lý ảnh chép đúng thuật toán của Pillow và torchvision, và **trùng từng byte** với Python trên 7 ảnh mẫu.
  - Chạy mô hình ONNX trong Web Worker (WASM), tính xác suất, áp luật theo cấp.
  - Chỉ gửi xác suất lên máy chủ, không gửi ảnh.
- **API `POST /api/nhan-dien`:**
  - Kiểm tra mã mô hình và xác suất, giới hạn 30 lượt/phút.
  - Áp lại luật theo cấp bằng cùng một hàm với trình duyệt.
  - Trả robot, 4 khả năng khác và sản phẩm đang bán; ghi nhật ký.
- **Trang `/tim-bang-anh`:** dùng nhận dạng khi có mô hình đang bật; chưa bật thì giữ cách cũ.
- **Test:** 80 test cho phần nhận dạng: logic dùng chung khớp Python trên 48 ca mẫu, tiền xử lý, API, nhập dữ liệu, CSDL trên PGlite.

## 4. Hạ tầng tính toán và tăng tốc (14/11)

Máy nhà chạy hết 9 lần sẽ mất khoảng 22 giờ GPU. Vì hạn 30/11, chủ dự án quyết định chạy song song trên nhiều máy:

| Máy | GPU | Ghi chú đo được |
| --- | --- | --- |
| Máy nhà | RTX A2000 4 GB | ViT khoảng 500 giây/epoch (micro-batch 32 × 2 cộng dồn); EfficientNetV2-S chỉ chạy ở đây (BatchNorm phụ thuộc cỡ lô) |
| Kaggle | 2 × T4 15 GB, 4 CPU | Giới hạn 2 phiên GPU cùng lúc, 30 giờ/tuần. Hai việc chung một phiên thì nghẽn ở CPU (693 giây/epoch), nên mỗi việc một phiên: 185–283 giây/epoch, một lần ViT khoảng 2,4 giờ |
| Colab miễn phí | T4, 2 CPU | Ngày 14/11 không khởi động được trong 60 phút chờ; máy nhà tự nhận thay |

- **Bộ điều phối `ml/scripts/dieu_phoi.py`:**
  - Một hàng đợi chung, việc dài chạy trước. Máy nhà rảnh thì lấy việc kế tiếp; Kaggle còn chỗ thì đẩy việc kế tiếp.
  - Dự phòng:
    - Kaggle không có GPU → đẩy lại sau 5 phút.
    - Phiên Kaggle xếp hàng quá 10 phút trong lúc máy nhà rảnh → huỷ phiên đó, máy nhà làm.
    - Colab không bắt đầu sau 60 phút, hoặc ngừng ghi 45 phút → máy nhà làm tiếp từ checkpoint.
  - **Chạy trước B7:** khi còn chỗ trống, chạy luật chọn của B06 trên các lần chạy đã xong, đoán kiến trúc thắng rồi chạy trước việc B7 của kiến trúc đó. Nếu kết quả cuối khác thì huỷ các việc này.
  - Có 18 test giả lập vòng điều phối.
- **Tương đương giữa các máy:**
  - Cùng commit mã, cùng thứ tự dữ liệu theo hạt giống.
  - Với ViT và ConvNeXt (LayerNorm), một bước 64 ảnh trên GPU 16 GB tương đương 2 × 32 ảnh cộng dồn gradient trên máy nhà.
  - Báo cáo B06 ghi rõ máy của từng lần chạy.
- **Bộ ảnh trên Kaggle là bộ dữ liệu riêng tư** (35.838 ảnh train và val, 1,62 GB), chỉ dùng nghiên cứu.

## 5. Sự cố chính và cách xử lý

| Sự cố | Nguyên nhân | Xử lý | Ảnh hưởng tới số liệu |
| --- | --- | --- | --- |
| Máy ngủ nhiều lần (07/11 68,6 phút; 08/11 khoảng 420 phút; 13–14/11 huấn luyện đứng yên 14 giờ) | Modern Standby của Windows tạm dừng chương trình khi màn hình tắt; cơ chế giữ máy thức thiếu cờ giữ màn hình | Sửa `robotrec/awake.py` (thêm ES_DISPLAY_REQUIRED), thêm `giu_may_thuc.ps1`; báo cáo B06 tính giờ GPU bỏ phần máy ngủ | Không: chỉ chậm. Trọng số và kết quả không đổi |
| Lệnh chạy nền tắt khi phiên làm việc đóng (12–13/11) | Lệnh nền gắn với phiên | Chạy bằng tiến trình riêng, chạy tiếp từ checkpoint | Không |
| TFWiki chặn truy cập; Bing trả ảnh sai | Lưu lượng; nghi bị nhận là bot | Dùng Teletraan I; loại Bing | Nguồn ảnh Transformers |
| Luật gần trùng nối nhầm 134 lớp | Ngưỡng cô-sin 0,95 quá thấp với tranh cùng phong cách | Đổi luật, có bảng so sánh hai luật | Giữ thêm 5.887 ảnh |
| Kaggle chạy không có GPU (4 lần) | Tài khoản chưa xác minh số điện thoại | Chốt "không có GPU thì dừng", tự đẩy lại; chủ dự án xác minh | Không |
| Kaggle nghẽn CPU khi 2 việc chung một phiên | Máy Kaggle chỉ có 4 CPU | Mỗi việc một phiên | Không (mất khoảng 25 phút) |
| int8 tĩnh hỏng ở lần chạy thử B9 | Lượng tử hoá cả phép Add/Mul | Chỉ lượng tử hoá Conv/MatMul/Gemm | Đo lại trên mô hình chính |

## 6. Quyết định của chủ dự án và những chỗ khác kế hoạch

**Chủ dự án quyết định:**
- 07/11: hướng mới, phạm vi 3 franchise, nguồn ảnh công khai chỉ dùng nghiên cứu, mô hình chạy trong trình duyệt; duyệt danh sách 230 lớp.
- 11/11: làm tiếp B3, B4, B5 dù phần chấm tay B3 chưa xong (dùng bản dữ liệu tạm).
- 12/11: commit, push; đưa ảnh lên Drive.
- 14/11:
  - Chạy B7 ngay khi B6 xong; hạn hoàn thành 30/11.
  - Tăng tốc bằng máy nhà + Kaggle + Colab; cho tạo bảng mới trên Supabase.
  - Làm tiếp B7, B8… tới hết, không dừng chờ duyệt ở từng bước.

**Khác kế hoạch** (lý do ghi trong báo cáo từng bước):
- **B3:** đổi luật gần trùng.
- **B4:**
  - Dùng bản dữ liệu tạm.
  - Tiêu chí rò rỉ chỉ tính cặp ảnh cùng lớp.
  - Lấy tập âm gấp đôi.
- **B5:**
  - Hồi quy logistic chạy bằng PyTorch trên GPU.
  - Cross-validation chia theo nhóm ảnh.
- **B6:**
  - GFLOPs đếm bằng `torch.utils.flop_counter`.
  - GPU nhỏ thì cộng dồn gradient.
  - Chạy trên nhiều máy.
- **B10:**
  - Thêm cột `character` và `store_products`.
  - Bỏ cột `accepted`.
- **B11:**
  - Trình duyệt gửi đủ xác suất mọi lớp thay vì top-10 (luật theo cấp cần tổng mọi lớp).
  - Chưa bật WebGPU.

## 7. Hạn chế và việc còn lại

- **Chất lượng nhãn chưa được đo (RQ1).** Mọi số liệu tới giờ tính trên bản dữ liệu tạm, nhãn lấy từ truy vấn và trang wiki, chưa có người chấm. Phải có kết quả chấm 500 ảnh mới biết mức nhiễu nhãn.
- **Tập test lấy cùng nguồn với train** (ảnh trên mạng), nên độ chính xác thực tế với ảnh khách tự chụp có thể thấp hơn. B13 đo phần này.
- **Việc cần chủ dự án làm:**
  - B3: chấm 500 ảnh kiểm định.
  - B8: gán loại lỗi cho 100 ảnh đoán sai (trang HTML sinh sẵn).
  - B13: khoảng 150 ảnh thực địa.
- **Việc sẽ hỏi trước khi làm:**
  - Tải mô hình lên Supabase Storage và bật trên web.
  - Triển khai lên mạng (B12).
  - Xoá bảng của cách tìm cũ trên CSDL dùng chung (B14).
- **Tiến độ dự kiến:**
  - B7: khoảng 6–8 giờ sau B6, chạy song song trên máy nhà và Kaggle.
  - B8: dưới 1 giờ đánh giá, cộng một lần huấn luyện lại cho E7.
  - B9: dưới 1 giờ.
  - Sau đó là B11 (kiểm tra khớp trên ảnh thật), B12, B14.

## 8. Tái lập

| Mục | Giá trị |
| --- | --- |
| Commit mã | `dae3ab3` (B0–B5), `e0d7aa7` (B6), `c063837` (B7–B9, chạy nhiều máy); phần sau chưa commit |
| Phiên bản dữ liệu | B4 `dff6fdbb77c0`, tập âm `488bd3a0c832` |
| Cấu hình | `ml/configs/*.yaml` (mỗi bước một file, mã băm ghi trong `summary.json`) |
| Hạt giống | 42 (B1–B5), 42/43/44 (B6) |
| Lệnh | Ghi ở mục 8 của từng báo cáo; B6–B7: `ml/.venv/Scripts/python ml/scripts/dieu_phoi.py` |
| Số liệu máy đọc | `ml/reports/Bxx/summary.json`, bảng tổng hợp `ket-qua-cac-buoc.xlsx` |
| Test | Python `ml/tests/` (51 test thí nghiệm + 18 test điều phối); web `test/recognition*.test.ts` (80 test) |
