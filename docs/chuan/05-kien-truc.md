# 05. Kiến trúc, phân quyền và bảo mật

Mô tả hệ thống như mã nguồn ngày 16/10/2026 (nhánh `auto/quan-tri-kho`); bổ sung tìm kiếm bằng ảnh ngày 04/11/2026 (mục 10); thanh toán, email, việc định kỳ, xu và gacha, nhận dạng robot ngày 17/11/2026 (mục 12–16). Tên bảng, hàm và đường dẫn giữ nguyên như trong mã. Danh sách Server Action và Route Handler ở [06](06-api.md), kết quả kiểm thử ở [07](07-kiem-thu.md).

## 1. Tổng quan

| Thành phần | Công nghệ | Ghi chú |
| --- | --- | --- |
| Giao diện và máy chủ | Next.js 16 (App Router, Cache Components), React 19, TypeScript | Một ứng dụng phục vụ cả cửa hàng và khu quản trị |
| Giao diện | Tailwind CSS 4, màu lấy từ biến trong `src/app/globals.css` | Tiếng Việt, nền sáng |
| Xem 3D | Three.js qua `@react-three/fiber`, `@react-three/drei` | Chỉ chạy ở trình duyệt (`RobotViewerLoader`, `ssr: false`) |
| Cơ sở dữ liệu | PostgreSQL trên Supabase, thư viện `pg` | Test dùng PGlite (PostgreSQL trong bộ nhớ) |
| Lưu file | Supabase Storage, bucket công khai `media` | Ảnh sản phẩm, ảnh banner, mô hình `.glb` |
| Nhận dạng robot (AI, đề tài luận văn) | ViT-B/16 tinh chỉnh từ CLIP (ONNX fp16, 164 MB) chạy bằng ONNX Runtime Web trong Web Worker | Máy chủ chỉ nhận 195 xác suất, không nhận ảnh; mục 16 và [08](08-tich-hop-ai.md) |
| Tìm kiếm bằng ảnh, cách cũ | CLIP ViT-B/32 (ONNX, nén 8 bit) chạy trong Web Worker | Chỉ dùng khi không có mô hình nhận dạng nào bật; mục 10 |
| Thanh toán | COD; chuyển khoản VietQR (kế toán ghi nhận); VNPay (đang ở sandbox) | Mục 12 |
| Email | SMTP qua `nodemailer`; mọi thư ghi vào `email_outbox` | Mục 13 |
| Việc định kỳ | Netlify Scheduled Function gọi Route Handler có khoá | Mục 14 |
| Hiệu ứng động | Animate UI (`@animate-ui/react`) trên `motion` | |

Ứng dụng chạy trên một tiến trình Node.js. Lần truy vấn đầu tiên chạy mọi migration còn thiếu trong `src/server/db/migrations.ts` và nạp dữ liệu mẫu, dưới một khoá tư vấn (`pg_advisory_xact_lock`) để nhiều tiến trình khởi động cùng lúc không chạy trùng.

## 2. Hai tên miền

Cửa hàng và khu quản trị chạy chung ứng dụng nhưng tách tên miền. `src/proxy.ts` chạy trước mọi yêu cầu:

- Tên miền cửa hàng: `/admin` trả 404. Đường dẫn `/san-pham/<slug>` mà slug là slug cũ của một sản phẩm thì chuyển hướng 308 tới slug hiện tại (bảng `slug_redirects`, giữ trong bộ nhớ một phút).
- Tên miền quản trị (`ADMIN_HOST`, mặc định `admin.localhost`): chỉ mở `/admin/*`; `/` chuyển về `/admin`; trang cửa hàng trả 404.

Khu quản trị không dùng thành phần nào của cửa hàng. Layout gốc chỉ có `<html>`, `<body>`; cửa hàng bọc trong `StoreFrame` (nhóm `src/app/(store)/`), quản trị có khung riêng có thanh bên (`src/app/admin/(panel)/layout.tsx`).

## 3. Các lớp mã

