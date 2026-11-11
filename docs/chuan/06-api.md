# 06. Server Action và Route Handler

Danh sách mọi điểm vào máy chủ mà trình duyệt gọi được, như mã nguồn ngày 16/10/2026 (bổ sung tìm kiếm bằng ảnh ngày 04/11/2026; Nhiệm vụ, Gacha, Cộng đồng, Xưởng ngày 07/11/2026). Mọi Server Action là một điểm cuối HTTP công khai (gọi thẳng được, không cần đi qua giao diện), nên mỗi action tự kiểm tra phiên, quyền và dữ liệu đầu vào. Quyền theo ma trận ở [05](05-kien-truc.md) mục 7; `admin` có mọi quyền.

Ký hiệu cột Phiên: **—** không cần đăng nhập; **Khách** cần phiên cửa hàng (`rs_session`); **NV: quyền** cần phiên quản trị (`rs_admin`) và quyền đó. Cột Nhật ký: có ghi `audit_logs` khi thao tác đổi dữ liệu.

Kết quả trả về của form theo kiểu `FormState`: `{ ok?, message?, errors?, values? }`; thiếu quyền trả `{ message: "Bạn không có quyền thực hiện thao tác này." }` và không ghi gì.

## 1. Cửa hàng

### `src/app/actions/auth.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `registerAction` | — | Đăng ký tài khoản khách, ô đồng ý nhận tin không đánh sẵn | 10 lần/giờ/IP |
| `loginAction` | — | Đăng nhập cửa hàng; chỉ nhận tài khoản khách | 8 lần/15 phút/email, 40/15 phút/IP |
| `logoutAction` | Khách | Xoá phiên cửa hàng | |
| `updateProfileAction` | Khách | Cài đặt > Hồ sơ: sửa họ tên, điện thoại | Email không đổi được |
| `changePasswordAction` | Khách | Đổi mật khẩu, đăng xuất các thiết bị khác | 8 lần/15 phút/tài khoản |
| `saveAddressAction`, `setDefaultAddressAction(id)`, `deleteAddressAction(id)` | Khách | Sổ địa chỉ (YC-TKH-03, `src/app/actions/account.ts`): thêm, sửa, đặt mặc định, xoá | Chỉ địa chỉ của chính tài khoản; tối đa 10; luôn đúng một mặc định khi sổ có địa chỉ; `users.address`, `city` chép theo địa chỉ mặc định |
| `updateNotificationsAction` | Khách | Cài đặt > Thông báo: đồng ý nhận tin khuyến mãi qua email | Thời điểm đồng ý chỉ đổi khi đổi lựa chọn (YC-KH-04) |
| `logoutOtherDevicesAction` | Khách | Đăng xuất mọi thiết bị khác, giữ phiên đang dùng | — |
| `deleteAccountAction` | Khách | Tự xoá tài khoản: ẩn danh hoá `users` (email `da-xoa-<id>@robotica.invalid`, xoá tên, điện thoại, địa chỉ, khoá đăng nhập, `deleted_at`), xoá phiên, sổ địa chỉ, yêu thích, yêu cầu báo có hàng; giữ đơn hàng, đánh giá; ghi nhật ký `customer.self_delete` | Cần mật khẩu và gõ "XOA TAI KHOAN"; từ chối khi còn đơn chưa hoàn tất hoặc huỷ; 5 lần/15 phút |
| `adminLoginAction` | — | Đăng nhập quản trị; chỉ nhận tài khoản nhân viên | Như `loginAction`; ghi nhật ký cả lần thất bại |
| `adminLogoutAction` | NV | Xoá phiên quản trị | |

