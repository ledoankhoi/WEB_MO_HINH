# 06. Server Action và Route Handler

Danh sách mọi điểm vào máy chủ mà trình duyệt gọi được, như mã nguồn ngày 16/10/2026. Mọi Server Action là một điểm cuối HTTP công khai (gọi thẳng được, không cần đi qua giao diện), nên mỗi action tự kiểm tra phiên, quyền và dữ liệu đầu vào. Quyền theo ma trận ở [05](05-kien-truc.md) mục 7; `admin` có mọi quyền.

Ký hiệu cột Phiên: **—** không cần đăng nhập; **Khách** cần phiên cửa hàng (`rs_session`); **NV: quyền** cần phiên quản trị (`rs_admin`) và quyền đó. Cột Nhật ký: có ghi `audit_logs` khi thao tác đổi dữ liệu.

Kết quả trả về của form theo kiểu `FormState`: `{ ok?, message?, errors?, values? }`; thiếu quyền trả `{ message: "Bạn không có quyền thực hiện thao tác này." }` và không ghi gì.

## 1. Cửa hàng

### `src/app/actions/auth.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `registerAction` | — | Đăng ký tài khoản khách, ô đồng ý nhận tin không đánh sẵn | 10 lần/giờ/IP |
| `loginAction` | — | Đăng nhập cửa hàng; chỉ nhận tài khoản khách | 8 lần/15 phút/email, 40/15 phút/IP |
| `logoutAction` | Khách | Xoá phiên cửa hàng | |
| `updateProfileAction` | Khách | Sửa họ tên, điện thoại, địa chỉ, đồng ý nhận tin | Thời điểm đồng ý chỉ đổi khi đổi lựa chọn |
| `changePasswordAction` | Khách | Đổi mật khẩu | 8 lần/15 phút/tài khoản |
| `adminLoginAction` | — | Đăng nhập quản trị; chỉ nhận tài khoản nhân viên | Như `loginAction`; ghi nhật ký cả lần thất bại |
| `adminLogoutAction` | NV | Xoá phiên quản trị | |

### `src/app/actions/orders.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `placeOrderAction` | — (khách đăng nhập thì gắn đơn vào tài khoản) | Tạo đơn từ giỏ: kiểm tra từng trường, lấy giá và tồn từ CSDL, giữ hàng, ghi lượt mã giảm giá, một giao dịch | `idempotencyKey` 32 ký tự hex; 20 đơn/giờ/IP; trả danh sách sản phẩm vừa đổi hoặc lý do mã bị từ chối |
| `previewCouponAction(code, items)` | — | Xem trước số tiền giảm của mã trên giỏ hiện tại | 30 lần/15 phút/IP; khi đặt hàng tính lại từ đầu |
| `cancelOrderAction(token)` | Ai có liên kết đơn | Khách tự huỷ đơn còn `pending` (L12): trả hàng, trả lượt mã giảm giá | |
| `lookupOrderAction` | — | Tra cứu đơn bằng mã đơn và số điện thoại, chuyển tới trang đơn | 10 lần/15 phút/IP |

### `src/app/actions/reviews.ts`, `wishlist.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `submitReviewAction` | Khách | Đánh giá 1–5 sao, nhận xét ≤ 1000 ký tự cho một dòng đơn | Chỉ dòng đơn thuộc đơn `completed` của chính khách, mỗi dòng một lần; vào trạng thái `pending` |
| `setWishlistAction(productId, on)` | Khách | Thêm hoặc bỏ yêu thích | Chưa đăng nhập trả `{ login: true }`; chỉ sản phẩm `published`; không tạo dòng trùng |

## 2. Quản trị

### `src/app/actions/admin.ts`

| Action | Phiên | Việc | Nhật ký |
| --- | --- | --- | --- |
| `saveProductAction` | NV: `catalog.edit` | Tạo, sửa sản phẩm và biến thể mặc định; SEO; ảnh chụp từ mô hình 3D. Xuất bản cần biến thể đang bật và ảnh đại diện. Đổi slug thì slug cũ chuyển hướng 308 | Có |
| `deleteProductAction(id)` | NV: `catalog.edit` | Xoá sản phẩm chưa có đơn, chưa có sổ kho; nếu có thì phải lưu trữ | Có |
| `saveVariantAction`, `variantAction` | NV: `catalog.edit` | Thêm, sửa biến thể; bật, tắt, đặt mặc định | Có (đổi giá ghi giá trước, sau) |
| `mediaAction(productId, mediaId, change)` | NV: `catalog.edit` | Sửa chữ thay thế, đổi thứ tự, đặt ảnh đại diện, xoá ảnh (xoá cả file trên Storage) | Có |
| `startModelUploadAction(productId)` | NV: `catalog.edit` | Cấp URL có chữ ký để trình duyệt tải `.glb` thẳng lên Storage | |
| `finishModelUploadAction(productId, path)` | NV: `catalog.edit` | Kiểm tra 12 byte đầu và kích thước file đã tải; đúng thì gắn vào sản phẩm, sai thì xoá file | Có |
| `saveTaxonomyAction`, `deleteTaxonomyAction` | NV: `catalog.edit` | Danh mục (2 cấp), thương hiệu, series; không xoá mục đang có sản phẩm | Có |
| `orderAction(id, key, ...)` | NV: quyền của luật (`orders.process`, `orders.fulfil` hoặc `payments.manage`) | Một thao tác L2–L14 trên đơn (`src/lib/order-flow.ts`); L6 cần hãng và mã vận đơn | Có |
| `setCustomerActiveAction(id, active)` | NV: `customers.manage` | Khoá, mở khoá tài khoản khách; khoá thì xoá mọi phiên | Có |
| `createStaffAction`, `updateStaffAction` | NV: `staff.manage` | Tạo tài khoản nhân viên; đổi vai trò, khoá, mở khoá; không hạ quyền hoặc khoá admin cuối cùng | Có |