```
src/app/            Trang, Server Action (actions/), Route Handler (api/, admin/api/, admin/xuat/, media/)
  └─ gọi
src/server/         Chỉ chạy ở máy chủ ("server-only")
  ├─ auth/          Phiên, mật khẩu (scrypt), requireStaff, authorize
  ├─ catalog.ts     Hàm "use cache" cho dữ liệu công khai
  ├─ repo/          Truy vấn SQL theo nghiệp vụ (products, orders, inventory, stock-documents, coupons, reviews...)
  ├─ storage.ts     Supabase Storage (tải lên, URL có chữ ký, xoá)
  └─ db/            Kết nối, migration, dữ liệu mẫu
src/lib/            Dùng chung máy chủ và trình duyệt: luật đơn hàng, ma trận quyền, định dạng, giá
```

Trang và Server Action không viết SQL; mọi truy vấn nằm trong `src/server/repo/`. Luật nghiệp vụ dùng ở cả giao diện và máy chủ (luật chuyển trạng thái đơn L2–L14 trong `src/lib/order-flow.ts`, ma trận quyền trong `src/lib/permissions.ts`) khai báo một lần ở `src/lib/`; giao diện dùng để ẩn nút, máy chủ dùng để kiểm tra lại.

## 4. Dữ liệu và giao dịch

- SQL viết tay với dấu `?` cho tham số qua `getDb()`: `execute` cho một câu, `batch` cho nhiều câu. Lô có câu ghi hoặc khoá (`INSERT`, `UPDATE`, `DELETE`, `SELECT ... FOR UPDATE`, `pg_advisory_xact_lock`) chạy trong **một giao dịch**; lô chỉ toàn câu đọc chạy song song, không bọc giao dịch (nhận diện bằng `isReadOnly`, nghi ngờ thì coi là cần giao dịch). Hai cách cho cùng kết quả vì PostgreSQL mặc định READ COMMITTED: trong giao dịch mỗi câu vẫn lấy ảnh dữ liệu riêng, bọc giao dịch chỉ thêm hai lượt `BEGIN`/`COMMIT` và bắt các câu chạy nối tiếp. Lớp này đổi mọi `?` thành tham số, nên chuỗi SQL cố định không được chứa `?` (migration dùng `chr(63)`).
- CSDL Supabase đặt ở Seoul (`ap-northeast-2`), mỗi lượt đi về từ Việt Nam khoảng 100 ms, nên số lượt đi về quyết định tốc độ trang: gộp nhiều câu đếm thành một câu (thông báo quản trị, `repo/admin-alerts.ts`), lô câu đọc chạy song song trên pool 6 kết nối (`DATABASE_POOL_MAX`; 3 khi `next build`), pool mở sẵn mọi kết nối lúc khởi động (mỗi kết nối mới tốn ~0,6 s bắt tay TLS). Khởi tạo ở yêu cầu đầu tiên của mỗi tiến trình chỉ đọc bảng `meta` một lần khi đã đủ mọi khoá trong `initKeys()`; thiếu khoá mới mở giao dịch có khoá để chạy migration và dữ liệu mẫu.
- Mọi thay đổi tồn kho đi qua `movementStatements` (`repo/inventory.ts`): mỗi biến động là một dòng `stock_movements` cùng cập nhật `stock_levels` (theo vị trí) và `inventory` (tổng), trong cùng giao dịch. Ràng buộc CHECK (`reserved ≤ on_hand`, không âm) chặn bán vượt tồn khi hai đơn đặt cùng lúc; khoá duy nhất trên sổ kho chặn ghi sổ một phiếu hai lần. `findInventoryDiscrepancies` đối soát sổ kho với số dư.
- Thao tác có điều kiện (đổi trạng thái đơn, ghi sổ phiếu, trả lượt mã giảm giá) dùng chung một điều kiện `EXISTS (...)` cho mọi câu ghi trong lô, và khoá dòng bằng `SELECT ... FOR UPDATE` ở đầu lô. Gửi lặp hoặc hai người bấm cùng lúc thì lần sau không ghi gì.
- Câu INSERT dựa vào truy vấn con trả `NULL` khi dữ liệu vừa đổi (giá, trạng thái sản phẩm, mã giảm giá) để vi phạm `NOT NULL` và huỷ cả lô, thay vì đọc rồi ghi ở hai bước.
- Đặt hàng có `idempotency_key` do trình duyệt sinh: bấm nhiều lần chỉ tạo một đơn.
- Thời gian lưu dạng mili giây UTC (`BIGINT`), hiển thị theo giờ Việt Nam (UTC+7). Mốc "bây giờ" khi dựng trang lấy từ đồng hồ CSDL, vì Next.js không cho gọi `Date.now()` lúc prerender.

