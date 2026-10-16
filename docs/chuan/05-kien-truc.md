# 05. Kiến trúc, phân quyền và bảo mật

Mô tả hệ thống như mã nguồn ngày 16/10/2026 (nhánh `auto/quan-tri-kho`). Tên bảng, hàm và đường dẫn giữ nguyên như trong mã. Danh sách Server Action và Route Handler ở [06](06-api.md), kết quả kiểm thử ở [07](07-kiem-thu.md).

## 1. Tổng quan

| Thành phần | Công nghệ | Ghi chú |
| --- | --- | --- |
| Giao diện và máy chủ | Next.js 16 (App Router, Cache Components), React 19, TypeScript | Một ứng dụng phục vụ cả cửa hàng và khu quản trị |
| Giao diện | Tailwind CSS 4, màu lấy từ biến trong `src/app/globals.css` | Tiếng Việt, nền sáng |
| Xem 3D | Three.js qua `@react-three/fiber`, `@react-three/drei` | Chỉ chạy ở trình duyệt (`RobotViewerLoader`, `ssr: false`) |
| Cơ sở dữ liệu | PostgreSQL trên Supabase, thư viện `pg` | Test dùng PGlite (PostgreSQL trong bộ nhớ) |
| Lưu file | Supabase Storage, bucket công khai `media` | Ảnh sản phẩm, ảnh banner, mô hình `.glb` |

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

- SQL viết tay với dấu `?` cho tham số qua `getDb()`: `execute` cho một câu, `batch` cho nhiều câu chạy trong **một giao dịch**. Lớp này đổi mọi `?` thành tham số, nên chuỗi SQL cố định không được chứa `?` (migration dùng `chr(63)`).
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
| Dò mật khẩu, mã đơn, mã giảm giá | Giới hạn tần suất trong bảng `rate_limits`: đăng ký 10/giờ/IP; đăng nhập 8 lần/15 phút/email và 40/15 phút/IP; đổi mật khẩu 8/15 phút; đặt hàng 20/giờ/IP; tra cứu đơn 10/15 phút/IP; thử mã giảm giá 30/15 phút/IP. Mã giảm giá không tồn tại và đã tắt báo cùng một câu |
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

## 10. Vận hành

- `npm run backup`: sao lưu mọi bảng thành JSON trong `data/backups/<thời điểm>/`, đọc trong một giao dịch `REPEATABLE READ` chỉ đọc. Khôi phục chỉ được diễn tập trong test (OPS-01), không có lệnh khôi phục vào CSDL thật.
- `npm run smoke`: bật máy chủ phát triển ở cổng 3100, mở mọi trang với phiên quản trị tạm, kiểm tra mã trả về và dấu hiệu lỗi.
- Migration chỉ thêm ở cuối mảng, không sửa migration đã chạy.