### `src/app/actions/orders.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `placeOrderAction` | — (khách đăng nhập thì gắn đơn vào tài khoản) | Dòng có thể kèm `pre` (0/1: khách thấy là hàng đặt trước, khác máy chủ thì báo `preorder_changed`); `paymentPlan` `deposit` (mặc định) hoặc `full`; hàng đặt trước cần trả trước mà trả đủ bằng COD thì từ chối. Tạo đơn từ giỏ: kiểm tra từng trường, lấy giá và tồn từ CSDL, giữ hàng, ghi lượt mã giảm giá, một giao dịch. Mỗi dòng có thể kèm `cfg` (cấu hình Xưởng, `src/lib/workshop.ts`): máy chủ đọc lại cfg theo danh mục, đơn giá = giá biến thể + giá tuỳ chọn, lưu `order_items.options`, `options_price`, `options_config`; cfg sai báo dòng `unavailable`. Cùng biến thể khác cfg là các dòng riêng, tồn và giữ hàng tính chung theo biến thể | `idempotencyKey` 32 ký tự hex; 20 đơn/giờ/IP; trả danh sách sản phẩm vừa đổi hoặc lý do mã bị từ chối |
| `previewCouponAction(code, items)` | — | Xem trước số tiền giảm của mã trên giỏ hiện tại (giá dòng gồm tuỳ chọn Xưởng) | 30 lần/15 phút/IP; khi đặt hàng tính lại từ đầu |
| `cancelOrderAction(token)` | Ai có liên kết đơn | Khách tự huỷ đơn còn `pending` (L12): trả hàng, trả lượt mã giảm giá | |
| `lookupOrderAction` | — | Tra cứu đơn bằng mã đơn và số điện thoại, chuyển tới trang đơn | 10 lần/15 phút/IP |

### `src/app/actions/reviews.ts`, `wishlist.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `submitReviewAction` | Khách | Đánh giá 1–5 sao, nhận xét ≤ 1000 ký tự cho một dòng đơn | Chỉ dòng đơn thuộc đơn `completed` của chính khách, mỗi dòng một lần; vào trạng thái `pending` |
| `setWishlistAction(productId, on)` | Khách | Thêm hoặc bỏ yêu thích | Chưa đăng nhập trả `{ login: true }`; chỉ sản phẩm `published`; không tạo dòng trùng |

### `src/app/actions/stock-alerts.ts`

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `requestStockAlertAction(variantId, contact)` | Khách hoặc vãng lai | "Báo khi có hàng" cho một biến thể: ghi email (chữ thường) hoặc số điện thoại (chuẩn hoá 0xxxxxxxxx) vào `stock_alerts` | Đã đăng nhập mà để trống liên hệ thì dùng email tài khoản; vãng lai để trống trả `{ needContact: true }`. Chỉ biến thể đang bật của sản phẩm `published`; một yêu cầu đang chờ cho mỗi liên hệ và biến thể (đăng ký lặp trả `ok` kèm lời báo); tối đa 30 yêu cầu đang chờ mỗi liên hệ. Chưa gửi email tự động |

### `src/app/actions/quests.ts` (Xu và Nhiệm vụ, `/nhiem-vu`)

Xu ghi trong sổ `coin_ledger` (mỗi dòng cộng hoặc trừ, duy nhất theo người dùng, lý do, mã tham chiếu nên không nhận trùng); số dư là tổng sổ. Ngày tính theo giờ Việt Nam từ đồng hồ CSDL. Các thao tác cộng trừ xu của một người chạy tuần tự nhờ khoá tư vấn (`pg_advisory_xact_lock`).

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `checkInAction` | Khách | Điểm danh ngày: +10 xu, đủ 7 ngày liên tiếp thêm 50 xu | Mỗi ngày một lần |
| `claimRewardAction(kind, ref)` | Khách | Nhận xu của nhiệm vụ một lần (`quest`: hồ sơ, yêu thích, đơn đầu tiên, đánh giá, cộng đồng, gacha), chương truyện đã đọc (`comic`), đơn đã hoàn tất (`order`, 1 xu mỗi 10.000 ₫ đã trả) | Máy chủ tự kiểm tra điều kiện; nhận lại trả lời báo đã nhận |
| `markComicReadAction(chapter)` | — | Ghi `comic_reads` khi khách cuộn tới cuối chương | Vãng lai trả `{ recorded: false }`; chương không có thì bỏ qua |

### `src/app/actions/gacha.ts` (`/gacha`)