## 5. Cache

- Dữ liệu công khai (sản phẩm, đánh giá đã duyệt, banner, menu, trang thông tin, cài đặt) đi qua các hàm `"use cache"` trong `src/server/catalog.ts`, gắn thẻ `PRODUCTS_TAG` hoặc `CONTENT_TAG`.
- Server Action ghi xong gọi `updateTag(thẻ)`; Route Handler gọi `revalidateTag(thẻ, "max")` (Next.js không cho `updateTag` trong Route Handler).
- Dữ liệu riêng từng người (giỏ hàng, yêu thích, tài khoản) không cache chung: giỏ hàng lưu ở `localStorage` và lấy giá qua `GET /api/cart`; trạng thái yêu thích lấy qua `GET /api/wishlist`.
- Đọc cookie, `params`, `searchParams` nằm trong component dưới `<Suspense>`. Hệ quả: `redirect()` và `notFound()` gọi trong đó chạy sau khi mã 200 đã gửi; chỗ nào cần mã HTTP đúng (chuyển hướng slug 308) thì làm trong `src/proxy.ts`.

## 6. Xác thực và phiên

- Mật khẩu băm bằng scrypt. Phiên là token ngẫu nhiên trong cookie `httpOnly`, `SameSite=Lax`, `Secure` khi chạy HTTPS, sống 30 ngày; CSDL chỉ lưu SHA-256 của token.
- Hai cookie tách nhau: `rs_session` cho cửa hàng (đường dẫn `/`), `rs_admin` cho quản trị (chỉ gửi tới `/admin`). Cửa đăng nhập cửa hàng chỉ nhận tài khoản khách, cửa quản trị chỉ nhận tài khoản nhân viên.
- Khoá tài khoản (`is_active = false`) xoá mọi phiên trong cùng giao dịch; phiên của tài khoản bị khoá không còn đọc được.
- Tài khoản quản trị đầu tiên tạo từ `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Không hạ quyền hoặc khoá được quản trị viên cuối cùng.

## 7. Phân quyền

Mười vai trò: `customer` và chín vai trò nhân viên. `admin` có mọi quyền. Ma trận quyền (`src/lib/permissions.ts`):

| Quyền | Vai trò có quyền (ngoài admin) |
| --- | --- |
| `dashboard.view`, `catalog.view` | Mọi nhân viên |
| `catalog.edit` | product_manager |
| `cost.view` | warehouse_manager, accountant |
| `inventory.view` | product_manager, warehouse_manager, warehouse, order_staff, accountant, viewer |
| `inventory.draft` | warehouse_manager, warehouse |
| `inventory.post`, `inventory.setup` | warehouse_manager |
| `orders.view` | warehouse_manager, warehouse, order_staff, support, accountant, viewer |
| `orders.process` | order_staff |
| `orders.fulfil` | warehouse_manager, warehouse, order_staff |
| `payments.manage` | accountant |
| `customers.view` | order_staff, support, accountant |
| `customers.manage`, `reviews.moderate` | support |
| `content.edit`, `coupons.manage` | marketing |
| `reports.view` | product_manager, warehouse_manager, marketing, accountant, viewer |
| `audit.view` | accountant, viewer |
| `staff.manage` | chỉ admin |

Kiểm tra ở ba lớp:

1. Trang: layout và từng trang gọi `requireStaff(quyền)`. Chưa có phiên quản trị thì về trang đăng nhập quản trị; có phiên mà thiếu quyền thì 404 (không lộ trang tồn tại).
2. Server Action: gọi `staffWith(quyền)` hoặc `authorize(quyền)` trước mọi việc; thiếu quyền trả lời từ chối mà không ghi gì. Thanh bên và nút chỉ là tiện ích hiển thị.
3. Dữ liệu: vai trò `viewer` xem được danh sách và hồ sơ khách nhưng email, số điện thoại, địa chỉ bị che ở máy chủ (`maskContact`), kể cả trong danh sách và chi tiết đơn. Cột giá vốn chỉ được truy vấn khi người xem có `cost.view` (`listStock({ withCost })`), kể cả trong CSV.

Phân tách nhiệm vụ trong kho: người tạo phiếu điều chỉnh không tự ghi sổ được phiếu đó; ghi sổ cần `inventory.post`.

## 8. Bảo mật

| Mối nguy | Biện pháp |
| --- | --- |
| Gọi thẳng Server Action | Mọi action tự kiểm tra phiên, quyền và từng trường đầu vào (kiểu, độ dài, mẫu id `^[a-f0-9]{20}$`); file `"use server"` chỉ export action, hàm dùng chung đặt ở `src/server/staff-action.ts` |
| Tiêm SQL | Mọi giá trị đi qua tham số; tên cột, bảng chỉ lấy từ hằng trong mã |
| Giá, tồn do trình duyệt gửi | Máy chủ lấy giá và tồn từ CSDL; giá trình duyệt gửi chỉ để phát hiện giá vừa đổi; mã giảm giá được tính lại khi đặt hàng |
| Dò mật khẩu, mã đơn, mã giảm giá | Giới hạn tần suất trong bảng `rate_limits`: đăng ký 10/giờ/IP; đăng nhập 8 lần/15 phút/email và 40/15 phút/IP; đổi mật khẩu 8/15 phút; đặt hàng 20/giờ/IP; tra cứu đơn 10/15 phút/IP; thử mã giảm giá 30/15 phút/IP; tìm bằng ảnh 30/phút/IP. Mã giảm giá không tồn tại và đã tắt báo cùng một câu |
| Ảnh của khách khi tìm bằng ảnh | Ảnh không rời trình duyệt: chỉ vector 512 số được gửi lên (thân yêu cầu ≤ 64 KB). Máy chủ kiểm tra số chiều, giá trị hữu hạn, mã mô hình; nhật ký không có ảnh, IP hay tài khoản |
| Vector do trình duyệt quản trị gửi khi lập chỉ mục | Kiểm tra từng vector góc nhìn (512 số, hữu hạn, độ dài 1 ± 0,01, ≤ 24 góc) và đường dẫn mô hình 3D lúc dựng; máy chủ tự gộp vector đại diện. Kết quả hiệu chỉnh được dựng lại chỉ với các trường đã biết |
| Tải file độc | Ảnh nhận diện theo chữ ký file thật (WebP, PNG, JPEG), tối đa 5 MB; mô hình `.glb` kiểm tra 12 byte đầu (`glTF`, phiên bản 2, độ dài khớp kích thước) và tối đa 25 MB, sai thì xoá. Tên file do máy chủ đặt |
| Tiêm công thức vào CSV | Ô chữ bắt đầu bằng `=`, `+`, `@`, hoặc `-` không theo sau là số được thêm dấu `'` |
| Lộ liên kết đơn hàng | Trang đơn theo token bí mật có `robots: noindex` và `referrer: no-referrer` |
| Truy cập CSDL ngoài ứng dụng | Bật RLS trên mọi bảng, không có chính sách nào: khoá `anon` của Supabase không đọc được gì. Ứng dụng kết nối bằng chuỗi `DATABASE_URL` riêng, TLS kiểm chứng chứng chỉ (`certs/supabase-ca.crt`) |
| Lộ chi tiết lỗi | Trang lỗi chung chỉ báo "Đã có lỗi xảy ra", không in thông báo lỗi |
| Truy vết | Mọi thao tác quản trị làm đổi dữ liệu ghi một dòng `audit_logs` (người làm, vai trò, đối tượng, giá trị trước, sau) trong cùng câu lệnh với thao tác (`withAudit`), nên không có thao tác thành công mà thiếu nhật ký |
| Bí mật | Khoá Supabase, chuỗi kết nối nằm trong `.env.local` (không có trong git) |

