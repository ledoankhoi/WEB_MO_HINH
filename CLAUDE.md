# ROBOTICA

Website thương mại điện tử bán mô hình robot sưu tầm, có xem và xoay mô hình 3D.

## Công nghệ
- Next.js 16 (App Router, `src/`, Cache Components), TypeScript, Tailwind CSS 4
- Three.js qua `@react-three/fiber` và `@react-three/drei`
- PostgreSQL (Supabase) qua `pg`, cần `DATABASE_URL` trong `.env.local`; tự tạo bảng và dữ liệu mẫu ở lần chạy đầu. Test dùng PGlite.
- Phiên bản Next.js này có thay đổi lớn so với kiến thức cũ. Đọc `node_modules/next/dist/docs/` trước khi viết code Next.js (xem `AGENTS.md`).

## Lệnh
- `npm run dev`: chạy máy chủ phát triển
- `npm run build`: build production
- `npm run lint`, `npm run typecheck`, `npm test`
- `npm run models`: tải mô hình `.glb` gốc từ Sketchfab theo `scripts/sketchfab-models.json` vào `data/models-raw/` (cần `SKETCHFAB_API_TOKEN`); tác giả và giấy phép ghi vào `src/data/model-credits.json`, hiện dưới khung 3D
- `npm run media`: nén mô hình (meshopt, texture WebP) rồi tải mô hình và ảnh `data/products/*.webp` lên Supabase Storage, bucket công khai `media` (cần `SUPABASE_URL`, `SUPABASE_SECRET_KEY`)
- `npm run auto`: chạy tự động các việc trong `docs/ke-hoach/backlog-quan-tri-kho.md`, mỗi việc một phiên `claude -p` mới (`scripts/auto-run.ps1`, nhật ký ở `data/auto-logs/`)

## Cấu trúc
- `src/app/`: Server Action (`actions/`), Route Handler (`api/`, `media/`) và hai khu trang có khung riêng. Layout gốc chỉ có `<html>`, `<body>`, không vẽ đầu trang hay chân trang.
- `src/app/(store)/`: mọi trang của cửa hàng, bọc trong `StoreFrame` (đầu trang, chân trang). Tên nhóm không xuất hiện trên URL.
- `src/app/admin/`: website quản trị, không dùng thành phần nào của cửa hàng. `(panel)/` là các trang có thanh bên (tổng quan, sản phẩm, đơn hàng, khách hàng), layout và từng trang đều gọi `requireAdmin()`; `dang-nhap/` là trang đăng nhập riêng. Phiên quản trị dùng cookie riêng `rs_admin` (chỉ gửi tới `/admin`), tách khỏi phiên `rs_session` của cửa hàng; mỗi cửa đăng nhập chỉ nhận đúng loại tài khoản của nó. Tài khoản quản trị tạo từ `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- `src/components/`: `layout/`, `product/`, `cart/`, `account/`, `order/`, `admin/`, `ui/`, `three/` (khung xem 3D và các robot trong `three/robots/`)
- `src/lib/`: mã dùng chung cho máy chủ và trình duyệt (`catalog.ts`, `cart.ts`, `format.ts`, `pricing.ts`, `vietqr.ts`)
- `src/server/`: mã chỉ chạy ở máy chủ. `db/` (kết nối, migration, dữ liệu mẫu), `repo/` (truy vấn), `auth/`, `catalog.ts` (truy vấn có cache)
- `src/config/site.ts`: tên cửa hàng, phí vận chuyển, giới hạn số lượng
- `test/`: test Vitest cho lớp dữ liệu và các hàm thuần

## Quy ước
- Giao diện tiếng Việt, nền sáng; màu lấy từ biến trong `src/app/globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-brand`...).
- Tiền tệ VND qua `formatVnd` (`src/lib/format.ts`).
- Canvas WebGL chỉ chạy ở client: dùng `RobotViewerLoader` (`next/dynamic`, `ssr: false`).
- Đọc cookie, `params`, `searchParams` phải nằm trong component dưới `<Suspense>`. Dữ liệu danh mục công khai đi qua các hàm `"use cache"` trong `src/server/catalog.ts`; sau khi ghi thì gọi `updateTag(PRODUCTS_TAG)`.
- Không gọi `Date.now()` trong lúc dựng trang (Next.js báo lỗi prerender); dùng đồng hồ CSDL hoặc gọi trong Server Action.
- Truy vấn viết bằng SQL với dấu `?` cho tham số qua `getDb()` (`execute`, `batch`); `batch` chạy trong một giao dịch.
- Mọi Server Action tự kiểm tra quyền và dữ liệu đầu vào.
- Mô hình `.glb` và ảnh sản phẩm không nằm trong git: để ở `data/` (đã bỏ qua trong git) rồi `npm run media` đưa lên Supabase Storage; cột `model_url`, `image` lưu đường dẫn đầy đủ theo `MEDIA_BASE_URL`. Mô hình CC BY phải có mục trong `src/data/model-credits.json`. Clip biến hình/hợp thể và dáng có sẵn của từng file khai báo trong `src/lib/model-features.ts`.

## Giai đoạn hiện tại
Đang làm phần quản trị website và quản lý kho trên nhánh `auto/quan-tri-kho`. Đặc tả: `docs/chuan/10-quan-tri-va-kho.md`; thứ tự việc và quy tắc chạy tự động: `docs/ke-hoach/backlog-quan-tri-kho.md`. Khi tài liệu chuẩn và mã nguồn khác nhau, `docs/chuan/` đúng.

## Chưa làm
Xem danh sách việc ở `docs/ke-hoach/backlog-quan-tri-kho.md`. Ngoài danh sách đó: cổng thanh toán trực tuyến, gửi email, sitemap, ghi nhận hành vi người dùng và phần AI (`docs/chuan/00-quyet-dinh-nen-tang.md`).
