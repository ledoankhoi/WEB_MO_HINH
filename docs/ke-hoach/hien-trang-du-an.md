# Hiện trạng dự án ROBOTICA

Kiểm tra ngày 17/11/2026 trên bản làm việc của máy THINKPAD (gồm cả phần chưa commit) và trên CSDL Supabase thật (chỉ đọc). File này thay cho `viec-con-lai.md` (12/11/2026).

## Cập nhật cuối ngày 17/11/2026: đã làm theo mục 5

| Việc ở mục 5 | Kết quả |
|---|---|
| 1. Commit phần đang dở | **Xong.** 8 commit theo mạch việc, đã quét bí mật, đã đẩy lên GitHub (`f893468` … `33930fe`). Thư mục làm việc sạch |
| 3. Tài liệu luận văn | **Xong phần chính:** viết mới `02-use-case.md` (33 use case, 3 sơ đồ use case, 8 đặc tả, 4 sơ đồ hoạt động, 4 sơ đồ tuần tự); `03` thêm mục 14 cho 23 migration kèm 5 sơ đồ ERD; `05` thêm mục 12–16; `06` thêm mục 2b và 8 route; `07` có kết quả toàn dự án; `01` đối chiếu lại cột hiện trạng (46/50 có sau khi chốt YC-GH-03); `README` chuẩn cập nhật. 17 sơ đồ Mermaid đều vẽ được (kiểm bằng `mermaid-cli`) |
| 4. Chỗ thiếu nhỏ | **Xong:** YC-DM-04 (thương hiệu, series trên trang sản phẩm), YC-TK-01 (tìm theo thương hiệu, series, SKU), YC-DH-01 (ba trạng thái ở danh sách đơn), YC-3D-03 (5 góc nhìn cố định, nút toàn màn hình), sửa ô tìm của quản trị, 4 dáng Grimlock, `.env.example` có biến SMTP. Có test mới; 404 test qua; đã xem trong trình duyệt thật ở cả màn hình 390 px |
| YC-GH-03 | **Chủ dự án chốt: phải đăng nhập mới đặt hàng.** Đã cài đặt (trang `/thanh-toan` chuyển sang đăng nhập rồi quay lại; Server Action từ chối khi không có phiên; `test/checkout-login.test.ts`) |
| Còn chờ chủ dự án (đang chuẩn bị) | Ảnh cho B13 (mục 2); tài khoản SMTP và VNPay sandbox (mục 5.5); giấy tờ để mở bán (mục 6) |

**Đính chính:** mục 4 trước đây ghi "Tải file `.glb` ngay trong quản trị: chưa làm". Ghi như vậy là **sai**: trang sửa sản phẩm đã có phần tải mô hình (`ModelUpload`, tải thẳng lên Storage bằng URL có chữ ký, có `test/model-upload.test.ts`). Dòng đó đã được bỏ khỏi mục 4.

## 0. Tóm tắt

| | Số mục | Ví dụ |
|---|---|---|
| **Hoàn thành** | Phần lớn dự án | Cửa hàng 30 trang, quản trị 49 trang, kho, đơn hàng, 6 trang mở rộng, AI nhận dạng robot B0–B12 và B14 |
| **Có nhưng chưa xong** | 12 nhóm | Nhiều code chưa commit; VNPay chưa thử đầu-cuối; email chưa gửi thật; 4 chỗ thiếu so với đặc tả; 7 trang thông tin còn nháp; tài liệu use case, ERD, kiểm thử còn thiếu hoặc cũ; B13 |
| **Chưa làm** | 10 mục | MoMo, phí ship theo địa chỉ, GHN/GHTK, đánh giá kèm ảnh, gợi ý cá nhân hoá, trả góp, OTP qua SMS... |

**Kết luận:**
- Mã nguồn chạy ổn: mọi bộ kiểm tra đều đạt.
- Phần luận văn còn thiếu: B13 (thử với ảnh thật), tài liệu use case và UML, cập nhật ERD và kết quả kiểm thử.
- **Rủi ro lớn nhất hiện nay** là 37 file sửa và 29 file mới chưa commit. Trong số đó có code của một migration đã chạy trên Supabase.

## 1. Đã kiểm tra những gì