## 9. File và mô hình 3D

- Ảnh sản phẩm, ảnh banner tải qua Route Handler `POST /admin/api/anh` (ảnh tới 5 MB vượt giới hạn 1 MB của Server Action), máy chủ gửi lên Storage.
- Mô hình `.glb` tới 25 MB tải hai bước: Server Action cấp URL có chữ ký, trình duyệt gửi thẳng file lên Storage, rồi một Server Action khác kiểm tra phần đầu file và gắn vào sản phẩm (`product_media` loại `model`, `products.model_url`).
- Mô hình và ảnh gốc không nằm trong git; `npm run models`, `npm run media` đưa lên Storage (xem [09](09-mo-hinh-3d.md)).

## 10. Tìm kiếm bằng ảnh

- Thư viện vector lập ở trình duyệt của quản trị (`/admin/tim-bang-anh`): three.js dựng 12 góc mỗi dạng từ file `.glb`, worker ONNX trích đặc trưng, Server Action `saveImageIndexAction` kiểm tra rồi lưu (`image_search_index`). Khách tìm ở `/tim-bang-anh`: worker trích đặc trưng ảnh của khách, `POST /api/tim-bang-anh` xếp hạng và quyết định.
- Mô hình ONNX (mặc định tải từ Hugging Face, khoảng 89 MB) được worker lưu trong Cache Storage của trình duyệt; thư viện ONNX Runtime (khoảng 14 MB WebAssembly) phục vụ tĩnh từ `public/image-search/ort/`, do `scripts/copy-ort.mjs` chép từ `node_modules` khi `npm install` (postinstall) và trước `dev`, `build`.
- Chỉ mục và ngưỡng đọc qua hàm `"use cache"` trong `src/server/image-search.ts`, gắn thẻ `IMAGE_SEARCH_TAG` (và `PRODUCTS_TAG` vì kèm giá, tồn); lập chỉ mục, xoá, đổi ngưỡng thì `updateTag(IMAGE_SEARCH_TAG)`.
- Đầu trang cửa hàng chỉ hiện nút máy ảnh khi có sản phẩm tìm được (đếm bằng một câu SQL, có cache).

