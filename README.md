# ROBOTICA

Cửa hàng trực tuyến bán mô hình robot sưu tầm, có khung xem 3D tương tác cho từng sản phẩm.

## Chạy thử

Cần Node.js 22 trở lên và một cơ sở dữ liệu PostgreSQL (ví dụ Supabase).

1. Tạo project trên Supabase, vào **Project Settings > Database > Connection string**, chép chuỗi ở mục **Transaction pooler**.
2. Chép `.env.example` thành `.env.local` và dán chuỗi đó vào `DATABASE_URL` (thay mật khẩu thật).
3. Chạy:

```bash
npm install
npm run dev
```

Mở http://localhost:3000. Lần chạy đầu tự tạo các bảng và nạp 12 sản phẩm mẫu vào cơ sở dữ liệu. `npm run build` cũng cần `DATABASE_URL` vì các trang sản phẩm được dựng sẵn từ dữ liệu.

Các lệnh khác: `npm run build` rồi `npm start` (bản production), `npm test`, `npm run lint`, `npm run typecheck`.

## Tính năng hiện có

- Trang chủ, cửa hàng (tìm kiếm không dấu, lọc danh mục, sắp xếp, phân trang), trang chi tiết sản phẩm.
- Khung xem 3D: kéo để xoay, nút phóng to/thu nhỏ, giữ Ctrl và cuộn để phóng, nút về góc nhìn ban đầu.
- Giỏ hàng lưu trong trình duyệt; giá và tồn kho luôn lấy từ máy chủ.
- Đặt hàng (khách vãng lai hoặc có tài khoản), trừ tồn kho, trang theo dõi đơn, tự huỷ đơn khi còn chờ xác nhận, tra cứu đơn bằng mã và số điện thoại.
- Đăng ký, đăng nhập, sửa thông tin, đổi mật khẩu, lịch sử đơn hàng.

## Dữ liệu minh hoạ

Toàn bộ sản phẩm, giá, tồn kho và thông số trong `src/server/db/seed-data.ts` là dữ liệu mẫu, không phải hàng chính hãng của thương hiệu nào. Các robot 3D là mô hình dựng bằng hình học trong `src/components/three/robots/`, chưa có file `.glb` thật.

## Thêm ảnh và mô hình 3D

- Ảnh sản phẩm: đặt file vào `public/products/` và ghi đường dẫn (ví dụ `/products/ten.webp`) vào cột `image` của sản phẩm.
- Mô hình `.glb`: đặt file vào `public/models/` và ghi đường dẫn (ví dụ `/models/ten.glb`) vào cột `model_url`. Khung xem sẽ dùng file này thay cho mô hình dựng sẵn; nếu file lỗi thì quay về mô hình dựng sẵn. Không hỗ trợ file nén Draco.

Sửa dữ liệu mẫu trong `seed-data.ts` chỉ có tác dụng với cơ sở dữ liệu chưa từng được nạp.

## Cấu hình (trong `.env.local`)

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Bắt buộc. Chuỗi kết nối PostgreSQL. |
| `DATABASE_CA_CERT` | Tuỳ chọn. Đường dẫn file chứng chỉ CA để xác minh TLS của máy chủ CSDL. |
| `NEXT_PUBLIC_SITE_URL` | Địa chỉ công khai của trang. |
| `BANK_BIN`, `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` | Có đủ bốn biến thì bật thanh toán chuyển khoản kèm mã VietQR. Không có thì chỉ nhận thanh toán khi nhận hàng. |

Phí vận chuyển và giới hạn số lượng nằm trong `src/config/site.ts`.

## Chưa có

Trang quản trị (xác nhận đơn, sửa sản phẩm), danh sách yêu thích, lọc theo hãng và khoảng giá, cổng thanh toán trực tuyến, gửi email xác nhận.