| Kiểm tra | Kết quả |
|---|---|
| Test Vitest (`npx vitest run --maxWorkers=4`) | 61 file, **403 test đạt**. 1 file bỏ qua (`recognition-parity`, chỉ chạy khi có thư mục mô hình trên máy) |
| Kiểm tra kiểu (`npm run typecheck`) | Không lỗi |
| Lint (`npm run lint`) | Không lỗi |
| Test Python của `ml/` (`pytest ml/tests`) | **69 test đạt** |
| Build production (`npm run build`) | Đạt, 178 trang tĩnh |
| Mở thử mọi trang (`npm run smoke` + bản bổ sung) | **105 đường dẫn**, gồm cả 19 trang mà `smoke` không mở tới (gacha, nhiệm vụ, trưng bày, truyện tranh, cộng đồng, xưởng, tin tức, quên mật khẩu, 5 trang quản trị). Tất cả trả đúng mã, không có dấu hiệu lỗi; trừ một điểm nhỏ ở mục 3.6 |
| Quyền ở Server Action và API | Đọc lướt 27 file action và 20 route: mọi hàm của quản trị gọi `staffWith`/`authorize`, hàm của khách gọi `currentUser`; API công khai có giới hạn tần suất. Không thấy hàm nào thiếu kiểm tra |
| Bí mật trong git | Không thấy khoá hay mật khẩu trong các file đã commit |
| CSDL thật (chỉ đọc) | Số liệu ở mục 2.8 |
| Tài liệu | Đối chiếu `docs/chuan/`, `docs/ke-hoach/`, `docs/nhan-dang-robot/` với mã |

## 2. Hoàn thành

### 2.1. Cửa hàng (30 trang)

- **Mua sắm:**
  - Trang chủ; danh sách sản phẩm có khối lọc (danh mục, giá, thương hiệu, series, còn hàng, biến hình, sắp xếp).
  - Trang chi tiết với tab Xem 3D và Ảnh thật, đánh giá, hỏi đáp, combo.
  - Giỏ hàng, mã giảm giá, flash sale có đếm ngược, so sánh tối đa 4 mẫu, yêu thích, đã xem gần đây, báo khi có hàng.
- **Đặt hàng:**
  - Thanh toán COD, chuyển khoản VietQR, VNPay (sandbox).
  - Hàng sắp về, đặt trước và đặt cọc.
  - Trang theo dõi đơn, tra cứu đơn, huỷ đơn, trả hàng kèm ảnh, mua lại, hoá đơn VAT.
- **Tài khoản:**
  - Đăng ký và đăng nhập (mật khẩu; Google/Facebook có code).
  - Quên mật khẩu, xác thực email bằng OTP.
  - Cài đặt: hồ sơ, sổ địa chỉ, bảo mật, nhận tin, tải dữ liệu cá nhân, tự xoá tài khoản.
- **Giao tiếp:** chat với cửa hàng, tin tức, trang Giới thiệu dành cho hội đồng (`/gioi-thieu`).
- **SEO:** sitemap, robots.txt, dữ liệu có cấu trúc JSON-LD.

### 2.2. Quản trị và kho (49 trang, tên miền riêng)

- **Phân quyền:**
  - 9 vai trò nhân viên, ma trận quyền nằm một chỗ.
  - Thiếu quyền thì trả 404.
  - Mọi thao tác ghi nhật ký.
  - Tài khoản bị khoá mất phiên ngay.
- **Thông báo việc đang chờ:** 17 loại, có huy hiệu số, thông báo nổi và số việc trên tiêu đề tab.
- **Bán hàng:**
  - Đơn hàng có ba trạng thái và luật L2–L15.
  - Đối chiếu chuyển khoản, đơn chờ hoàn tiền, trả hàng, hoá đơn.
  - Đặt trước, flash sale, combo, mã giảm giá.
- **Kho:**
  - Sổ kho; phiếu nhập, xuất, điều chỉnh, kiểm kê.
  - Thẻ kho, vị trí, lấy hàng và đóng gói, khu cách ly.
  - Đối soát kho; giá vốn bình quân gia quyền; nhà cung cấp.
