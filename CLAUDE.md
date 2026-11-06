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
- `npm run models:audit`: đọc clip hoạt ảnh của từng mô hình, đối chiếu `src/lib/model-features.ts`, báo mẫu chưa đạt chuẩn biến hình/dáng; kiểm tra cả sản phẩm mẫu lẫn mô hình khai báo trong `model-features.ts` mà chỉ có trên CSDL thật (`--remote` đọc từ Supabase, không cần `data/`)
- `npm run media`: nén mô hình (meshopt, texture WebP) rồi tải mô hình và ảnh `data/products/*.webp` lên Supabase Storage, bucket công khai `media` (cần `SUPABASE_URL`, `SUPABASE_SECRET_KEY`)
- `npm run smoke`: bật `next dev` ở cổng 3100, mở mọi trang (cửa hàng và quản trị) với phiên quản trị tạm, báo trang trả sai mã hoặc có dấu hiệu lỗi (cần `DATABASE_URL`, `ADMIN_EMAIL`)
- `npm run test:pg`: chạy bộ test trên PostgreSQL thật (`DATABASE_URL`), mỗi file một schema tạm, xoá khi xong; chậm (khoảng 20 phút), dùng khi cần kiểm tra trên Supabase
- `npm run backup`: sao lưu mọi bảng thành JSON vào `data/backups/<thời điểm>/`, chỉ đọc. Không có lệnh khôi phục vào CSDL thật; cách khôi phục được diễn tập trong `test/backup.test.ts`
- `scripts/copy-ort.mjs` tự chạy sau `npm install` và trước `dev`, `build`: chép ONNX Runtime Web vào `public/image-search/ort/` (không nằm trong git) cho tìm kiếm bằng ảnh