`series` là mã series trong `SERIES_LIST` (`s1`: Kệ ROBOTICA, `s2`: Đội Khủng Long), mặc định `s1`; mã khác thì từ chối. `craftAction` tự nhận series theo mã thẻ.

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `pullAction(mode, series)` | Khách | `single`: 1 lượt máy quay (100 xu); `ten`: 10 lượt (900 xu); `free`: lượt miễn phí trong ngày; `pack`: gói 5 thẻ (450 xu, thẻ thứ 5 chắc chắn từ Hiếm trở lên). Tỷ lệ công khai 70/22/7/1 (`src/lib/gacha.ts`), 9 lượt liền không ra Hiếm thì lượt thứ 10 chắc chắn Hiếm trở lên. Thẻ Hiếm trở lên tạo mã giảm giá `GACHA-XXXXXXXX` (dùng 1 lần, hạn 30 ngày); thẻ trùng thành mảnh ghép (Thường 2, Hiếm 5, Siêu hiếm 15, Bí mật 40). Trả `{ results, balance, shards }` | `mode` khác 4 giá trị trên thì từ chối; 30 lần/phút/tài khoản; trừ xu (hoặc ghi lượt miễn phí), ghi lượt, tạo mã, cộng mảnh trong một giao dịch: thiếu xu hoặc hôm nay đã quay miễn phí thì không ghi gì (chỉ mục duy nhất theo ngày chặn bấm dồn). Không gọi `refresh()`: trang tự làm mới sau hoạt ảnh. Chỉ trả bằng xu, không nạp tiền |
| `openBoxAction(slot, series)` | Khách | Mở hộp số `slot` (0–11) trên kệ hộp mù: 250 xu, kệ 12 hộp chứa đủ 12 thẻ của series (máy chủ xếp khi mở hộp đầu tiên), không kèm mã giảm giá; thẻ trùng thành mảnh ghép. Trả `{ result, slot, balance, shards, finished }` (`finished`: vừa mở hết kệ, kệ mới tự xếp) | Hộp đã mở, vị trí sai, thiếu xu thì không ghi gì; điều kiện "hộp chưa mở" nằm trong câu trừ xu nên bấm hai lần chỉ trừ một lần; 30 lần/phút chung với `pullAction` |
| `openAllBoxesAction(series)` | Khách | Mua và mở một lúc mọi hộp còn niêm phong trên kệ hộp mù: giá = số hộp còn lại × 250 xu. Trả `{ results (kèm slot), balance, shards, finished }` | Một giao dịch; câu trừ xu kèm điều kiện "số hộp đã mở không đổi", nên nếu giữa chừng có hộp vừa bị mở ở nơi khác thì không trừ, không ghi gì (báo khách bấm lại); thiếu xu thì không ghi gì |
| `craftAction(card)` | Khách | Ghép một thẻ còn thiếu bằng mảnh: Thường 20 mảnh, Hiếm 50 mảnh | Thẻ đã có, thẻ Siêu hiếm/Bí mật, không đủ mảnh thì từ chối; điều kiện nằm trong câu trừ mảnh nên bấm hai lần chỉ ghép một thẻ; 30 lần/phút |
| `claimSetAction(series)` | Khách | Đủ 12 thẻ của series thì nhận mã giảm 300.000 ₫ cho đơn từ 1.500.000 ₫ (dùng 1 lần, hạn 30 ngày) | Một lần mỗi series (`gacha_rewards`); ai đã nhận 500 xu theo luật cũ coi như đã nhận |

### `src/app/actions/community.ts` (`/cong-dong`, phần khách)

| Action | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `addCommentAction(postId)` | Khách | Bình luận 2–500 ký tự vào bài đã duyệt | 20 lần/10 phút/tài khoản; hiện ngay, nhân viên ẩn được |
| `toggleLikeAction(postId)` | Khách | Thả hoặc bỏ tim | Chỉ bài đã duyệt |
| `reportAction(target, id, reason)` | Khách | Báo cáo bài hoặc bình luận (lý do trong `REPORT_REASONS`) | Mỗi người một báo cáo đang mở cho mỗi nội dung |

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
| `orderAction(id, key, ...)` | NV: quyền của luật (`orders.process`, `orders.fulfil` hoặc `payments.manage`) | Một thao tác L2–L15 trên đơn (`src/lib/order-flow.ts`); L6 cần hãng và mã vận đơn | Có |
| `setCustomerActiveAction(id, active)` | NV: `customers.manage` | Khoá, mở khoá tài khoản khách; khoá thì xoá mọi phiên | Có |
| `createStaffAction`, `updateStaffAction` | NV: `staff.manage` | Tạo tài khoản nhân viên; đổi vai trò, khoá, mở khoá; không hạ quyền hoặc khoá admin cuối cùng | Có |

### `src/app/actions/image-search.ts` (tìm kiếm bằng ảnh, [08](08-tich-hop-ai.md))