- **Hàng hoá:** sản phẩm và biến thể, chụp ảnh đại diện từ mô hình 3D khi lưu, danh mục, thương hiệu, series.
- **Khách hàng:** danh sách khách, khách chờ hàng, chat, hỏi đáp, đánh giá, duyệt bài cộng đồng.
- **Nội dung:** banner, menu, trang thông tin, tin tức, cài đặt, hộp thư email.
- **Báo cáo và hệ thống:** tổng quan, báo cáo bán hàng, xuất CSV, nhân viên, nhật ký.
- **AI:** tìm bằng ảnh kiểu cũ (lập chỉ mục, hiệu chỉnh) và nhận dạng robot (`/admin/nhan-dien`: nhập danh mục robot, bật mô hình, ghép robot với sản phẩm).

### 2.3. Nghiệp vụ bán hàng (`nghiep-vu-ban-hang.md`)

| Đã xong | Mục |
|---|---|
| ✓ | 1 Email (nền tảng), 2 Quên mật khẩu, 3 Email báo đơn, 4 Trả hàng và hoàn tiền |
| ✓ | 8 Đã xem và mua lại, 9 Flash sale, 10 Đặt trước, 11 Hỏi đáp, 12 Combo |
| ✓ (phần mã) | 14 Đăng nhập Google/Facebook, 15 OTP qua email, 16 Chat, 17 Hoá đơn VAT (bản in nháp) |
| ✓ | 19 So sánh, 20 SEO |

### 2.4. Trang mở rộng

Trưng bày, Truyện tranh, Nhiệm vụ và xu, Gacha (2 series; máy quay, gói 5 thẻ, hộp mù; mảnh ghép; thưởng đủ bộ), Cộng đồng (đăng bài, duyệt, báo cáo vi phạm), Xưởng tuỳ biến (mọi lựa chọn hiện trên mô hình 3D). Cả 6 trang mở được, không lỗi.

### 2.5. Mô hình 3D

- Xoay, phóng to; biến hình và các dáng có sẵn cho những mô hình có clip hoạt ảnh.
- Phủ màu, bóc tách; ảnh thay thế khi máy không có WebGL hoặc tải mô hình lỗi.
- Ghi nguồn và giấy phép (CC BY) dưới khung 3D.

### 2.6. AI

| Phần | Hiện trạng |
|---|---|
| **Nhận dạng robot** (đề tài luận văn) | B0–B12 và B14 xong. Bộ dữ liệu 230 robot, 75.792 ảnh thô. Mô hình cuối ViT-B/16 (CLIP) + Mixup/CutMix đúng **79,6–80,0%** trên tập test (195 lớp), đúng franchise 97,7%, hơn mốc 65,6% của B5 khoảng 14 điểm. File ONNX fp16 164 MB chạy trong trình duyệt. **Đang bật trên web** từ 15/11/2026 20:57 (mô hình `…-s44`) |
| **Tìm bằng ảnh kiểu cũ** | Vẫn còn, 76/76 sản phẩm đã lập chỉ mục. Chỉ chạy khi tắt mô hình nhận dạng (đường lui, theo quyết định ngày 14/11) |
| **Tài liệu luận văn phần AI** | Kế hoạch, nhật ký, báo cáo 8 mục cho từng bước, Excel tổng hợp, bản Word trên Drive. Có thêm 5 tài liệu giải thích: B05, B06, CLIP và DINOv2, kiến trúc B06, các mô hình |

### 2.7. Kiểm thử và công cụ

403 test Vitest, 69 test Python, `smoke`, `test:pg`, sao lưu (`npm run backup`), sinh dữ liệu mẫu ba phần, các script tải và nhập mô hình nhận dạng.

### 2.8. Dữ liệu trên Supabase (17/11/2026)

| Mục | Số liệu |
|---|---|
| Sản phẩm | 76 đang bán, 5 đã lưu trữ; 81 biến thể |
| Đơn hàng | 493 đơn (408 hoàn tất, 64 huỷ, 17 đang xử lý, 1 đã xác nhận, 3 chờ). **Chỉ 4 đơn không phải dữ liệu mẫu** |
| Tài khoản | 153 khách; 10 nhân viên (3 quản trị viên và 7 vai trò khác) |
| Nhận dạng | 2 mô hình (1 đang bật), 233 robot, 73 robot đã ghép với sản phẩm, 11 lượt nhận dạng |
| Khác | 8 yêu cầu trả hàng, 4 đợt đặt trước đang mở, 49 bài cộng đồng (3 chờ duyệt) |
| Sức khoẻ dữ liệu kho | Không có dòng tồn âm hoặc giữ hàng vượt tồn |

## 3. Có nhưng chưa hoàn thành

