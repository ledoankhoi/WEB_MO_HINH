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

## Cấu trúc
- `src/app/`: trang, Server Action (`actions/`), Route Handler (`api/`, `media/`)
- `src/components/`: `layout/`, `product/`, `cart/`, `account/`, `order/`, `ui/`, `three/` (khung xem 3D và các robot trong `three/robots/`)
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
- Mô hình `.glb`: đặt vào `public/models/` và ghi đường dẫn vào cột `model_url` của sản phẩm.

## Chưa làm
Trang quản trị (Server Action đã có trong `src/app/actions/admin.ts`, chưa có giao diện), danh sách yêu thích, lọc theo hãng và khoảng giá, cổng thanh toán trực tuyến, gửi email, sitemap.