## 11. Vận hành

- `npm run backup`: sao lưu mọi bảng thành JSON trong `data/backups/<thời điểm>/`, đọc trong một giao dịch `REPEATABLE READ` chỉ đọc. Khôi phục chỉ được diễn tập trong test (OPS-01), không có lệnh khôi phục vào CSDL thật.
- `npm run smoke`: bật máy chủ phát triển ở cổng 3100, mở mọi trang với phiên quản trị tạm, kiểm tra mã trả về và dấu hiệu lỗi.
- Migration chỉ thêm ở cuối mảng, không sửa migration đã chạy.

## 12. Thanh toán

**Ba phương thức**
- **COD:** đơn được xác nhận ngay (L3). Kế toán ghi nhận tiền (L2) khi hãng vận chuyển chuyển tiền về. Đơn từ mức `site.codOtpFrom` cần mã OTP gửi qua email.
- **Chuyển khoản VietQR:** trang đơn dựng mã QR theo chuẩn VietQR (`src/lib/vietqr.ts`) với số tiền và nội dung là mã đơn. Khách bấm "Tôi đã chuyển khoản" chỉ để báo (`transfer_claims`); kế toán đối chiếu với sổ ngân hàng rồi ghi nhận ở `/admin/don-hang/chuyen-khoan`. Thiếu biến `BANK_*` thì không có phương thức này.
- **VNPay** (`src/server/payments/`):
  - Mỗi lần chuyển khách sang cổng là một dòng `payment_attempts` có hạn.
  - URL ký bằng HMAC-SHA512 với `VNPAY_HASH_SECRET`.
  - **Chỉ hai nguồn được ghi nhận tiền:** IPN có chữ ký đúng (`/api/thanh-toan/vnpay/ipn`), hoặc kết quả tra cứu `querydr`.
  - Trang khách quay về không tin tham số URL.
  - Mọi lời gọi của cổng được ghi nguyên văn vào `payment_callbacks`.
  - Hoàn tiền qua API (`refundTransaction`) cho đơn huỷ hoặc trả hàng.

**Luật chung**
- Tiền luôn đi qua luật L2 (thu đủ), L15 (nhận cọc), L14 (hoàn tiền) của `src/lib/order-flow.ts`. Đơn đã huỷ mà tiền vẫn về thì vẫn ghi nhận, rồi nằm trong danh sách chờ hoàn tiền.
- Hạn giữ hàng của đơn trả trước nằm ở `site.payment`: chuyển khoản và cọc 48 giờ, nhắc ở mốc 24 giờ; VNPay 24 giờ.

## 13. Email

