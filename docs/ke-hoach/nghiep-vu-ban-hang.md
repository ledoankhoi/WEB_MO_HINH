# Bổ sung nghiệp vụ bán hàng (đối chiếu Shopee, Amazon, Tiki)

Chủ dự án yêu cầu ngày 08/11/2026: làm **tất cả** nghiệp vụ còn thiếu, **từ trên xuống dưới**, từng mục một. Danh sách lập từ lần rà toàn bộ website (21 trang cửa hàng, 37 trang quản trị, 46 bảng CSDL) so với các sàn lớn.

## Quy ước chung

- **Bảng mới:** CSDL Supabase dùng chung với một nơi khác (CLAUDE.md). Trước khi thêm migration, kiểm tra bảng `meta` và tên bảng trên CSDL thật; dùng tên chưa có, `IF NOT EXISTS` cho cột có thể trùng. Migration của phần này có tiền tố `sale_`.
- **Server Action:** tự kiểm tra quyền và dữ liệu vào; ghi `audit_logs` cho thao tác quản trị.
- **Mỗi mục xong:** lint, kiểm tra kiểu, test Vitest cho phần logic, mở trang thật kiểm tra. Đánh dấu `[x]` kèm ngày ở danh sách dưới.
- **Mục cần tài khoản bên ngoài** (cổng thanh toán, đơn vị vận chuyển, dịch vụ email, Google/Facebook): làm sẵn phần mã với một lớp trung gian. Chưa có khoá thì chạy ở **chế độ thử** (ghi ra nhật ký hoặc dùng sandbox) và ghi rõ việc chủ dự án cần đăng ký.

## Danh sách (làm từ trên xuống)

### 🔴 Cần trước khi bán thật

- [x] **1. Gửi email (nền tảng)** — xong 08/11/2026: `src/server/email/` (mailer, mẫu thư), bảng `email_outbox`, trang `/admin/hop-thu` (xem thư, gửi thư thử, gửi lại thư lỗi). Chưa có SMTP thì thư ở trạng thái "Chỉ ghi".
  - Lớp gửi mail dùng chung: SMTP qua biến môi trường. Chưa cấu hình thì ghi thư vào bảng hộp thư thử và hiện trong quản trị.
  - Mẫu thư tiếng Việt cùng phong cách cửa hàng.
  - Hàng đợi có thử lại.
- [x] **2. Quên mật khẩu / đặt lại mật khẩu** — xong 08/11/2026: `/quen-mat-khau`, `/dat-lai-mat-khau`, bảng `password_resets`, `test/password-reset.test.ts` (10 test). Liên kết trong thư lấy từ `NEXT_PUBLIC_SITE_URL`, không tin header Host (chống host header injection).
  - Trang `/quen-mat-khau` → gửi link có token (một lần, hạn 30 phút, lưu dạng băm) → `/dat-lai-mat-khau`.
  - Giới hạn số lần yêu cầu.
  - Không tiết lộ email có tồn tại hay không.
  - Đổi mật khẩu xong thì đăng xuất mọi phiên.
- [x] **3. Email báo đơn hàng** — xong 08/11/2026: `src/server/email/order-mails.ts`; gửi khi đặt đơn (`placeOrderAction`) và sau mỗi lần chuyển trạng thái thành công trong `applyOrderAction` (xác nhận, đã thu tiền, bàn giao kèm mã vận đơn, đã giao, giao thất bại, huỷ, hoàn tiền); bước nội bộ (đóng gói) không gửi. Test ở `test/orders.test.ts`.
  - Gửi khi: đặt hàng thành công, xác nhận, giao cho vận chuyển (kèm mã vận đơn), đã giao, huỷ, hoàn tiền.
  - Khách tắt được thư khuyến mãi nhưng không tắt thư giao dịch.
- [x] **4. Khách yêu cầu trả hàng / hoàn tiền sau khi nhận** — xong 08/11/2026: `src/lib/returns.ts` (luồng, lý do, tính tiền hoàn), `repo/returns.ts`, bảng `return_requests`, `return_request_items`; khách gửi ở trang đơn (`POST /api/don-hang/[token]/tra-hang`, tối đa 4 ảnh, ảnh bắt buộc trừ lý do "đổi ý"); quản trị `/admin/don-hang/tra-hang` (duyệt/từ chối → lập phiếu hàng trả gắn đơn, hàng vào cách ly → hoàn tiền ghi vào `payments`); thư báo ở mỗi bước; `test/returns.test.ts` (9 test). Tiền hoàn đề xuất = giá trị hàng trả − phần giảm giá theo tỉ lệ, không gồm phí giao (nhân viên sửa được khi duyệt). Mỗi đơn một yêu cầu đang mở hoặc đã hoàn.
  - Trong thời hạn (ví dụ 7 ngày từ lúc giao): chọn sản phẩm, lý do, ảnh.
  - Nhân viên duyệt hoặc từ chối → nhận hàng về (phiếu hàng trả trong kho, luật L11) → hoàn tiền.
  - Khách theo dõi trạng thái ở trang đơn.
