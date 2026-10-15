# Danh sách việc: quản trị website và quản lý kho

Đặc tả: [../chuan/10-quan-tri-va-kho.md](../chuan/10-quan-tri-va-kho.md). Dữ liệu: [../chuan/03-co-so-du-lieu.md](../chuan/03-co-so-du-lieu.md) (mục 4 và 12). Trạng thái: [../chuan/04-trang-thai.md](../chuan/04-trang-thai.md). Nhánh: `auto/quan-tri-kho`.

Ký hiệu: `- [ ]` chưa làm, `- [x]` xong, `- [!]` bị chặn (lý do ở mục Vướng mắc).

## Quy tắc chạy tự động

Áp dụng cho mọi phiên Claude Code chạy theo file này, kể cả khi không có người giám sát.

1. **Kiểm tra đầu phiên.** Chạy `git branch --show-current` và `git status`. Nếu nhánh hiện tại không phải `auto/quan-tri-kho` thì dừng ngay, ghi lý do vào mục Vướng mắc, không làm gì khác. Nếu còn thay đổi chưa commit thì đó là việc dở của phiên trước: đọc `git diff` và làm tiếp đúng việc đó. Nhưng nếu có file thay đổi rõ ràng không thuộc việc nào trong danh sách (ví dụ một phiên khác đang sửa phần 3D), thì không commit lẫn: chỉ `git add` đúng các file của việc mình đang làm, và ghi tên các file lạ vào mục Vướng mắc.
2. **Chọn việc.** Lấy việc `- [ ]` đầu tiên từ trên xuống, bỏ qua việc mà mục "Cần" của nó trỏ tới một việc chưa `[x]`. Mỗi phiên làm **một** việc.
3. **Đọc trước khi viết code.** `CLAUDE.md`, `AGENTS.md` (đọc tài liệu Next.js trong `node_modules/next/dist/docs/` cho API sắp dùng), các mục của tài liệu chuẩn mà việc đó trỏ tới, và mã nguồn liên quan. Viết code giống mã xung quanh: cách đặt tên, mật độ chú thích, giao diện tiếng Việt, màu lấy từ biến trong `globals.css`, các thành phần ở `src/components/ui` và `src/components/admin/parts.tsx`.
4. **Không hỏi người dùng.** Gặp lựa chọn nhỏ mà tài liệu chưa nói thì chọn phương án đơn giản nhất, khớp với tài liệu chuẩn, rồi ghi vào mục "Quyết định tự chọn" (ngày, mã việc, quyết định, lý do). Chỉ dừng khi việc thật sự không làm được (xem quy tắc 8).
5. **Điều kiện xong.** Tất cả phải đạt:
   - `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` đều qua.
   - Từ khi có T00: `npm run smoke` qua, và mọi trang mới đã được thêm vào danh sách trang của script.
   - Logic mới (luật trạng thái, tiền, kho, quyền, kiểm tra đầu vào) có test Vitest. Test cho kịch bản nghiệm thu đặt tên bắt đầu bằng mã kịch bản, ví dụ `it("WH-02: ghi sổ hai lần chỉ ghi một bộ dòng sổ kho", ...)`.
   - Mọi Server Action và Route Handler mới kiểm tra quyền theo bảng ở mục 3 của tài liệu 10 và kiểm tra dữ liệu đầu vào. Thao tác thuộc YC-QTN-04 ghi nhật ký.
   - Cột "Hiện trạng" ở `docs/chuan/01-dac-ta-yeu-cau.md` được cập nhật cho các yêu cầu vừa làm xong, nếu có.
