# 07. Kiểm thử

Kế hoạch và kết quả kiểm thử phần quản trị website và quản lý kho, chạy ngày 16/10/2026 trên nhánh `auto/quan-tri-kho` (commit T25 `5f8ce01`). Kịch bản nghiệm thu lấy từ [10](10-quan-tri-va-kho.md) mục 7.

## 1. Cách kiểm thử

| Lớp | Công cụ | Lệnh | Chạy trên |
| --- | --- | --- | --- |
| Kiểu và quy tắc mã | TypeScript, ESLint | `npm run typecheck`, `npm run lint` | Mã nguồn |
| Lớp dữ liệu, Server Action, Route Handler, hàm thuần | Vitest | `npm test` | PGlite (PostgreSQL trong bộ nhớ), mỗi file test một CSDL riêng có migration và dữ liệu mẫu |
| Build production | Next.js | `npm run build` | Chạy migration lên Supabase, dựng sẵn trang |
| Mọi trang | `scripts/smoke.mjs` | `npm run smoke` | `next dev` cổng 3100, CSDL Supabase thật, phiên quản trị tạm |
| Bộ test trên PostgreSQL thật | Vitest, `scripts/test-pg.mjs` | `npm run test:pg` | Supabase, mỗi file test một schema tạm (xoá khi xong), chạy tuần tự; bỏ `backup.test.ts` (cần quyền superuser) |

Quy ước:

- Test gọi thẳng hàm repo hoặc Server Action (giả lập `next/headers` để có cookie phiên, giả lập `next/cache`, `next/navigation`), không qua trình duyệt.
- Test không gọi Supabase Storage thật: `src/server/storage.ts` được thay bằng bản giả ghi lại file tải lên, đọc, xoá.
- Tên test bắt đầu bằng mã kịch bản để tra cứu (`EC-06: ...`).
- Sau mỗi test trong `orders.test.ts`, `findInventoryDiscrepancies()` phải trả rỗng (sổ kho khớp số dư).

## 2. Kết quả tổng

| Hạng mục | Kết quả |
| --- | --- |
| `npm run typecheck` | Qua, không lỗi |
| `npm run lint` | Qua, không cảnh báo |
| `npm test` | 23 file, 125 test, tất cả qua |
| `npm run build` | Qua |
| `npm run smoke` | Mọi trang trả đúng mã mong đợi, không có dấu hiệu lỗi trong HTML |

### Kiểm tra trên Supabase thật (16/10/2026)

| Hạng mục | Kết quả |
| --- | --- |
| `npm run test:pg` | 22 file, 124 test: 123 qua. PERF-01 trượt (khoảng 440 ms so với ngưỡng 300 ms); ngưỡng này đo trên PGlite, trên Supabase mỗi truy vấn đi qua mạng |
| Lược đồ `public` | Đủ 15 migration (`001_init` → `015_slug_redirects`); 34 bảng đều bật RLS, không có chính sách |
| Dữ liệu | Đối soát sổ kho với số dư theo vị trí, số tổng và hàng đang giữ: không lệch; mọi đơn có tổng = tạm tính − giảm + phí vận chuyển; 39 sản phẩm đã xuất bản đều có biến thể đang bật |
| Storage | 39 mô hình và ảnh công khai trả 200. Luồng tải `.glb` của T22 chạy đúng với Storage thật: xin URL có chữ ký, CORS cho phép trình duyệt, PUT không cần khoá bí mật, đọc 12 byte đầu bằng Range (`glTF`, phiên bản 2, độ dài khớp), xoá (file thử đã xoá) |
| `npm run build`, `npm run smoke` | Qua; 59 trang đúng mã mong đợi |
| `npm run backup` | 34 bảng, 327 dòng |

Lần chạy đầu `npm run test:pg` lộ hai lỗi của bộ test (không phải của ứng dụng), đã sửa: chạy song song thì các schema chờ nhau ở khoá tư vấn lúc chạy migration tới quá `statement_timeout` (nay chạy tuần tự); phiên đăng nhập giả lập chỉ sống 60 giây, hết hạn giữa file test chạy qua mạng (nay một giờ).

Hai lần không ổn định ghi nhận trong phiên (lần chạy lại đều qua, không đổi mã):

- `coupons.test.ts` một lần lỗi ở bước chuẩn bị CSDL khi chạy song song 18 file (5 test bị bỏ qua), nhiều khả năng quá `hookTimeout` 30 giây khi máy bận.
- `npm run build` một lần báo hàm `"use cache"` quá giờ khi dựng sẵn `/san-pham/rx-78-2-gundam`; build dựng sẵn mọi trang sản phẩm qua mạng tới Supabase.

## 3. Kịch bản nghiệm thu