- [ ] **5. Thanh toán online** (VNPay, MoMo; sau đó ZaloPay hoặc thẻ). Chủ dự án yêu cầu chạy thật bằng tài khoản thật; kế hoạch chi tiết: [thanh-toan-va-van-chuyen.md](thanh-toan-va-van-chuyen.md) (chờ duyệt).
  - Tạo giao dịch, trang chuyển hướng, nhận IPN (xác minh chữ ký), cập nhật `payment_status`, đối soát, hoàn tiền.
  - Chạy sandbox tới khi có tài khoản thật.
- [ ] **6. Phí giao hàng theo địa chỉ + đơn vị vận chuyển** (GHN, GHTK). Kế hoạch chung với mục 5 ở [thanh-toan-va-van-chuyen.md](thanh-toan-va-van-chuyen.md).
  - Tính phí theo tỉnh/huyện và cân nặng; tạo vận đơn tự động; cập nhật trạng thái qua webhook.
  - Bảng phí dự phòng khi chưa có khoá API.

### 🟠 Tăng doanh số

- [ ] **7. Đánh giá kèm ảnh, video**: tối đa 5 ảnh hoặc 1 video ngắn, lưu Storage, qua kiểm duyệt; lọc "Có hình ảnh" trên trang sản phẩm.
- [x] **8. Đã xem gần đây và Mua lại** — xong 08/11/2026: trình duyệt lưu slug (`src/lib/recently-viewed.ts`), tài khoản lưu bảng `recently_viewed` (30 sản phẩm gần nhất, `repo/recently-viewed.ts`), `POST /api/da-xem` gộp hai nguồn, `DELETE` xoá lịch sử; khối "Đã xem gần đây" ở trang sản phẩm, giỏ hàng, tài khoản (`RecentlyViewed`), có nút xoá lịch sử; lịch sử nằm trong dữ liệu tải về và bị xoá khi khách xoá tài khoản. Nút "Mua lại" ở trang đơn đã giao (giữ đúng phiên bản, số lượng, tuỳ biến Xưởng; giá, tồn kho tải lại ở giỏ). `test/recently-viewed.test.ts`.
  - Lưu sản phẩm đã xem (trình duyệt + tài khoản); khối "Đã xem gần đây"; nút "Mua lại" ở đơn đã giao.
- [x] **9. Flash sale có đếm ngược** — xong 08/11/2026: `src/lib/flash-sale.ts` (trạng thái theo giờ, giá bán, đếm ngược), bảng `flash_sales`, `flash_sale_items` (giá sale, tổng suất, tối đa mỗi đơn), cột `order_items.flash_sale_id`; quản trị `/admin/flash-sale` (quyền `coupons.manage`: tạo chương trình, thêm phiên bản; chặn giá sale không thấp hơn giá thường, chặn một phiên bản nằm trong hai chương trình trùng giờ, chặn bỏ dòng đã có đơn); trang chủ có khối đếm ngược (`FlashSaleBlock`), thẻ và trang sản phẩm có nhãn giá sale, đếm ngược, số suất (`FlashPrice`, chạy theo đồng hồ trình duyệt vì trang được cache). Máy chủ tính giá theo lúc đặt (`findCartProducts(ids, now)`), khoá dòng suất khi ghi đơn để hai khách không mua quá suất; huỷ đơn trả suất. `test/flash-sale.test.ts`.
  - Chương trình giá theo khung giờ, giới hạn số lượng; khối trang chủ, nhãn trên thẻ sản phẩm; máy chủ tính giá theo thời điểm đặt.