### 3.1. Code chưa commit: rủi ro cao nhất

- **Quy mô:** 37 file đã sửa (+888/−151 dòng) và 29 file hoặc thư mục mới **chưa commit**. Phần này gồm:
  - chuyển khoản VietQR và đối chiếu (`bank-transfer`, `/admin/don-hang/chuyen-khoan`);
  - việc định kỳ (`/api/cron/dinh-ky`, `netlify/functions/dinh-ky.mts`; hàm cũ `vnpay-doi-soat` đã xoá trên máy);
  - trang Giới thiệu (`/gioi-thieu`);
  - dữ liệu mẫu phần hai và ba;
  - các sửa đổi ở gacha, đặt trước, sản phẩm;
  - tài liệu giải thích luận văn.
- **Điểm nguy hiểm nhất:** migration `sale_13_chuyen_khoan` **đã chạy trên Supabase**, nhưng code của nó chỉ có trên máy này.
- **Hệ quả:**
  - Máy hỏng là mất code.
  - Trang trên Netlify (build từ GitHub) không có các tính năng này, và vẫn chạy hàm định kỳ cũ.
- **Việc cần làm:** rà rồi commit và push theo từng mạch việc.

### 3.2. Thanh toán và dịch vụ bên ngoài: code xong, chưa chạy thật

| Mục | Hiện trạng |
|---|---|
| VNPay | Code sandbox xong (ký, IPN, tra cứu, hoàn tiền qua API). **CSDL chưa có lượt thanh toán VNPay nào** (`payment_attempts` rỗng, không có đơn VNPay), tức chưa thử đầu-cuối trên sandbox (bước C8). `.env.local` của máy không có `VNPAY_*`. Chưa có tài khoản thật |
| Email | **1.790 thư chỉ được ghi lại, chưa gửi thật** (chưa cấu hình SMTP). Khách chưa nhận được thư xác nhận đơn, quên mật khẩu hay OTP |
| Chuyển khoản | Code xong (chưa commit). `.env.local` không có `BANK_*`, nên trên máy này trang thanh toán chỉ có COD |
| Google/Facebook | Code xong, chưa tạo ứng dụng OAuth |
| Hoá đơn VAT | Chỉ có bản in nháp, chưa nối nhà cung cấp hoá đơn điện tử |
| Việc định kỳ | Code xong, cần `CRON_SECRET` trên Netlify; chưa kiểm được nó có chạy trên Netlify không |

### 3.3. Chỗ thiếu so với đặc tả (`01-dac-ta-yeu-cau.md`)

| Mã | Thiếu gì |
|---|---|
| YC-DM-04 | Trang sản phẩm chưa hiện thương hiệu và series |
| YC-TK-01 | Ô tìm ở cửa hàng chỉ tìm theo tên, tagline, mô tả; chưa tìm theo thương hiệu, series, SKU |
| YC-DH-01 | Danh sách đơn ở `/tai-khoan` chỉ hiện trạng thái đơn, chưa hiện trạng thái thanh toán và vận chuyển |
| YC-3D-03 | Chưa có chế độ toàn màn hình và các góc nhìn cố định cho khung 3D |
| YC-GH-03 | **Khác đặc tả:** khách chưa đăng nhập vẫn đặt hàng được, trong khi đặc tả bắt đăng nhập. Cần quyết định giữ cách nào |
| YC-DM-05 | Đổi biến thể chưa đổi màu của mô hình 3D dựng sẵn |
| YC-TK-02 | Chưa lọc theo tình trạng mới hay đã dùng |

Cột "Hiện trạng" của đặc tả cũng ghi sai nhiều mục đã làm, như YC-DM-01, YC-3D-04, YC-GH-04, YC-QT-04, YC-TKH-04.

### 3.4. Nội dung và dữ liệu

