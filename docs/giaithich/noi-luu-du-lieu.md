# Dữ liệu của dự án nằm ở đâu

Ghi ngày 06/11/2026. Gần như toàn bộ dữ liệu nằm trên Supabase, chia làm hai phần: cơ sở dữ liệu và kho file. Ngoài ra có một ít dữ liệu nằm ngay trong mã nguồn, và ảnh thật của sản phẩm mẫu thì không nằm ở Supabase.

## 1. Cơ sở dữ liệu: Supabase PostgreSQL

Ứng dụng kết nối qua biến `DATABASE_URL` trong `.env.local`. Mọi dữ liệu nghiệp vụ nằm ở đây:

- sản phẩm, biến thể, danh mục, thương hiệu, series;
- tồn kho, sổ kho, phiếu kho, nhà cung cấp;
- đơn hàng, khách hàng, tài khoản nhân viên, nhật ký thao tác (`audit_logs`);
- đánh giá, mã giảm giá, yêu thích, "báo khi có hàng" (`stock_alerts`);
- nội dung cửa hàng: banner, menu, trang thông tin, cài đặt;
- vector của tìm kiếm bằng ảnh (`image_search_index`).

Các bảng tự được tạo ở lần chạy đầu, theo danh sách migration trong `src/server/db/migrations.ts`. Bảng `meta` ghi lại những bước khởi tạo đã chạy (ví dụ `migration:017_stock_alerts`, `seed:card-image-3d-v1`), để mỗi bước chỉ chạy một lần.

## 2. File media: Supabase Storage, bucket công khai `media`

| Đường dẫn trong bucket | Nội dung |
| --- | --- |
| `models/<slug>.glb` | Mô hình 3D của từng sản phẩm |
| `products/<slug>.webp` | Ảnh đại diện, dựng từ mô hình 3D; hiện ở thẻ sản phẩm, giỏ hàng, menu |

Ảnh banner và ảnh tải lên từ trang quản trị cũng được lưu trong bucket này.

Cột `model_url` và `image` của bảng `products` lưu đường dẫn đầy đủ tới các file này, theo biến `MEDIA_BASE_URL`.

## 3. Ảnh thật của sản phẩm mẫu: không nằm ở Supabase

Bảng `product_media` chỉ lưu đường link trỏ thẳng tới trang của các cửa hàng bán lẻ (otakumart.co.nz, hobbyco.com.au, japan-figure.com, lascalemodel.com, cmdstore.com, toyarena.com). Danh sách link khai báo ở `src/data/product-photos.ts`. Các ảnh này chỉ hiện ở trang chi tiết sản phẩm.

Nếu các cửa hàng đó đổi hoặc xoá ảnh thì trang chi tiết sẽ mất ảnh. Muốn chắc chắn hơn thì nên tải ảnh về rồi đưa lên Storage.

## 4. Dữ liệu nằm trong mã nguồn (có trong git)

| File | Nội dung |
| --- | --- |
| `src/server/db/seed-data.ts` | Danh sách sản phẩm mẫu, chỉ dùng để nạp CSDL lần đầu |
| `src/data/product-photos.ts` | Link ảnh thật và danh sách "Trong hộp" của sản phẩm mẫu |
| `src/lib/model-features.ts` | Clip biến hình và các dáng có sẵn của từng mô hình 3D |
| `src/data/model-credits.json` | Tác giả và giấy phép của các mô hình 3D |
| `src/config/site.ts` | Tên cửa hàng, phí vận chuyển, giới hạn số lượng |

Sau lần nạp đầu, sửa `seed-data.ts` không làm đổi dữ liệu đã có trong CSDL. Muốn đổi sản phẩm thì sửa trong trang quản trị.

## 5. Thư mục `data/` ở máy (không có trong git)

Đây là chỗ để file gốc trước khi tải lên Storage:

| Thư mục | Nội dung | Lệnh tạo ra |
| --- | --- | --- |
| `data/models-raw/` | Mô hình gốc tải từ Sketchfab | `npm run models` |
| `data/models/` | Mô hình đã nén | `npm run media` |
| `data/products/` | Ảnh sản phẩm `.webp` | |
| `data/backups/<thời điểm>/` | Bản sao lưu mọi bảng dạng JSON | `npm run backup` |

`npm run media` nén mô hình rồi tải mô hình và ảnh trong `data/` lên Storage.

Hiện dự án làm việc thẳng trên Supabase nên không dùng thư mục `data/` (quyết định ngày 06/11/2026); máy `THINKPAD` không có thư mục này. Chỉ cần tạo khi chạy một trong ba lệnh trên.

## 6. Khi chạy test

Test (`npm test`) dùng PGlite, một CSDL PostgreSQL tạm trong bộ nhớ, nên không đụng tới Supabase thật. Riêng `npm run test:pg` chạy trên CSDL thật trong các schema tạm, rồi xoá khi xong.

## 7. Biến môi trường liên quan

| Biến | Dùng cho |
| --- | --- |
| `DATABASE_URL` | Kết nối CSDL |
| `MEDIA_BASE_URL` | Đường dẫn gốc của bucket `media`, ghép vào `model_url` và `image` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Tải file lên Storage (`npm run media`, trang quản trị) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Tạo tài khoản quản trị đầu tiên; `npm run smoke` cũng cần `ADMIN_EMAIL` |

Các biến này nằm trong `.env.local`, không có trong git.