- [x] **10. Đặt trước (pre-order)** — xong 08/11/2026: `src/lib/preorder.ts` (cọc, suất, số tiền cần trả), `repo/preorders.ts` (đợt, phân bổ), bảng `preorder_offers`, cột `order_items.preorder_offer_id`, `orders.preorder_status`, `orders.deposit_amount`, trạng thái thanh toán `deposit_paid` và luật L15 (docs/chuan/04 mục 5.1); trang khách `/hang-sap-ve`, nút "Đặt trước" ở thẻ và trang sản phẩm, chọn đặt cọc/trả đủ ở trang thanh toán; quản trị `/admin/dat-truoc` (mở đợt, sửa ngày về kèm thư báo khách, ngừng nhận, phân bổ hàng về theo thứ tự đặt, kết thúc đợt), thông báo "Hàng đặt trước đã về, chờ phân bổ"; VNPay trả cọc hoặc phần còn lại; thư "hàng đã về", "dời ngày về", "đã nhận cọc"; `test/preorder.test.ts` (11 test, chạy cả trên PostgreSQL thật).
  - Sản phẩm sắp về có ngày dự kiến, đặt cọc hoặc trả đủ; giữ chỗ không trừ tồn; báo khi hàng về; quản trị theo dõi danh sách đặt trước.
  - Quyết định: khi đợt chưa kết thúc, phiên bản chỉ bán dạng đặt trước (hàng về dành cho người đã đặt). Đơn trộn hàng có sẵn và đặt trước giao một lần khi đủ hàng; hàng có sẵn được giữ ngay. Phân bổ không nhảy cóc; đơn chưa cọc không được phân bổ.
- [x] **11. Hỏi đáp trên trang sản phẩm** — xong 08/11/2026: bảng `product_questions`, `product_answers` (`repo/questions.ts`); tab "Hỏi đáp" ở trang sản phẩm (`ProductQuestions`): khách đăng nhập hỏi (tối đa 5 câu đang chờ, 10 câu/giờ), khách đã mua (đơn hoàn tất) trả lời; câu hỏi và trả lời của khách chờ duyệt, trả lời của nhân viên hiện ngay và duyệt luôn câu hỏi, người hỏi nhận email (`qa-mails.ts`). Quản trị `/admin/hoi-dap` (quyền `reviews.moderate`), thông báo "Câu hỏi sản phẩm cần xử lý". `test/questions.test.ts`.
  - Khách hỏi, nhân viên hoặc khách đã mua trả lời; hiện ngay dưới sản phẩm; kiểm duyệt.
- [x] **12. Combo giảm giá khi mua nhiều** — xong 08/11/2026: `src/lib/bundles.ts` (tính giảm dùng chung cho giỏ và máy chủ: mỗi bộ đủ giảm X% trên giá phiên bản, món rẻ trước, một món chỉ thuộc một combo), bảng `bundle_deals`, `bundle_deal_items`, cột `orders.bundle_discount` (nằm trong `orders.discount`, cộng với mã giảm giá); quản trị `/admin/combo` (quyền `coupons.manage`, 2–10 sản phẩm, giảm 1–50%); giỏ hiện "Giảm combo", gợi ý món còn thiếu kèm nút thêm (`GET /api/combo`); trang sản phẩm có khối "Mua đủ bộ, giảm thêm" và nút thêm cả bộ. `test/bundles.test.ts`.
  - Ví dụ đủ bộ 5 Combaticon giảm X%; khai báo trong quản trị; giỏ hàng tự áp dụng và gợi ý món còn thiếu.
- [ ] **13. Gợi ý cá nhân hoá**: dựa trên sản phẩm đã xem, đã mua, tương tác 3D (nghiên cứu ở `docs/AI/`).

### 🟡 Tiện ích

- [x] **14. Đăng nhập Google, Facebook** — xong phần mã 08/11/2026, **chờ chủ dự án tạo ứng dụng OAuth** (biến `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`; thiếu thì nút không hiện): `src/server/auth/oauth.ts` (authorization code, state chống CSRF trong cookie httpOnly 10 phút, PKCE S256 cho Google, địa chỉ quay về theo `NEXT_PUBLIC_SITE_URL`), `GET /api/dang-nhap/[provider]` và `/callback`, bảng `oauth_identities` (`repo/oauth.ts`). Tự liên kết với tài khoản cùng email chỉ khi nhà cung cấp xác nhận email (Google); Facebook trùng email thì phải đăng nhập bằng mật khẩu rồi liên kết ở Cài đặt > Tài khoản & Bảo mật (có bỏ liên kết). Không nhận tài khoản nhân viên, tài khoản bị khoá. `test/oauth.test.ts`.
  - Đăng nhập bằng OAuth; liên kết với tài khoản email sẵn có.
- [x] **15. Xác thực email (OTP)** — xong 08/11/2026 cho email; **OTP qua SMS chưa làm** (cần nhà cung cấp SMS): bảng `otp_codes` (chỉ lưu SHA-256, hạn 10 phút, sai tối đa 5 lần, gửi lại sau 60 giây, mã mới huỷ mã cũ; `repo/otp.ts`), cột `users.email_verified_at`. Đăng ký xong gửi mã và mở `/xac-thuc-email`; trang tài khoản nhắc khi chưa xác thực; tài khoản Google coi như đã xác thực. Đơn COD có phần trả khi nhận từ `site.codOtpFrom` (2.000.000 ₫) cần mã gửi tới email của đơn (bỏ qua khi đặt bằng email tài khoản đã xác thực); mã chỉ đánh dấu đã dùng khi đơn tạo xong. Lưu ý: thư OTP nằm trong hộp thư đi `/admin/hop-thu` như mọi thư. `test/otp.test.ts`.
  - Khi đăng ký và khi đặt đơn COD giá trị lớn.