## Cấu trúc
- `src/app/`: Server Action (`actions/`), Route Handler (`api/`, `media/`, `admin/api/anh` tải ảnh, `admin/xuat/[loai]` xuất CSV) và hai khu trang có khung riêng. Layout gốc chỉ có `<html>`, `<body>`, không vẽ đầu trang hay chân trang.
- `src/app/(store)/`: mọi trang của cửa hàng, bọc trong `StoreFrame` (đầu trang, chân trang). Tên nhóm không xuất hiện trên URL.
- `src/app/admin/`: website quản trị, không dùng thành phần nào của cửa hàng. Mở ở tên miền riêng `http://admin.localhost:3000/admin` (biến `ADMIN_HOST`, mặc định `admin.localhost`); `src/proxy.ts` trả 404 cho `/admin` trên tên miền cửa hàng và cho trang cửa hàng trên tên miền quản trị, và chuyển hướng 308 slug cũ của sản phẩm (`slug_redirects`). `(panel)/` là các trang có thanh bên (tổng quan, báo cáo bán hàng, kho, nhà cung cấp, sản phẩm, danh mục, thương hiệu, series, đơn hàng, khách hàng, đánh giá, nội dung cửa hàng, mã giảm giá, nhân viên, nhật ký), layout và từng trang đều gọi `requireStaff(quyền)` (thiếu phiên thì về đăng nhập, thiếu quyền thì 404), Server Action gọi `authorize(quyền)` và ghi nhật ký `audit_logs` qua `src/server/repo/audit.ts`; vai trò và ma trận quyền ở `src/lib/permissions.ts`. `dang-nhap/` là trang đăng nhập riêng. Phiên quản trị dùng cookie riêng `rs_admin` (chỉ gửi tới `/admin`), tách khỏi phiên `rs_session` của cửa hàng; mỗi cửa đăng nhập chỉ nhận đúng loại tài khoản của nó (quản trị nhận mọi vai trò nhân viên), tài khoản bị khoá (`is_active = false`) mất phiên ngay. Tài khoản quản trị tạo từ `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- `src/components/`: `layout/`, `product/`, `cart/`, `account/`, `order/`, `admin/`, `ui/`, `three/` (khung xem 3D và các robot trong `three/robots/`)
- `src/lib/`: mã dùng chung cho máy chủ và trình duyệt (`catalog.ts`, `cart.ts`, `format.ts`, `pricing.ts`, `vietqr.ts`)
- `src/server/`: mã chỉ chạy ở máy chủ. `db/` (kết nối, migration, dữ liệu mẫu), `repo/` (truy vấn), `auth/`, `catalog.ts` (truy vấn có cache). Sản phẩm có biến thể (`product_variants`); cửa hàng đọc view `product_list` (biến thể mặc định + số có thể bán). Mọi thay đổi tồn đi qua `movementStatements` trong `repo/inventory.ts` (sổ kho `stock_movements` + `stock_levels` + `inventory`, cùng giao dịch), `findInventoryDiscrepancies` để đối soát. Đơn hàng có ba trạng thái (`status`, `payment_status`, `shipping_status`); luật L2–L14 khai báo một lần trong `src/lib/order-flow.ts`, thực hiện qua `applyOrderAction` (`repo/orders.ts`) và action `orderAction`. Phiếu kho ở `repo/stock-documents.ts`; nội dung cửa hàng (banner, menu, trang, cài đặt) ở `repo/content.ts`; mã giảm giá, đánh giá, yêu thích, báo cáo ở `repo/coupons.ts`, `reviews.ts`, `wishlist.ts`, `sales-reports.ts`, `stock-reports.ts`
- Tìm kiếm bằng ảnh (AI, `docs/chuan/08-tich-hop-ai.md`): mô hình CLIP (ONNX) chạy trong Web Worker ở trình duyệt (`public/image-search/worker.js`), ảnh không gửi lên máy chủ. Phép tính dùng chung ở `src/lib/image-search.ts` (gộp góc nhìn, xếp hạng, luật τ/δ, hiệu chỉnh) và `src/lib/image-search-eval.ts`; phần trình duyệt (worker, dựng 12 góc bằng three.js, lập chỉ mục) ở `src/components/image-search/`. Trang khách `/tim-bang-anh`, API `POST /api/tim-bang-anh` (chỉ nhận vector), trang quản trị `/admin/tim-bang-anh` (lập chỉ mục, hiệu chỉnh, nhật ký; `ImageSearchWorkbench`), Server Action ở `src/app/actions/image-search.ts`, truy vấn ở `src/server/repo/image-search.ts`, cache ở `src/server/image-search.ts` (`IMAGE_SEARCH_TAG`). Mỗi vector gắn mã mô hình (`IMAGE_SEARCH_MODEL.id`, đổi qua `NEXT_PUBLIC_IMAGE_SEARCH_MODEL_*`); đổi mô hình thì phải lập chỉ mục lại
- `src/config/site.ts`: tên cửa hàng, phí vận chuyển, giới hạn số lượng
- `test/`: test Vitest cho lớp dữ liệu và các hàm thuần

## Quy ước
- Giao diện tiếng Việt, nền sáng; màu lấy từ biến trong `src/app/globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-brand`...).
- Trang cửa hàng `/san-pham` lọc qua tham số URL: `loai`, `gia-tu`, `gia-den`, `con-hang=1`, `thuong-hieu`, `series` (slug), `sap-xep`, `trang`; cột lọc là `ShopFilters` (form GET), lựa chọn lấy từ `getFilterOptions`.
- Tiền tệ VND qua `formatVnd` (`src/lib/format.ts`).
- Hiệu ứng động dùng Animate UI (`@animate-ui/react`, chạy trên `motion`): các thành phần đã tô màu theo giao diện ở `src/components/animate/` (Tabs, RadioGroup, Checkbox, Switch, số chạy `AnimatedNumber`/`AnimatedVnd`), biểu tượng động ở `src/components/animate/icons/` (chép từ registry của Animate UI, thêm biểu tượng mới theo cách đó). Radio, checkbox, switch của Animate UI nhận `name` và vẫn gửi giá trị trong FormData.
- Canvas WebGL chỉ chạy ở client: dùng `RobotViewerLoader` (`next/dynamic`, `ssr: false`).
- Đọc cookie, `params`, `searchParams` phải nằm trong component dưới `<Suspense>`. Dữ liệu danh mục công khai đi qua các hàm `"use cache"` trong `src/server/catalog.ts`; sau khi ghi thì gọi `updateTag(PRODUCTS_TAG)`.
- Không gọi `Date.now()` trong lúc dựng trang (Next.js báo lỗi prerender); dùng đồng hồ CSDL hoặc gọi trong Server Action.
- Truy vấn viết bằng SQL với dấu `?` cho tham số qua `getDb()` (`execute`, `batch`); `batch` chạy trong một giao dịch.
- Mọi Server Action tự kiểm tra quyền và dữ liệu đầu vào.
- Mô hình `.glb` và ảnh sản phẩm không nằm trong git, chỉ nằm trên Supabase Storage (bucket `media`); cột `model_url`, `image` lưu đường dẫn đầy đủ theo `MEDIA_BASE_URL`. Dự án làm việc thẳng trên Supabase, máy hiện tại không có thư mục `data/` (chỉ cần khi dùng `npm run models`, `npm run media`, `npm run backup`). Tóm tắt nơi lưu dữ liệu: `docs/giaithich/noi-luu-du-lieu.md`.
- Mô hình CC BY phải có mục trong `src/data/model-credits.json` (lấy được từ `asset.extras` của chính file `.glb`: tác giả, giấy phép, nguồn Sketchfab).
- Ảnh đại diện (`products.image`: thẻ sản phẩm, giỏ hàng, menu, gợi ý tìm kiếm) là ảnh dựng từ mô hình 3D cho mọi sản phẩm. Ảnh thật (lấy từ cửa hàng bán lẻ, dùng cho luận văn) khai báo ở `src/data/product-photos.ts`, chỉ vào thư viện ảnh `product_media` và chỉ hiện ở trang chi tiết (tab "Ảnh thật", mô hình 3D là tab "Xem 3D" ghi rõ là minh hoạ). Ảnh ghi vào CSDL một lần theo khoá `seed:product-photos-<ngày>` trong bảng `meta`; thêm ảnh thì đổi ngày của khoá (khoá `-v2` đã bị dùng trên CSDL chung). Ảnh phải nằm trên chính tên miền nguồn (`/cdn/shop/...` với cửa hàng Shopify) để phần ghi nguồn nhận đúng.
- Clip biến hình/hợp thể và dáng có sẵn của từng file khai báo trong `src/lib/model-features.ts`. Các mẫu Transformers Alliance khai báo qua `allianceModel()`; chọn clip bằng cách đo trên file (thân đứng thẳng, mặt không lệch quá 45° với dáng đứng), vì nhiều file có clip bị xoay nằm hoặc quay ngang. Nút đổi dạng luôn chạy hoạt ảnh, kể cả khi hệ điều hành bật "giảm chuyển động".
- Server Component không truyền `<Link>` (Client Component) làm con cho `Slot` của Animate UI (`asChild`): lúc dựng HTML, Slot trả rỗng và gây lỗi hydration. Dùng `ButtonLink` (`src/components/ui/ButtonLink.tsx`, `"use client"`).

## Giai đoạn hiện tại
Mọi nhánh (quản trị và kho T00–T26, tìm kiếm bằng ảnh, giao diện cửa hàng Mẫu B, ảnh thật) đã gộp vào `main`; làm việc trực tiếp trên `main`. CSDL Supabase có 76 sản phẩm đang bán, 38 trong số đó chỉ có trên CSDL thật (thêm qua quản trị), không có trong `seed-data.ts`. Đặc tả quản trị và kho: `docs/chuan/10-quan-tri-va-kho.md`; kiến trúc, API, kiểm thử: `docs/chuan/05-kien-truc.md`, `06-api.md`, `07-kiem-thu.md`. Khi tài liệu chuẩn và mã nguồn khác nhau, `docs/chuan/` đúng. **Không dùng chạy tự động** (`claude -p` theo vòng lặp, `/loop`): chủ dự án đã bỏ vì tốn hạn mức; mỗi việc làm trong phiên có người theo dõi.

## Chưa làm
Cổng thanh toán trực tuyến, gửi email, sitemap, sổ địa chỉ, ghi nhận hành vi người dùng và phần AI tìm theo mô tả chữ (`docs/chuan/00-quyet-dinh-nen-tang.md`; gợi ý sản phẩm dựa trên tương tác 3D: nghiên cứu, phương pháp và kế hoạch ở `docs/AI/`). Tìm kiếm bằng ảnh đã chạy (76/76 sản phẩm đã lập chỉ mục); cần bộ ảnh chụp thật để đo lại và hiệu chỉnh lại ngưỡng (`docs/chuan/08-tich-hop-ai.md` mục 11). Việc cần người thật làm trước khi mở bán: `docs/chuan/10-quan-tri-va-kho.md` mục 8.

Để sau (chủ dự án đã quyết định ngày 06/11/2026):
- 21 mô hình không có clip hoạt ảnh nào (các Gundam, Bumblebee, Optimus ROTB/G1, Megazord, Muteki Shogun...): muốn có biến hình/dáng thì phải thay file. Grimlock (`grimlock`) có 4 clip dạng khủng long, có thể khai báo thành dáng.
- 9 sản phẩm chưa có ảnh thật: Bruticus, Defensor, Predacon Megatron, Slag, Soundwave Prime, Star Saber, Wild Force Megazord, pháo tay Bumblebee, súng máy Zaku.
- Biến môi trường khi đưa lên mạng: `BANK_*` (chưa có thì chỉ có thanh toán khi nhận hàng), `NEXT_PUBLIC_SITE_URL`, `ADMIN_HOST`. `npm run smoke` cần `ADMIN_EMAIL` (CSDL đã có tài khoản quản trị; có thể truyền tạm khi chạy).
- `npm audit` chỉ báo lỗ hổng ở công cụ phát triển, không ở gói chạy production: không xử lý.