### `src/app/actions/inventory.ts`

| Action | Phiên | Việc | Nhật ký |
| --- | --- | --- | --- |
| `saveLocationAction`, `setLocationActiveAction` | NV: `inventory.setup` | Vị trí kho (lưu kho, cách ly) | Có |
| `saveSupplierAction`, `setSupplierActiveAction` | NV: `inventory.setup` | Nhà cung cấp | Có |
| `createDocumentAction` | NV: `inventory.draft` | Tạo phiếu nhập, xuất, chuyển, điều chỉnh (nháp) | Có |
| `saveDraftAction` | NV: `inventory.draft` | Lưu dòng của phiếu nháp | Có |
| `documentAction(id, action)` | NV: `inventory.draft` (gửi, huỷ) hoặc `inventory.post` (trả lại, ghi sổ) | Đổi trạng thái phiếu; ghi sổ tạo biến động kho và giá vốn bình quân trong một giao dịch, chỉ một lần. Người tạo phiếu điều chỉnh không tự ghi sổ | Có |
| `startStocktakeAction` | NV: `inventory.draft` | Mở phiếu kiểm kê, chụp số sổ sách theo vị trí; vị trí có biến động sau lúc chụp thì không ghi sổ được | Có |
| `resolveQuarantineAction` | NV: `inventory.draft` | Xử lý hàng cách ly bằng phiếu nháp điền sẵn: phiếu chuyển về kệ bán, hoặc phiếu xuất huỷ; ghi sổ như mọi phiếu khác | Có |
| `setThresholdAction` | NV: `inventory.setup` | Ngưỡng sắp hết của biến thể | Có |

### `src/app/actions/content.ts`, `coupons.ts`, `reviews.ts`

| Action | Phiên | Việc | Nhật ký |
| --- | --- | --- | --- |
| `saveBannerAction`, `bannerAction` | NV: `content.edit` | Banner trang chủ: tạo, sửa, xuất bản, gỡ, xoá; khung thời gian theo giờ Việt Nam | Có |
| `saveNavItemAction`, `deleteNavItemAction` | NV: `content.edit` | Menu đầu trang, chân trang; liên kết nội bộ phải trỏ tới trang có thật | Có |
| `saveSettingsAction` | NV: `content.edit` | Liên hệ, thanh thông báo, chính sách | Có |
| `savePageAction`, `pageAction` | NV: `content.edit` | Trang thông tin: lưu nháp, xuất bản (thêm một bản lưu), gỡ, khôi phục bản cũ | Có |
| `saveCouponAction` | NV: `coupons.manage` | Tạo, sửa, bật, tắt mã giảm giá; hạn mức không nhỏ hơn số lượt đã dùng | Có |
| `moderateReviewAction(id, status)` | NV: `reviews.moderate` | Duyệt hoặc ẩn đánh giá (`pending` → `approved`/`hidden`, `approved` ⇄ `hidden`) | Có |

## 3. Route Handler

| Đường dẫn | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `GET /api/cart?ids=` | — | Giá, tồn hiện tại của các biến thể trong giỏ | Tối đa 50 mã; `no-store` |
| `GET /api/wishlist` | — | Mã sản phẩm khách đã yêu thích; `{ ids: null }` khi chưa đăng nhập | `private, no-store` |
| `GET /media/[file]` | — | Ảnh đại diện lưu trong CSDL (dữ liệu cũ), cache vĩnh viễn theo phiên bản trong tên | |
| `POST /admin/api/anh` | NV: `catalog.edit` (ảnh sản phẩm) hoặc `content.edit` (`target=banner`) | Tải ảnh WebP, PNG, JPEG ≤ 5 MB lên Storage | Kiểm tra chữ ký file; có nhật ký |
| `GET /admin/xuat/ton-kho` | NV: `inventory.view` | CSV tồn kho theo bộ lọc; cột giá vốn chỉ khi có `cost.view` | Tối đa 20.000 dòng |
| `GET /admin/xuat/the-kho?bien-the=` | NV: `inventory.view` | CSV thẻ kho của một biến thể | |
| `GET /admin/xuat/ban-hang?tu=&den=` | NV: `reports.view` | CSV báo cáo bán hàng theo ngày | Khoảng ngày sai hoặc quá 366 ngày trả 400 |
| `GET /admin/xuat/ban-chay?tu=&den=` | NV: `reports.view` | CSV sản phẩm bán chạy | Như trên |

CSV mã hoá UTF-8 có BOM (Excel mở đúng tiếng Việt), chặn tiêm công thức.

## 4. Proxy

`src/proxy.ts` chạy trước mọi yêu cầu (trừ tài nguyên tĩnh): tách tên miền cửa hàng và quản trị, và chuyển hướng 308 slug cũ của sản phẩm. Chi tiết ở [05](05-kien-truc.md) mục 2.