- [x] **16. Chat với cửa hàng** — xong 08/11/2026: bảng `chat_threads`, `chat_messages` (`repo/chat.ts`); nút chat nổi ở mọi trang cửa hàng (`ChatWidget`): khách đăng nhập theo tài khoản, khách vãng lai theo token trong cookie httpOnly `rs_chat` (CSDL lưu SHA-256), hỏi tin mới mỗi 5 giây khi mở khung, 30 giây khi đóng (huy hiệu tin chưa đọc), `GET/POST /api/chat` (30 tin/10 phút/IP). Quản trị `/admin/chat` (quyền `customers.manage`, tự tải lại mỗi 10 giây, đánh dấu đã xong); thông báo "Tin nhắn khách chờ trả lời" và thông báo nổi khi có tin mới. `test/chat.test.ts`.
  - Khung chat trên trang, nhân viên trả lời ở quản trị, thông báo tin mới.
- [x] **17. Xuất hoá đơn VAT** — xong 08/11/2026, **chưa nối nhà cung cấp hoá đơn điện tử**: trang thanh toán có ô "Xuất hoá đơn VAT" (tên công ty, mã số thuế 10 số hoặc 10-3, địa chỉ, email), bảng `order_invoices` (`repo/invoices.ts`) ghi cùng giao dịch tạo đơn; quản trị `/admin/hoa-don` (quyền `payments.manage`) cấp số `HDyyyy-nnnnnn` cho đơn đã thanh toán đủ (một lần), bản in `/admin/don-hang/[id]/hoa-don` (in hoặc lưu PDF, ghi rõ bản nháp, tách thuế theo `site.vatPercent` = 10% cần kế toán xác nhận); trang đơn của khách và quản trị hiện trạng thái hoá đơn. `test/invoices.test.ts`.
  - Khách nhập thông tin công ty khi đặt hàng; quản trị xuất hoá đơn (PDF, sau tích hợp hoá đơn điện tử).
- [ ] **18. Trả góp**: qua cổng thanh toán (thẻ tín dụng) khi đơn từ 3 triệu. **Chưa làm (08/11/2026), chờ chủ dự án**: trả góp là dịch vụ riêng của cổng (VNPay/MoMo trả góp) cần hợp đồng và tài liệu API riêng; làm giao diện "trả góp" khi chưa có thì là thông tin giả với khách. Khi có: thêm phương thức `installment` qua lớp cổng ở `src/server/payments/`, chỉ hiện khi tổng đơn ≥ 3.000.000 ₫.
- [x] **19. So sánh sản phẩm** — xong 11/11/2026: danh sách tối đa 4 slug ở trình duyệt (`src/lib/compare.ts`), nút "So sánh" ở thẻ và trang sản phẩm, thanh so sánh nổi (`CompareButton`, `CompareBar`); trang `/so-sanh?sp=a,b` (gửi đường dẫn vẫn đúng bảng): giá, danh mục, thương hiệu, series, loại, tỉ lệ, cấp độ, tình trạng (cả đặt trước), đánh giá, mọi dòng thông số; nút thêm vào giỏ, bỏ khỏi so sánh.
- [x] **20. SEO** — xong 11/11/2026: `src/app/sitemap.ts` (trang cố định, danh mục, sản phẩm đang bán kèm ngày sửa, tin tức; theo `NEXT_PUBLIC_SITE_URL`), `src/app/robots.ts` (chặn quản trị, API, giỏ, thanh toán, tài khoản, đơn hàng), JSON-LD Product ở trang sản phẩm (`src/lib/structured-data.ts`: giá VND, InStock/OutOfStock/PreOrder, điểm đánh giá; thoát `<` để không đóng thẻ script). `test/structured-data.test.ts`.

## Việc chủ dự án cần làm (tài khoản bên ngoài)

| Mục | Cần |
| --- | --- |
| 1–3 | Hộp thư gửi (Gmail + mật khẩu ứng dụng, hoặc dịch vụ như Resend) |
| 5, 18 | Đăng ký VNPay, MoMo (cần giấy phép kinh doanh để chạy thật) |
| 6 | Tài khoản GHN hoặc GHTK |
| 14 | Ứng dụng Google Cloud OAuth, Facebook App |
| 15 | Dịch vụ SMS (nếu dùng OTP qua điện thoại) |
| 17 | Nhà cung cấp hoá đơn điện tử |