6. **Commit.** Đánh `[x]` cho việc trong file này, rồi `git add -A` và commit **một** lần, nội dung tiếng Việt: dòng đầu `T05: <tóm tắt>`, các dòng sau liệt kê mã yêu cầu và mã kịch bản đã làm, dòng cuối `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không commit khi chưa đạt quy tắc 5.
7. **Không bao giờ:** `git push`, đổi nhánh, `git reset --hard`, sửa lịch sử commit; sửa một migration đã có trong commit trước (chỉ thêm migration mới ở cuối mảng); chạy `npm run media` hoặc `npm run models`; sửa hay in ra nội dung `.env*`; xoá `data/`; cài thư viện mới (trừ khi không có cách nào khác, và phải ghi lý do vào "Quyết định tự chọn"); tắt test, thêm `eslint-disable`, `@ts-ignore`, `it.skip` để cho qua.
8. **Khi bị chặn.** Nếu sau 3 hướng sửa khác nhau vẫn không đạt quy tắc 5, hoặc thiếu thông tin mà không tự chọn được: chuyển việc thành `- [!]`, ghi lý do và những gì đã thử vào mục Vướng mắc; với phần code chưa xanh thì chạy `git stash push -u -m "<mã việc> dở"` và ghi tên stash vào mục Vướng mắc; rồi commit riêng thay đổi của file này. Phiên sau sẽ làm việc kế tiếp không phụ thuộc vào việc bị chặn.
9. **Dọn dẹp.** Tắt mọi máy chủ phát triển đã bật trước khi kết thúc phiên. Không để file tạm trong repo.
10. **Hết việc.** Khi không còn việc `- [ ]` nào làm được, viết mục "Báo cáo cuối" ở cuối file này (đã xong gì, còn chặn gì, việc cần người thật làm theo mục 8 của tài liệu 10, cách kiểm tra nhanh), commit, rồi kết thúc.

Ghi nhớ kỹ thuật của dự án:
- Next.js 16 có Cache Components: đọc cookie, `params`, `searchParams` phải nằm trong component dưới `<Suspense>`; dữ liệu công khai của cửa hàng đi qua hàm `"use cache"` trong `src/server/catalog.ts`, ghi xong gọi `updateTag(...)`. Không gọi `Date.now()` lúc dựng trang; dùng giờ của CSDL hoặc gọi trong Server Action.
- SQL viết tay, tham số `?`, qua `getDb()` (`execute`, `batch`; `batch` là một giao dịch). Điều kiện trạng thái đặt ngay trong `UPDATE`. `src/server/repo/orders.ts` có sẵn hai mẫu nên dùng lại: (1) `SELECT ... FOR UPDATE` khoá dòng đầu `batch`, các lệnh sau kèm `AND EXISTS (... status IN (...))` nên lần gọi thứ hai không ghi gì (`cancelOrder`); (2) truy vấn con trả NULL vào cột NOT NULL khi điều kiện sai, làm cả `batch` bị huỷ (`createOrder`). Ràng buộc CHECK trong CSDL là lớp chặn cuối cho số tồn.
- Test chạy trên PGlite (`test/helpers/temp-db.ts`). `npm run build` kết nối Supabase thật và chạy migration (được phép theo Q1).
- Khu quản trị dùng cookie `rs_admin`, chỉ gửi tới `/admin`; Route Handler cần phiên quản trị phải nằm dưới `/admin`.

## Việc

### Giai đoạn 0: công cụ kiểm tra

- [x] **T00 — Script kiểm tra trang (`npm run smoke`).** YC-VH-02.
  Tạo `scripts/smoke.mjs` và script `smoke` trong `package.json`. Script đọc `.env.local`, tự bật `next dev` ở cổng 3100 (tiến trình con), chờ trả lời, tạo một phiên quản trị bằng cách thêm thẳng dòng `sessions` cho tài khoản `ADMIN_EMAIL` (token ngẫu nhiên, lưu SHA-256 như `src/server/auth/session.ts`), mở từng trang trong danh sách (cửa hàng và `/admin`) với cookie `rs_admin`, báo lỗi nếu trang không trả 200 (trang cần chuyển hướng ghi rõ mã mong đợi) hoặc HTML chứa dấu hiệu lỗi của Next.js. Cuối cùng xoá phiên, tắt máy chủ (trên Windows tắt cả cây tiến trình). Danh sách trang để ở đầu file cho các việc sau thêm vào.
  Xong khi: `npm run smoke` qua với các trang hiện có; cố ý làm hỏng một trang thì script báo lỗi (thử rồi hoàn tác).

### Giai đoạn 1: nền dữ liệu và quyền

- [x] **T01 — Vai trò, quyền, nhật ký thao tác.** YC-QTN-01, 02, 03, 04; SEC-01, SEC-04, AUD-01 (phần hiện có).
  Migration mới: `users.role` mở rộng, `is_active`, `marketing_consent`, `marketing_consent_at`; bảng `audit_logs`; bật RLS. `src/lib/permissions.ts` chứa đúng ma trận ở mục 3 của tài liệu 10 và hàm kiểm tra. Thay `requireAdmin()` bằng hàm kiểm tra theo quyền (ví dụ `requireStaff(permission)`), đăng nhập quản trị nhận mọi vai trò nhân viên đang hoạt động, tài khoản bị khoá mất phiên. Thanh bên lọc theo quyền và nhóm theo menu ở mục 5. Các action quản trị hiện có ghi nhật ký. Cập nhật CLAUDE.md phần mô tả `requireAdmin()`.
  Xong khi: test ma trận quyền (mỗi vai trò, mỗi quyền), SEC-01 (gọi thẳng action thiếu quyền bị từ chối), SEC-04, đăng nhập quản trị sai mật khẩu có dòng nhật ký.

- [x] **T02 — Quản lý nhân viên và trang nhật ký.** Cần T01. YC-QTN-05, 06; SEC-06.
  `/admin/nhan-vien` (danh sách, tạo, đổi vai trò, khoá, mở khoá; xoá phiên khi đổi vai trò hoặc khoá), `/admin/nhat-ky` (lọc, phân trang).
  Xong khi: test các ràng buộc ở mục 3 (không tự đổi vai trò, không khoá admin cuối cùng), trang có trong smoke.

- [x] **T03 — Danh mục, thương hiệu, series.** Cần T01. YC-SP-01.
  Migration tạo `categories` (2 cấp), `brands`, `series`; nạp danh mục từ `CATEGORIES` hiện có và thương hiệu, series suy ra từ dữ liệu mẫu. Trang quản trị `/admin/danh-muc`, `/admin/thuong-hieu`, `/admin/series` (tạo, sửa, sắp xếp; không xoá khi còn sản phẩm). Bảng `products` cũ chưa đổi ở việc này.
  Xong khi: test ràng buộc 2 cấp và chặn xoá; trang có trong smoke.

- [ ] **T04 — Biến thể và lõi kho (thay cấu trúc lớn).** Cần T03. YC-DM-02, 03, 05; YC-GH-01, 02, 06, 07; QT-11, QT-14; EC-01, EC-02, EC-03, EC-05, WH-03 (phần đặt hàng).
  Migration mới xoá và tạo lại theo tài liệu 03: `products` (khoá ngoại tới danh mục, thương hiệu, series), `product_variants`, `product_media`, `warehouses`, `locations` (tạo sẵn `KHO-01`, `A-01`, `CACH-LY`), `stock_levels`, `inventory`, `stock_documents`, `stock_document_lines`, `stock_movements`, `suppliers`, `orders`, `order_items` (có biến thể, `idempotency_key`, `discount`, `coupon_code`). Giữ tạm dãy trạng thái đơn hiện tại; T05 mới đổi sang ba trạng thái. Dữ liệu mẫu: mỗi sản phẩm một biến thể mặc định; tồn ban đầu qua phiếu `PN-SEED` đã ghi sổ (dữ liệu mẫu giữ đúng các khoá `SEED_KEY` hiện có hoặc thêm khoá mới).
  Viết lớp kho ở máy chủ (ví dụ `src/server/repo/inventory.ts`): hàm sinh câu lệnh cho từng loại biến động cập nhật `stock_levels`, `inventory` và thêm `stock_movements` trong cùng `batch`; hàm đối soát trả danh sách sai lệch (YC-KHO-18) dùng lại ở test.
  Cửa hàng: trang sản phẩm chọn biến thể (giá, tồn, màu mô hình 3D đổi theo), giỏ hàng theo `variantId` (đổi khoá lưu trong trình duyệt để giỏ cũ không làm lỗi), đặt hàng giữ hàng (`reserve`) với `idempotency_key`, huỷ giải phóng (`release`), chuyển sang trạng thái giao hàng hiện có thì ghi `ship` từ vị trí theo Q7. Trang sản phẩm quản trị hiện có tạm thời sửa được thông tin chung và biến thể mặc định (T06 làm đầy đủ).
  Xong khi: test EC-01, EC-02 (hai lệnh đặt song song cho món cuối cùng), EC-03, EC-05, WH-03 khi đặt hàng, đối soát không có sai lệch sau các test đặt và huỷ; build và smoke qua; trang sản phẩm, giỏ, thanh toán ở cửa hàng hoạt động.

- [ ] **T05 — Đơn hàng ba trạng thái (L1 đến L14).** Cần T04. YC-BH-01, 02, 03, 04; YC-KHO-16; YC-DH-01 (phần hiển thị); QT-08.
  Migration chuyển `orders` sang `status`/`payment_status`/`shipping_status`, thêm `tracking_carrier`, `tracking_code`, bảng `order_events`, `payments`. Cài đủ L1 đến L14 theo tài liệu 04 với quyền ở mục 3 của tài liệu 10 (L8 tự chạy sau L2 và L7; L11 đưa hàng vào vị trí cách ly). Trang quản trị đơn: lọc, chi tiết, nút thao tác đúng điều kiện, lịch sử; `/admin/don-hang/cho-hoan-tien`; `/admin/kho/lay-hang` (in được). Trang đơn của khách hiện ba trạng thái và mã vận đơn.
  Xong khi: mỗi luật L có test (đúng điều kiện thì chạy, sai điều kiện hoặc sai quyền thì từ chối), WH-05 cho L11, đối soát không sai lệch, nhật ký có cho từng thao tác.

### Giai đoạn 2: danh mục hàng

- [ ] **T06 — Quản trị sản phẩm có biến thể.** Cần T05. YC-SP-02, 03, 04, 05, 07, 08, 11; YC-QT-02; AUD-01 (đổi giá).
  Màn hình sản phẩm chia tab (Thông tin, Biến thể, Media, SEO, Xem trước); thêm, sửa, tắt biến thể; SKU khoá khi đã có sổ kho hoặc đơn; mã vạch duy nhất; một biến thể mặc định; lưu nháp, xuất bản (kiểm tra YC-SP-05), lưu trữ; lịch sử giá từ nhật ký; xem trước bản nháp trong `/admin` bằng component của cửa hàng. Danh sách sản phẩm lọc theo trạng thái, danh mục, thương hiệu; phân trang.
  Xong khi: test xuất bản thiếu điều kiện bị chặn, SKU bị khoá, đổi giá ghi nhật ký, xoá sản phẩm đã có đơn bị chặn; smoke có các tab.

- [ ] **T07 — Tải ảnh sản phẩm.** Cần T06. YC-SP-06; SEC-05; Q17, QT-22.
  Route Handler dưới `/admin` nhận ảnh WebP, PNG, JPEG tối đa 5 MB, kiểm tra chữ ký file, đặt tên file ở máy chủ, đẩy lên Supabase Storage bucket `media` thư mục `products/` bằng `SUPABASE_URL` và `SUPABASE_SECRET_KEY` (xem cách `scripts/media.mjs` gọi API), lưu `product_media`. Tab Media: tải lên, sắp xếp, alt, xoá, chọn ảnh đại diện. Phần gọi Storage tách thành một hàm để test thay bằng bản giả, **test không gọi Storage thật**.
  Xong khi: test SEC-05 (sai chữ ký, quá cỡ), test lưu và sắp xếp media; tự kiểm tra tay một lần tải ảnh thật lên Storage là được phép nhưng không bắt buộc.

### Giai đoạn 3: kho

- [ ] **T08 — Vị trí kho và nhà cung cấp.** Cần T04. YC-KHO-01, 02.
  `/admin/kho/vi-tri`, `/admin/nha-cung-cap`: tạo, sửa, ngừng dùng; vị trí còn hàng không ngừng dùng được.
  Xong khi: test ràng buộc; smoke.

- [ ] **T09 — Phiếu nhập mua và giá vốn.** Cần T08. YC-KHO-03, 17; K1 đến K5 với `receipt`; QT-12, 13, 17, 18; WH-01, WH-02, WH-08.
  Danh sách phiếu `/admin/kho/phieu` (lọc theo loại, trạng thái), tạo và sửa phiếu nhập, ô quét mã vạch hoặc SKU, gửi, trả lại, ghi sổ, huỷ. Ghi sổ nguyên tử, chống lặp (Q16), cập nhật `avg_cost` theo Q11.
  Xong khi: test WH-01, WH-02 (kể cả hai lệnh ghi sổ song song), WH-08, phiếu nháp không tác động tồn, phiếu đã ghi sổ không sửa được; nhật ký.

- [ ] **T10 — Phiếu xuất khác, chuyển vị trí, hàng trả, hàng cách ly.** Cần T09. YC-KHO-04, 05, 08, 09; QT-15; WH-03, WH-05, WH-07.
  Thêm các loại phiếu `issue`, `transfer`, `return` vào màn hình phiếu; trang `/admin/kho/cach-ly` với thao tác "bán lại được" và "huỷ hàng" (tạo phiếu tương ứng).
  Xong khi: test WH-03 (phiếu xuất vượt khả dụng), WH-05 (phiếu hàng trả), WH-07, không lấy được hàng đã giữ cho đơn.

- [ ] **T11 — Điều chỉnh và kiểm kê.** Cần T09. YC-KHO-06, 07; Q10; QT-16; WH-04, WH-06, WH-09.
  Phiếu `adjustment` (lý do bắt buộc) và `stocktake` (chọn vị trí, chụp số sổ sách, màn hình đếm không hiện số sổ sách, ghi sổ tạo điều chỉnh, từ chối khi vị trí có biến động sau lúc chụp). Kiểm soát kép theo Q10.
  Xong khi: test WH-04, WH-06, WH-09, một vị trí không thuộc hai phiếu kiểm kê mở.

- [ ] **T12 — Tồn kho, thẻ kho, đối soát, xuất CSV.** Cần T10, T11. YC-KHO-10, 11, 12, 13, 14, 15, 18, 19; YC-BC-02; SEC-03; WH-10; PERF-01.
  `/admin/kho` (tìm, lọc, phân trang ở máy chủ, giá vốn chỉ khi có `cost.view`), `/admin/kho/the-kho/[variantId]`, phiếu chờ xử lý, sắp hết, tuổi tồn, giá trị tồn, `/admin/kho/doi-soat`, Route Handler `/admin/xuat/[loai]` cho CSV (UTF-8 có BOM).
  Xong khi: test SEC-03 (dữ liệu trả về không có giá vốn), WH-10 (chuỗi thao tác ngẫu nhiên có hạt giống cố định, đối soát rỗng), PERF-01 (1.000 biến thể, trang đầu dưới 300 ms trên PGlite), CSV đúng định dạng.

- [ ] **T13 — Trang tổng quan theo vai trò.** Cần T12. YC-QTN-07, YC-QT-11; Q6.
  Thẻ số liệu cho kho và cửa hàng, mỗi thẻ dẫn tới danh sách đã lọc; đơn chuyển khoản quá 48 giờ; đơn chờ hoàn tiền; banner sắp hết lịch (sau T14 thì bổ sung, trước đó bỏ qua phần này).
  Xong khi: test các truy vấn số liệu; smoke với vài vai trò khác nhau (tạo tài khoản tạm trong test hoặc smoke).

### Giai đoạn 4: nội dung cửa hàng

- [ ] **T14 — Banner.** Cần T07. YC-CMS-01, 02, 07; Q20, Q21; EC-04, EC-08; AUD-01 (xuất bản banner).
  Bảng `banners`; `/admin/noi-dung/banner` (tạo, sửa, tải ảnh qua T07, lịch, xem trước, xuất bản); trang chủ hiện banner đang hiệu lực, lọc theo giờ của CSDL, cache tối đa 5 phút, cập nhật tag khi ghi.
  Xong khi: test EC-04, EC-08, kiểm tra liên kết và khung thời gian.

- [ ] **T15 — Menu, thanh thông báo, thông tin liên hệ.** Cần T14. YC-CMS-03, 05, 06.
  Bảng `nav_items`, `site_settings`; `/admin/noi-dung/menu`, `/admin/noi-dung/cai-dat`; đầu trang, chân trang và thanh thông báo của cửa hàng đọc từ CSDL (không có dữ liệu thì dùng `src/config/site.ts`).
  Xong khi: test kiểm tra liên kết nội bộ, giá trị mặc định khi bảng rỗng.

- [ ] **T16 — Trang thông tin.** Cần T15. YC-CMS-04, 07; Q19; EC-08.
  Bảng `pages`, `page_revisions`; `/admin/noi-dung/trang` (soạn văn bản thuần, xem trước, xuất bản, xem và khôi phục phiên bản); cửa hàng `/trang/[slug]` hiện văn bản thuần, không hiện HTML; nạp sẵn các trang mẫu ở trạng thái nháp với nội dung ghi rõ "nội dung mẫu".
  Xong khi: test xuất bản thêm phiên bản, khôi phục, bản nháp không công khai, nội dung có thẻ HTML được hiện ra như chữ.

### Giai đoạn 5: khách hàng và bán hàng

- [ ] **T17 — Hồ sơ khách, khoá tài khoản, đồng ý nhận tin.** Cần T05. YC-KH-01, 02, 03, 04; YC-TKH-04; SEC-02.
  `/admin/khach-hang` (tìm, số đơn, tổng chi, phân trang), `/admin/khach-hang/[id]`; khoá, mở khoá; che thông tin với `viewer` ở máy chủ; ô "Nhận tin khuyến mãi" ở form đăng ký (mặc định không chọn) và trang tài khoản.
  Xong khi: test SEC-02, khoá thì mất phiên, đồng ý lưu thời điểm.

- [ ] **T18 — Mã giảm giá.** Cần T05. YC-BH-05, 06; QT-21; EC-06, EC-07.
  Bảng `coupons`, `coupon_redemptions`; `/admin/ma-giam-gia`; ô mã ở trang thanh toán, máy chủ tính lại; tăng lượt dùng trong giao dịch đặt hàng; huỷ đơn trả lượt.
  Xong khi: test EC-06 (từng lý do từ chối, mã hợp lệ cho đúng tổng tiền), EC-07, hai đơn cùng tranh lượt cuối cùng.

- [ ] **T19 — Đánh giá.** Cần T05. YC-KH-05; YC-DG-01, 02; YC-QT-08.
  Bảng `reviews`; khách đã đăng nhập gửi đánh giá cho dòng đơn thuộc đơn `completed` (mỗi dòng một lần); trang sản phẩm hiện đánh giá đã duyệt, điểm trung bình, số đánh giá; `/admin/danh-gia` duyệt, ẩn, lọc.
  Xong khi: test điều kiện gửi, chỉ hiện `approved`, chuyển trạng thái đúng luật.

- [ ] **T20 — Yêu thích.** Cần T04. YC-KH-06; YC-DG-03.
  Bảng `wishlist_items`; nút yêu thích ở trang sản phẩm và thẻ sản phẩm (khách chưa đăng nhập thì chuyển tới đăng nhập), danh sách trong trang tài khoản; quản trị xem sản phẩm được yêu thích nhiều nhất (ở báo cáo hoặc hồ sơ khách).
  Xong khi: test thêm, bỏ, không trùng.

### Giai đoạn 6: P1 còn lại, báo cáo, vận hành

- [ ] **T21 — SEO cơ bản và chuyển hướng slug.** Cần T06. YC-SP-09.
  Tiêu đề, mô tả meta cho sản phẩm, danh mục, trang dùng trong `generateMetadata`; alt ảnh; bảng `slug_redirects`, đổi slug thì slug cũ chuyển hướng 308.
  Xong khi: test lưu slug cũ và tra chuyển hướng; smoke kiểm một slug cũ trả 308.

- [ ] **T22 — Tải mô hình 3D qua quản trị.** Cần T07. YC-SP-10; Q18.
  Máy chủ cấp URL tải lên có chữ ký (Supabase Storage), trình duyệt tải thẳng file `.glb` tối đa 25 MB, máy chủ kiểm tra 12 byte đầu (`glTF`, phiên bản 2), sai thì xoá; cập nhật `product_media` và `products.model_url`. Nhắc trong giao diện rằng file phải nén sẵn và mô hình CC BY phải có mục trong `src/data/model-credits.json`.
  Xong khi: test kiểm tra chữ ký với bản giả của Storage.

- [ ] **T23 — Báo cáo bán hàng.** Cần T13. YC-BC-01, 03.
  `/admin/bao-cao`: chọn khoảng ngày (giờ Việt Nam), số đơn, doanh thu đơn `completed`, theo trạng thái, tỷ lệ huỷ, bán chạy, yêu thích nhiều nhất; xuất CSV. Biểu đồ nếu có thì SVG hoặc CSS tự vẽ.
  Xong khi: test số liệu với dữ liệu dựng sẵn; CSV.

- [ ] **T24 — Sao lưu và diễn tập khôi phục.** Cần T12. YC-VH-01; OPS-01.
  `scripts/backup.mjs` và script `backup`: đọc mọi bảng có trong `meta`/migration, ghi JSON vào `data/backups/<thời điểm>/`. Test: dựng dữ liệu trên PGlite, sao lưu, khôi phục vào PGlite trống, so khớp và chạy đối soát. Không có lệnh khôi phục vào CSDL thật.
  Xong khi: test OPS-01; ghi cách dùng vào CLAUDE.md phần Lệnh.

- [ ] **T25 — Rà soát khả năng truy cập và giao diện hẹp.** Cần T23.
  Mọi form quản trị có nhãn, thông báo lỗi gắn với ô nhập, dùng được bằng bàn phím; bảng dài cuộn ngang trong khung, không tràn trang ở chiều rộng 375 px; trang lỗi trong `/admin` không lộ chi tiết kỹ thuật (YC-VH-03).
  Xong khi: lint qua, smoke qua; ghi những gì đã rà vào commit.

- [ ] **T26 — Tài liệu và báo cáo cuối.** Cần tất cả các việc khác đã `[x]` hoặc `[!]`.
  Viết `docs/chuan/05-kien-truc.md` (kiến trúc, phân quyền, bảo mật), `06-api.md` (danh sách Server Action, Route Handler, quyền), `07-kiem-thu.md` (bảng mã kịch bản → file test → kết quả); cập nhật cột Tình trạng ở `docs/chuan/README.md`, "Hiện trạng" ở 01, phần Cấu trúc và "Chưa làm" ở `CLAUDE.md`. Viết mục "Báo cáo cuối" theo quy tắc 10.

## Quyết định tự chọn

| Ngày | Việc | Quyết định | Lý do |
| --- | --- | --- | --- |
| 15/10/2026 | T01 | `/admin/khach-hang` tạm chỉ mở cho `customers.view`, chưa cho `viewer` | Che thông tin khách cho `viewer` (SEC-02) thuộc T17; mở trước thì lộ email, số điện thoại thật |
| 15/10/2026 | T01 | `/admin/san-pham/moi` cần `catalog.edit`; `/admin/san-pham/[id]` cần `catalog.view` (lưu, xoá vẫn bị action chặn) | Danh sách sản phẩm trỏ tới trang chi tiết; vai trò chỉ xem không gặp 404. T06 làm lại màn hình này |
| 15/10/2026 | T01 | Tạm phân quyền action đơn hiện có: xác nhận, hoàn tất, huỷ cần `orders.process`; giao vận chuyển cần `orders.fulfil`; đổi thanh toán cần `payments.manage`. Nút ở trang đơn chưa ẩn theo quyền | Dãy trạng thái cũ chưa có L1–L14; T05 thay bằng luật và nút đúng quyền |
| 15/10/2026 | T01 | Nhật ký ghi bằng `WITH changed AS (UPDATE ... RETURNING id) INSERT INTO audit_logs ...` (`withAudit` trong `src/server/repo/audit.ts`) | Cùng câu lệnh với thay đổi nên chỉ ghi khi thật sự có dòng đổi; bấm hai lần không thêm nhật ký |
| 15/10/2026 | T01 | Đăng nhập quản trị thành công cũng ghi `auth.admin_login`; khách huỷ đơn ở cửa hàng không ghi nhật ký | Đặc tả chỉ bắt buộc ghi lần thất bại; nhật ký dành cho thao tác của nhân viên |
| 15/10/2026 | T02 | Danh sách nhân viên không phân trang | Chỉ vài chục tài khoản; đã ghi `shortcut:` trong `src/server/repo/staff.ts` |
| 15/10/2026 | T02 | Ràng buộc "không tự đổi mình" và "còn ít nhất một admin hoạt động" nằm ngay trong câu `UPDATE`, sau khi khoá các dòng admin bằng `FOR UPDATE`; action kiểm tra trước chỉ để báo lý do rõ ràng | Hai admin hạ quyền nhau cùng lúc thì chỉ một lệnh thành công |
| 15/10/2026 | T02 | Tạo nhân viên cũng ghi nhật ký (`staff.create`). Trang nhân viên chỉ khoá, mở khoá tài khoản nhân viên; khoá tài khoản khách để T17 (`customers.manage`) | Tách đúng quyền theo mục 3 |
| 15/10/2026 | T02 | Bộ lọc nhật ký: người làm chọn trong danh sách nhân viên, hành động và đối tượng chọn trong các giá trị đã có trong `audit_logs`, mã đối tượng nhập tay, khoảng ngày theo giờ Việt Nam (`parseVnDate`), 50 dòng mỗi trang | Đơn giản, không cần bảng mã hành động riêng |
| 15/10/2026 | T03 | Thương hiệu lấy từ thông số "Hãng sản xuất" (tách "Hasbro, Takara Tomy" thành hai), series lấy từ "Dòng phim"/"Dòng" giữ nguyên tên kèm năm; nạp ở khoá dữ liệu mẫu mới `seed:taxonomy-v1` | Đúng "suy ra từ dữ liệu mẫu"; danh sách ở `SEED_BRANDS`, `SEED_SERIES` để T04 gán cho sản phẩm |
| 15/10/2026 | T03 | "Sắp xếp" chỉ áp cho danh mục (ô Thứ tự, `sort_order`); thương hiệu, series xếp theo tên | Tài liệu 03 không có `sort_order` ở `brands`, `series` |
| 15/10/2026 | T03 | Tới T04: danh mục đếm sản phẩm và chặn xoá qua `products.category = slug`, không đổi được slug danh mục còn sản phẩm. Thương hiệu, series chưa nối sản phẩm nên xoá được; khoá ngoại ở T04 sẽ chặn (repo đã bắt lỗi ràng buộc). T04 phải đổi `PRODUCTS_OF` trong `src/server/repo/taxonomy.ts` | Bảng `products` cũ chưa đổi ở việc này; đổi slug sẽ làm sản phẩm mất danh mục |
| 15/10/2026 | T03 | Ba trang dùng chung `TaxonomyPage`; sửa bằng `?sua=<id>` mở form dưới bảng | Ít mã nhất, không cần trang con |

## Vướng mắc

| Ngày | Việc | Vướng mắc | Đã thử | Stash |
| --- | --- | --- | --- | --- |