- **7 trang thông tin** (giới thiệu, liên hệ, câu hỏi thường gặp, đổi trả, vận chuyển, bảo mật, điều khoản) **đang là nháp**, khách không xem được. Chân trang cũng không có liên kết tới chúng. Bán thật thì bắt buộc phải có các trang này.
- **Thông tin liên hệ là số mẫu** (`src/config/site.ts`): `0900 000 000`, `cskh@robostore.example`, "Số 1 Đường Mẫu".
- **Cả 81 biến thể chưa có cân nặng và kích thước.** Cần có trước khi tính phí ship theo hãng vận chuyển.
- **Ảnh thật:** 67/76 sản phẩm đã có, còn 9 sản phẩm chưa có. Các ảnh này là link tới cửa hàng bán lẻ khác, chỉ dùng cho luận văn; bán thật phải thay bằng ảnh tự chụp.
- **Mô hình 3D:**
  - 21 mô hình không có clip hoạt ảnh.
  - Grimlock (`grimlock`) có 4 clip dạng khủng long nhưng chưa khai báo thành dáng.
  - Sazabi và Mazinger Z Jet Scrander hiện màu trắng, vì file gốc không có màu.
- **Danh mục sản phẩm:** 76 mẫu, trong khi quyết định ban đầu ghi "trên 500".

### 3.5. AI nhận dạng robot

| Mục | Hiện trạng |
|---|---|
| **B13 thử nghiệm thực địa** | **Chưa làm.** Cần ít nhất 150 ảnh không lấy từ nguồn thu thập: khoảng 60 ảnh tự chụp mô hình thật, 40 ảnh chụp màn hình phim hoặc anime, 25 ảnh robot ngoài danh mục, 25 ảnh không phải robot. Đây là số liệu trả lời RQ6 |
| Chất lượng nhãn | B3 không chấm tay: AI chấm 500 ảnh, chủ dự án kiểm 50 ảnh. Khoảng 73% ảnh tải về đúng nhãn. Phân tích 100 ảnh đoán sai cho thấy 44% là do **nhãn sai**. Làm sạch thêm sẽ cho số liệu thật hơn |
| Giao diện khách | Tạm thời chỉ hiện bảng 5 robot kèm phần trăm. Câu trả lời theo cấp (franchise, nhân vật, dòng) chỉ được ghi vào nhật ký, theo quyết định ngày 15/11 |
| Kích thước mô hình | 164 MB tải ở lần dùng đầu. Bản int8 chưa đạt (chỉ trùng 91% với PyTorch) |
| Cách cũ | Chưa gỡ, theo quyết định. Hướng dẫn gỡ ở `docs/nhan-dang-robot/huong-dan-go-cach-cu.md` |
| Việc chờ chủ dự án quyết (nhật ký mục 4) | Tên 4 lớp Sentai lệch với trang wiki; lớp King-Ohger ZERO ít ảnh; có tách tranh vẽ của người hâm mộ không; cột giấy phép trong manifest |

### 3.6. Lỗi nhỏ tìm thấy