- **Ghi trước, gửi sau:** `sendMail` (`src/server/email/mailer.ts`) ghi mọi thư vào `email_outbox`, rồi gửi qua SMTP nếu có cấu hình (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Chưa cấu hình thì thư ở trạng thái `logged` và đọc được ở `/admin/hop-thu`. Gửi lỗi thì ghi `failed` kèm lỗi, cho phép gửi lại.
- **Mẫu thư** ở `src/server/email/templates.ts`: mọi giá trị đều qua `escapeHtml`. Liên kết tuyệt đối lấy từ `NEXT_PUBLIC_SITE_URL` (`getBaseUrl`), không tin header `Host`.
- **Các loại thư:** xác nhận đơn và từng lần đổi trạng thái (`src/server/email/order-mails.ts`), đặt lại mật khẩu, OTP, nhắc chuyển khoản, huỷ đơn quá hạn, hàng đặt trước đã về hoặc đổi lịch.

## 14. Việc định kỳ

- **Cách gọi:** `netlify/functions/dinh-ky.mts` chạy 15 phút một lần, gọi `GET /api/cron/dinh-ky` với khoá `CRON_SECRET`. Route so sánh khoá trong thời gian hằng; sai khoá thì trả 404.
- **Thứ tự bước:**
  1. Đối soát lượt VNPay còn treo. Bước này chạy trước, để đơn vừa trả xong không bị huỷ nhầm.
  2. Nhắc chuyển khoản một lần.
  3. Tự huỷ đơn trả trước quá hạn (L13, kèm thư `expired`). Không huỷ đơn khách đã báo chuyển khoản, hay đơn còn lượt VNPay chưa hết hạn.
- **Chạy lặp an toàn:** mỗi bước chỉ chọn các dòng còn đủ điều kiện ngay trong câu lệnh ghi, nên hai lần chạy chồng nhau không làm hỏng dữ liệu.

## 15. Tính đúng khi nhiều yêu cầu cùng lúc

- **Đặt hàng:** một giao dịch khoá dòng tồn và suất flash sale. Hai khách tranh món cuối thì chỉ một người được. Khoá `idempotency_key` chống bấm đặt nhiều lần.
- **Xu và thưởng:** xu là sổ cái `coin_ledger`, số dư bằng tổng sổ. Khoá duy nhất `(user_id, reason, ref)` chặn nhận thưởng hai lần. Mọi lần cộng, trừ xu chạy kèm `userLock` (khoá tư vấn theo người dùng) để hai tab không tiêu cùng một khoản.
- **Gacha:** mọi câu ghi của một lượt phụ thuộc "vé", tức dòng trừ xu hoặc dòng lượt miễn phí có khoá duy nhất theo ngày. Không có vé thì không ghi gì.
- **Trả hàng, đặt trước, chuyển khoản:** dùng chỉ mục duy nhất có điều kiện. Ví dụ: mỗi đơn chỉ một yêu cầu trả hàng đang mở; mỗi biến thể chỉ một đợt đặt trước chưa kết thúc.

## 16. Nhận dạng robot

- **Huấn luyện ở ngoài web:** mô hình huấn luyện bằng Python trong `ml/` (tài liệu ở `docs/nhan-dang-robot/`), xuất ONNX fp16, chia phần 20 MB rồi đưa lên Storage `media/ml/<mã mô hình>/` (`scripts/recognition-upload.mjs`). Model card, nhãn, nhiệt độ hiệu chỉnh và ngưỡng được nhập vào `recognition_models` (`scripts/recognition-import.mjs` hoặc `/admin/nhan-dien`). Tại mỗi thời điểm chỉ một mô hình được bật.
- **Trong trình duyệt:** dùng chung worker `public/image-search/worker.js` với cách cũ. Tiền xử lý (`src/lib/recognition-preprocess.ts`) trùng từng byte với Pillow và torchvision của Python, có test. Mô hình chạy WebAssembly một luồng, khoảng 1 giây mỗi ảnh. File mô hình được lưu trong Cache Storage sau lần tải đầu.
- **Ở máy chủ:** `POST /api/nhan-dien` chỉ nhận 195 xác suất. Máy chủ dựng bảng 5 robot kèm sản phẩm đang bán (`src/lib/recognition-api.ts`), áp luật trả lời theo cấp để ghi nhật ký (`src/lib/recognition.ts`), rồi ghi `recognition_logs` sau khi đã trả lời. Không lưu ảnh, IP hay tài khoản.
- **Đường lui:** không có mô hình nào bật thì `/tim-bang-anh` dùng cách cũ (mục 10). Mã và bảng của cách cũ chưa gỡ; hướng dẫn gỡ ở `docs/nhan-dang-robot/huong-dan-go-cach-cu.md`.