| Action | Phiên | Việc | Nhật ký |
| --- | --- | --- | --- |
| `saveImageIndexAction(payload)` | NV: `catalog.edit` | Lưu chỉ mục của một sản phẩm: mỗi dạng (`default`, `alt`) 1–24 vector góc nhìn base64 (512 số float32, đã chuẩn hoá). Từ chối khi sai mã mô hình, vector sai, dạng trùng, hoặc `sourceUrl` khác `products.model_url` hiện tại. Máy chủ tự gộp trung bình, thay toàn bộ dòng cũ của cùng mô hình | Có (`image_search.index`) |
| `deleteImageIndexAction(productId)` | NV: `catalog.edit` | Xoá chỉ mục của sản phẩm với mô hình đang dùng | Có (`image_search.unindex`) |
| `loadCalibrationAction()` | NV: `catalog.edit` | Vector đại diện và vector từng góc của mọi sản phẩm đang bán đã lập chỉ mục, cho hiệu chỉnh chạy ở trình duyệt | |
| `saveThresholdsAction({ tau, delta, calibration })` | NV: `catalog.edit` | Đặt τ ∈ [0, 1], δ ∈ [0, 2]. Kèm kết quả hiệu chỉnh đúng cặp ngưỡng thì ghi `source: calibrated` cùng bản đã làm sạch của kết quả; khác cặp thì `manual` và bỏ kết quả | Có (`image_search.thresholds`) |

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
| `moderatePostAction(id, status, note)`, `setCommentStatusAction(id, status)`, `dismissReportAction(id)` | NV: `community.moderate` | Cộng đồng (`/admin/cong-dong`): duyệt hoặc ẩn bài (lý do ẩn gửi tác giả), ẩn hoặc hiện lại bình luận, bỏ qua báo cáo. Ẩn bài thì đóng luôn các báo cáo đang mở của bài | Có (`community_post.*`, `community_comment.*`, `community_report.dismiss`) |
| `markStockAlertsNotifiedAction(ids)` | NV: `customers.manage` | Đánh dấu đã báo khách có hàng (1–100 yêu cầu đang chờ); danh sách ở `/admin/khach-hang/cho-hang` (xem cần `customers.view`) | Có (`stock_alert.notify`, mỗi yêu cầu một dòng) |

### `src/app/actions/preorders.ts` (đặt trước, `/admin/dat-truoc`, [04](04-trang-thai.md) mục 5.1)

| Action | Phiên | Việc | Nhật ký |
| --- | --- | --- | --- |
| `createOfferAction` | NV: `catalog.edit` | Mở đợt đặt trước cho một phiên bản: ngày dự kiến về (từ hôm nay tới 2 năm), % cọc 0–100, số suất (bỏ trống là không giới hạn), ghi chú ≤ 300 ký tự; phiên bản đã có đợt chưa kết thúc thì từ chối | Có (`preorder.create`) |
| `updateOfferAction` | NV: `catalog.edit` | Sửa đợt; số suất không nhỏ hơn số đã đặt; đổi ngày về thì gửi thư cho mọi đơn đang chờ hàng | Có (`preorder.update`) |
| `setOfferAcceptingAction(id, open)` | NV: `catalog.edit` | Ngừng nhận đặt hoặc mở lại | Có (`preorder.close`, `preorder.open`) |
| `endOfferAction(id)` | NV: `catalog.edit` | Kết thúc đợt (phiên bản bán lại như thường); còn đơn chờ hàng thì từ chối | Có (`preorder.end`) |
| `allocateOfferAction(id)` | NV: `orders.fulfil` | Phân bổ hàng đã về theo thứ tự đặt (mỗi đơn một giao dịch); báo khách các đơn đã đủ hàng | Có (`preorder.allocate`, mỗi đơn đủ hàng một dòng) |

## 3. Route Handler