- **Ô tìm sản phẩm trong quản trị** không thoát ký tự `%` và `_` ([products.ts:690](../../src/server/repo/products.ts#L690)).
  - Nguyên nhân: chuỗi `ESCAPE '\'` nằm trong dấu nháy kép của JavaScript nên thành `ESCAPE ''`.
  - Hệ quả: gõ `_` thì khớp mọi ký tự. Ô tìm ở cửa hàng (dòng 258) đã đúng.
- **Trang không có thật vẫn trả mã 200 thay vì 404.**
  - Ví dụ: `/trang/doi-tra` (đang nháp). Nội dung nháp không bị lộ, nhưng vì `notFound()` nằm trong `<Suspense>` nên mã trả về là 200.
  - Công cụ tìm kiếm có thể lập chỉ mục những trang "không tìm thấy" này. Ảnh hưởng nhỏ.

### 3.7. Tài liệu (trường yêu cầu: đặc tả, use case và UML, ERD, kiến trúc, API, kiểm thử)

| Tài liệu | Hiện trạng |
|---|---|
| `02-use-case.md` | **Chưa viết:** sơ đồ use case, đặc tả use case, sơ đồ hoạt động, sơ đồ tuần tự |
| `03-co-so-du-lieu.md` | Dòng tình trạng vẫn ghi "bản thiết kế, chưa cài đặt". Chưa có bảng của **23 migration** sau `016` (017, 018, ext_01–07, sale_01–13, nd_01) |
| `07-kiem-thu.md` | Kết quả mới có phần quản trị, kho (16/10) và tìm bằng ảnh (04/11); chưa có 403 test hiện nay, kết quả smoke, phần bán hàng, thanh toán, AI |
| `05-kien-truc.md`, `06-api.md` | Chưa có VNPay, email, việc định kỳ, gacha, nhận dạng robot, chuyển khoản |
| `01-dac-ta-yeu-cau.md` | Cột "Hiện trạng" cũ (mục 3.3) |
| `chuan/README.md` | Dòng của file 08 vẫn mô tả tìm bằng ảnh kiểu cũ là "đóng góp chính". Bản thân file 08 đã được viết lại ngày 15/11 |
| `.env.example` | Thiếu `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `DATABASE_POOL_MAX` |
| Bản thảo luận văn | Chưa thấy trong repo. Bảng ánh xạ chương ở `nhan-dang-robot/00-ke-hoach.md` mục 10 |

## 4. Chưa làm

| Việc | Ghi chú |
|---|---|
| MoMo | Cần hợp đồng; kế hoạch ở `thanh-toan-va-van-chuyen.md` bước D |
| Phí ship theo địa chỉ, địa chỉ phường/xã, GHN và GHTK | Bước E, F, G. Phí ship hiện cố định 30.000 ₫, miễn phí từ 1 triệu |
| Đánh giá kèm ảnh, video | Mục 7. Bảng `review_media` trên CSDL thuộc nơi khác, phải dùng tên khác |
| Gợi ý cá nhân hoá và ghi nhận hành vi (YC-HV-01 – 04) | Mới có tài liệu nghiên cứu ở `docs/AI/`. Nơi khác dùng chung CSDL đã tạo `events`, `rec_models`, `rec_similar` |
| Trả góp | Cần hợp đồng cổng thanh toán |
| OTP qua SMS | Cần nhà cung cấp SMS |
| Nối hoá đơn điện tử | Cần nhà cung cấp |
| Tìm theo mô tả chữ | |
| AR, so sánh kích thước thật, "đơn hàng như nhiệm vụ" | Chỉ có ảnh ý tưởng `docs/12-di-dong-ar-nhiem-vu.jpg` |
| Việc người thật làm trước khi mở bán | Rà pháp lý (Luật Thương mại điện tử, dữ liệu cá nhân, thuế), kiểm tra sao lưu Supabase, nghiệm thu với người dùng (UAT), hướng dẫn vận hành (SOP), giấy tờ kinh doanh, tên miền, thông báo website với Bộ Công Thương (`10-quan-tri-va-kho.md` mục 8, `thanh-toan-va-van-chuyen.md` mục 3) |

## 5. Nên làm theo thứ tự

1. **Commit và push phần đang làm dở** (mục 3.1), quét bí mật trước khi commit.
2. **B13:** chụp và gom ít nhất 150 ảnh thật. Việc này chỉ chủ dự án làm được, và là số liệu còn thiếu của luận văn.
3. **Tài liệu luận văn:** viết `02-use-case.md`; cập nhật 03 (ERD), 07 (kiểm thử), 05, 06, cột hiện trạng của 01.
4. **Lấp chỗ thiếu nhỏ** (mục 3.3, 3.6): thương hiệu và series trên trang sản phẩm, tìm theo thương hiệu và SKU, ba trạng thái ở danh sách đơn, nút toàn màn hình 3D, sửa ô tìm của quản trị, khai báo dáng Grimlock. Quyết định chuyện khách chưa đăng nhập có được đặt hàng không.
5. **Thử VNPay sandbox đầu-cuối** (bước C8) và cấu hình SMTP thử, để luận văn có bằng chứng các luồng này chạy được.
6. **Mở bán thật:** chỉ khi có giấy tờ. Gồm nội dung trang thông tin, thông tin liên hệ, ảnh tự chụp, cân nặng biến thể, MoMo, GHN và GHTK, các biến môi trường trên Netlify.

## 6. Không kiểm tra được lần này

- **Trang trên Netlify:** có đang chạy không, biến môi trường, hàm định kỳ có chạy không. Kết nối Netlify đang tắt và không có địa chỉ trang.
- **Trong trình duyệt thật:** khung 3D, hoạt ảnh gacha, nhận dạng robot (tải 164 MB, tốc độ trên điện thoại). `smoke` chỉ kiểm tra HTML trả về, không chạy JavaScript.
- **Không chạy:** `npm run test:pg` (khoảng 20 phút trên Supabase thật), `npm run models:audit`, đo tốc độ production.
- **Không đọc kỹ từng dòng mã:** báo cáo dựa trên các bộ kiểm tra tự động, đối chiếu tài liệu và đọc có trọng điểm (quyền, thanh toán, nhận dạng).