| Mã | Kịch bản | File test | Kết quả |
| --- | --- | --- | --- |
| WH-01 | Phiếu nhập dự kiến 10, thực nhận 8 | `stock-documents.test.ts` | Qua |
| WH-02 | Ghi sổ một phiếu hai lần, kể cả song song | `stock-documents.test.ts` | Qua |
| WH-03 | Xuất 11 khi khả dụng 8 (phiếu xuất và đặt hàng) | `stock-documents.test.ts`, `orders.test.ts` | Qua |
| WH-04 | Kiểm kê sổ 8, đếm 7 | `stock-documents.test.ts` | Qua |
| WH-05 | Hàng hoàn (L11), phiếu hàng trả vào cách ly | `orders.test.ts`, `stock-documents.test.ts` | Qua |
| WH-06 | Kiểm kê khi vị trí có biến động sau lúc chụp số | `stock-documents.test.ts` | Qua |
| WH-07 | Chuyển 3 từ kệ sang cách ly | `stock-documents.test.ts` | Qua |
| WH-08 | Giá vốn bình quân 100.000 và 200.000 | `stock-documents.test.ts` | Qua |
| WH-09 | Người tạo tự ghi sổ phiếu điều chỉnh | `stock-documents.test.ts` | Qua |
| WH-10 | Đối soát sau chuỗi thao tác ngẫu nhiên | `stock-reports.test.ts` | Qua |
| EC-01 | Sản phẩm `draft` còn tồn | `orders.test.ts` | Qua |
| EC-02 | Hai khách cùng đặt món cuối | `orders.test.ts` | Qua |
| EC-03 | Đổi giá sau khi đặt | `orders.test.ts` | Qua |
| EC-04 | Banner hết thời gian hiệu lực | `content.test.ts` | Qua |
| EC-05 | Đặt hàng hai lần cùng `idempotency_key` | `orders.test.ts` | Qua |
| EC-06 | Mã giảm giá bị từ chối đúng lý do; mã hợp lệ cho tổng đúng | `coupons.test.ts` | Qua |
| EC-07 | Huỷ đơn có mã giảm giá trả lượt | `coupons.test.ts` | Qua |
| EC-08 | Bản nháp trang, banner không có ở cửa hàng | `content.test.ts` | Qua |
| SEC-01 | Gọi thẳng action khi thiếu quyền | `permissions.test.ts`, `taxonomy.test.ts` | Qua |
| SEC-02 | `viewer` mở hồ sơ khách: thông tin bị che ở máy chủ | `customers.test.ts` | Qua |
| SEC-03 | Không có `cost.view` thì không có giá vốn | `stock-reports.test.ts` | Qua |
| SEC-04 | Tài khoản bị khoá còn phiên | `permissions.test.ts` | Qua |
| SEC-05 | File đuôi `.png` không phải ảnh, ảnh quá 5 MB | `media.test.ts` | Qua |
| SEC-06 | Tự hạ quyền, khoá admin cuối cùng (kể cả song song) | `staff.test.ts` | Qua |
| AUD-01 | Đổi giá, ghi sổ, xuất bản banner, chuyển trạng thái đơn có đúng một dòng nhật ký | `content.test.ts`, `permissions.test.ts`, `products-admin.test.ts`, `staff.test.ts` | Qua |
| OPS-01 | Sao lưu rồi khôi phục vào CSDL trống | `backup.test.ts` | Qua |
| PERF-01 | 1.000 biến thể: trang đầu danh sách tồn, sản phẩm dưới 300 ms | `stock-reports.test.ts` | Qua (trên PGlite) |

## 4. Kiểm thử theo chức năng

Ngoài các kịch bản trên:

| Chức năng | File test | Nội dung chính |
| --- | --- | --- |
| Vòng đời đơn L2–L14 | `orders.test.ts` | COD và chuyển khoản đi hết vòng đời; giao thất bại, giao lại; huỷ song song chỉ giải phóng hàng một lần; hoàn tiền đúng một lần |
| Ma trận quyền | `permissions.test.ts` | Khớp từng ô bảng ở tài liệu 10 mục 3; trang thiếu quyền trả 404 |
| Sản phẩm, biến thể, ảnh | `products-admin.test.ts`, `media.test.ts`, `taxonomy.test.ts` | Điều kiện xuất bản, khoá SKU khi có sổ kho, lịch sử giá, danh mục 2 cấp |
| Mô hình 3D | `model-upload.test.ts` | Chỉ `catalog.edit` xin được URL; sai chữ ký, phiên bản, độ dài, quá 25 MB thì xoá; đường dẫn lạ bị từ chối |
| Kho | `warehouse.test.ts`, `stock-documents.test.ts`, `stock-reports.test.ts` | Vị trí, nhà cung cấp, phiếu, cách ly, thẻ kho, CSV chặn công thức |
| Nội dung | `content.test.ts` | Banner, menu, thanh thông báo, trang thông tin và phiên bản |
| Khách hàng | `customers.test.ts`, `users.test.ts` | Tìm kiếm, đồng ý nhận tin, khoá tài khoản xoá phiên |
| Đánh giá | `reviews.test.ts` | Điều kiện gửi, chỉ hiện `approved`, chuyển trạng thái |
| Yêu thích | `wishlist.test.ts` | Thêm, bỏ, không trùng |
| SEO | `seo.test.ts`, `proxy.test.ts` | Lưu meta; slug cũ về slug hiện tại; tách tên miền |
| Báo cáo | `dashboard.test.ts`, `sales-reports.test.ts` | Số liệu với dữ liệu dựng sẵn, chia ngày theo UTC+7, CSV theo quyền |
| Hàm thuần | `format.test.ts`, `vietqr.test.ts` | Định dạng tiền, ngày giờ Việt Nam, slug, phí vận chuyển, mã VietQR |

`npm run smoke` còn kiểm tra trên CSDL thật: slug cũ trả 308 (dòng tạm trong `slug_redirects`, xoá khi xong), CSV báo cáo bán hàng trả 200, `/admin` trên tên miền cửa hàng trả 404.

## 5. Giới hạn

- Không có kiểm thử đầu cuối bằng trình duyệt thật (dự án không cài Playwright): giao diện ở chiều rộng 375 px, thao tác bằng bàn phím mới được rà bằng đọc mã. Luồng tải `.glb` đã chạy với Storage thật bằng script, chưa bấm qua giao diện.
- PERF-01 đo trên PGlite trong bộ nhớ, chưa đo trên Supabase.
- Nghiệm thu với người dùng thật (UAT) chưa làm (tài liệu 10 mục 8).