| Đường dẫn | Phiên | Việc | Ghi chú |
| --- | --- | --- | --- |
| `GET /api/cart?ids=` | — | Giá, tồn hiện tại của các biến thể trong giỏ | Tối đa 50 mã; `no-store` |
| `GET /api/wishlist` | — | Mã sản phẩm khách đã yêu thích; `{ ids: null }` khi chưa đăng nhập | `private, no-store` |
| `GET /api/tai-khoan/du-lieu` | Khách đã đăng nhập | Tải dữ liệu cá nhân (file JSON): hồ sơ, sổ địa chỉ, đơn hàng kèm dòng hàng, đánh giá, yêu thích, yêu cầu báo có hàng, sổ xu, lượt quay gacha, sổ mảnh ghép, thưởng đủ bộ, bài và bình luận cộng đồng; không có mật khẩu, mã phiên | Chưa đăng nhập 401; 10 lần/giờ; `no-store` |
| `POST /api/cong-dong/bai-viet` | Khách | Đăng bài Cộng đồng (multipart): `topic`, `body` 10–2000 ký tự, `product` (slug sản phẩm gắn kèm) tuỳ chọn, tối đa 4 ảnh WebP, PNG, JPEG mỗi ảnh ≤ 3 MB, tải lên Storage `community/<id>-n.<đuôi>`. Bài vào trạng thái `pending`, hiện công khai sau khi nhân viên duyệt | Chưa đăng nhập 401; 5 bài/giờ (429); kiểm tra chữ ký file ảnh; thân quá lớn 413 |
| `GET /api/goi-y?q=` | — | Gợi ý cho ô tìm kiếm ở đầu trang: `{ terms, products, total }`, tối đa 3 cụm từ (`src/lib/search-suggest.ts`) và 5 sản phẩm đang bán | Từ khoá dưới 2 ký tự trả rỗng, không truy vấn; cắt còn 80 ký tự; `public, max-age=60` |
| `POST /api/tim-bang-anh` | — | Tìm bằng ảnh: thân JSON `{ model, embedding: number[512], clientMs? }`. Trả `{ accepted, reason, s1, s2, tau, delta, candidates, results: [{ product, score, form, label }] }`, tối đa 8 sản phẩm đang bán, xếp giảm dần | 30 lượt/phút/IP (429 kèm `Retry-After`); thân > 64 KB trả 413; vector sai 400; `model` khác mô hình đang dùng 409 `model-mismatch`; chưa có chỉ mục 409 `not-ready`; `no-store`. Ghi `image_search_logs` sau khi trả lời (`after`) |
| `GET /media/[file]` | — | Ảnh đại diện lưu trong CSDL (dữ liệu cũ), cache vĩnh viễn theo phiên bản trong tên | |
| `GET /admin/api/thong-bao` | NV (mọi vai trò) | Thông báo của khu quản trị: `{ counts, events }`. `counts` là số việc đang chờ theo từng loại trong `src/lib/admin-alerts.ts` (đơn cần xử lý, chuyển khoản quá 48 giờ, chờ hoàn tiền, chờ đóng gói, phiếu chờ ghi sổ, hàng cách ly, khách chờ mẫu đã có hàng, đánh giá và bài cộng đồng chờ duyệt, bài bị báo cáo, banner sắp hết lịch), chỉ các loại vai trò đó có quyền xử lý; `events` là đơn, bài, đánh giá chờ duyệt mới nhất | Thanh bên hỏi mỗi 20 giây; chưa đăng nhập 403; `no-store` |
| `POST /admin/api/anh` | NV: `catalog.edit` (ảnh sản phẩm) hoặc `content.edit` (`target=banner`) | Tải ảnh WebP, PNG, JPEG ≤ 5 MB lên Storage | Kiểm tra chữ ký file; có nhật ký |
| `GET /admin/xuat/ton-kho` | NV: `inventory.view` | CSV tồn kho theo bộ lọc; cột giá vốn chỉ khi có `cost.view` | Tối đa 20.000 dòng |
| `GET /admin/xuat/the-kho?bien-the=` | NV: `inventory.view` | CSV thẻ kho của một biến thể | |
| `GET /admin/xuat/ban-hang?tu=&den=` | NV: `reports.view` | CSV báo cáo bán hàng theo ngày | Khoảng ngày sai hoặc quá 366 ngày trả 400 |
| `GET /admin/xuat/ban-chay?tu=&den=` | NV: `reports.view` | CSV sản phẩm bán chạy | Như trên |

CSV mã hoá UTF-8 có BOM (Excel mở đúng tiếng Việt), chặn tiêm công thức.

## 4. Proxy

`src/proxy.ts` chạy trước mọi yêu cầu (trừ tài nguyên tĩnh): tách tên miền cửa hàng và quản trị, và chuyển hướng 308 slug cũ của sản phẩm. Chi tiết ở [05](05-kien-truc.md) mục 2.
