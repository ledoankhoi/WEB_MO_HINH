# 10. Quản trị website và quản lý kho

Đặc tả cho giai đoạn **quản trị và kho**, chốt ngày 15/10/2026. Đầu vào là kế hoạch của chủ dự án ([../tham-khao/16-ke-hoach-quan-tri-kho.md](../tham-khao/16-ke-hoach-quan-tri-kho.md), bản chữ của file Word cùng tên). Tài liệu này giữ phần phù hợp, giải quyết chỗ mâu thuẫn với các tài liệu chuẩn khác và bổ sung chỗ còn thiếu.

Dữ liệu: [03-co-so-du-lieu.md](03-co-so-du-lieu.md). Trạng thái: [04-trang-thai.md](04-trang-thai.md). Thứ tự làm: [../ke-hoach/backlog-quan-tri-kho.md](../ke-hoach/backlog-quan-tri-kho.md).

## 1. Phạm vi

**Làm trong giai đoạn này:** các mục P0 và P1 ở mục 13.1 của kế hoạch, tức:

- P0: vai trò và phân quyền; danh mục SKU; một kho có nhiều vị trí; phiếu nhập, phiếu xuất; sổ kho; tồn khả dụng và giữ hàng; kiểm kê và điều chỉnh; sản phẩm và danh mục; ảnh sản phẩm; CMS trang chủ, banner, menu; khách hàng cơ bản; giỏ hàng và đơn hàng; lấy hàng, đóng gói, xuất kho; nhật ký thao tác; sao lưu.
- P1: nhập bằng máy quét mã vạch; cảnh báo sắp hết hàng; hàng cách ly và hàng hoàn; mã giảm giá; đánh giá; yêu thích; báo cáo giá trị tồn; SEO cơ bản; tải mô hình 3D qua trang quản trị.

**Không làm trong giai đoạn này:**

| Hạng mục | Lý do |
| --- | --- |
| Nhiều kho thật, điều chuyển giữa các kho, đơn mua hàng đầy đủ, đối soát COD (P2) | Kế hoạch xếp vào giai đoạn mở rộng. Cấu trúc dữ liệu đã có `warehouse_id` để thêm sau |
| Xuất nhập khẩu, đa tiền tệ (P3); dự báo, AI (P4) | Ngoài phạm vi |
| Thông báo đơn hàng qua email | Chưa chọn dịch vụ gửi email ([00](00-quyet-dinh-nen-tang.md) mục 5) |
| Phiếu hỗ trợ (ticket), form liên hệ có mã yêu cầu | Không có trong danh sách P0, P1 |
| Đổi trả do khách yêu cầu sau khi đã giao | Kế hoạch xếp "đổi trả nâng cao" vào P2. Giai đoạn này có nhận hàng hoàn do giao thất bại và phiếu nhập hàng trả do nhân viên lập |
| Theo dõi serial, lô hàng | Kế hoạch khuyến nghị không bắt buộc ở MVP |
| Đính kèm ảnh, chứng từ vào phiếu kho | Bucket `media` đang công khai; chứng từ cần bucket riêng tư. Để sau |
| Bắt buộc đăng nhập khi đặt hàng, sổ địa chỉ, bỏ trang tra cứu đơn | Thuộc giai đoạn cửa hàng (quyết định ở 00 và 03 vẫn giữ, chỉ lùi thời điểm) |
| Ghi nhận hành vi người dùng (`events`) | Thuộc phần chuẩn bị cho AI |

## 2. Quyết định đã chốt

Cột "So với kế hoạch" ghi chỗ khác với file Word.

| # | Chủ đề | Quyết định | So với kế hoạch |
| --- | --- | --- | --- |
| Q1 | CSDL | Supabase hiện chỉ có dữ liệu mẫu. Chủ dự án **cho phép migration xoá và tạo lại bảng** rồi nạp lại dữ liệu mẫu (15/10/2026) | |
| Q2 | Kho | Một kho (`warehouses` có đúng một dòng `KHO-01`), nhiều vị trí. Mọi bảng kho đều có `warehouse_id` | Giống |
| Q3 | Vị trí | Hai loại: `storage` (bán được) và `quarantine` (cách ly, không bán). Cách ly là **chuyển hàng sang vị trí cách ly**, không phải một bộ đếm riêng | Kế hoạch coi cách ly là một chỉ số; ở đây nó suy ra từ loại vị trí |
| Q4 | Tồn | Tồn theo từng (biến thể, vị trí) ở `stock_levels`. Bảng `inventory` là số tổng theo (biến thể, kho): `on_hand` = tổng các vị trí `storage`, `quarantined` = tổng các vị trí `quarantine`, `reserved` = đang giữ cho đơn. **Khả dụng = `on_hand − reserved`** | Cùng công thức: khả dụng = tồn bán được − giữ − cách ly |
| Q5 | Giữ hàng | Giữ ngay khi khách đặt (luật L1 ở [04](04-trang-thai.md)) | Kế hoạch khuyến nghị giữ khi xác nhận. Giữ khi đặt chặn được bán vượt ngay từ đầu, hợp với thanh toán xác nhận tay |
| Q6 | Đơn treo | Đơn chuyển khoản `pending`/`unpaid` quá 48 giờ hiện ở danh sách "quá hạn" trên trang tổng quan để nhân viên huỷ (L13). Không tự huỷ bằng tác vụ định kỳ | Kế hoạch đề xuất TTL tự giải phóng; dự án chưa có tác vụ nền |
| Q7 | Xuất kho | Ghi sổ xuất kho ở L6 (bàn giao vận chuyển). Vị trí lấy hàng do hệ thống chọn: các vị trí `storage` có hàng, theo mã vị trí tăng dần, được tách nhiều vị trí. Danh sách lấy hàng dùng đúng cách chọn này | Giống. Shortcut: không lưu nhiệm vụ lấy hàng riêng |
| Q8 | Phiếu kho | Sáu loại: nhập mua (`receipt`), xuất khác (`issue`), điều chỉnh (`adjustment`), chuyển vị trí (`transfer`), kiểm kê (`stocktake`), nhập hàng trả (`return`). Trạng thái `draft → submitted → posted`, hoặc `cancelled` | Giống, gộp các bước "nhận, đếm, kiểm tra" vào phiếu nháp |
| Q9 | Sửa sai | Phiếu đã ghi sổ không sửa, không xoá. Sửa bằng phiếu điều chỉnh hoặc phiếu ngược chiều | Giống |
| Q10 | Duyệt | Nhân viên kho tạo và gửi phiếu; quản lý kho hoặc quản trị viên ghi sổ. Với phiếu điều chỉnh và phiếu kiểm kê có chênh lệch, người ghi sổ phải khác người tạo. Quản trị viên được tự ghi sổ phiếu của mình, có ghi nhật ký | Kế hoạch để ngỏ "có thể yêu cầu người thứ hai". Ngoại lệ cho quản trị viên để demo được khi chỉ có một người |
| Q11 | Giá vốn | **Bình quân gia quyền di động.** Khi ghi sổ phiếu nhập: `giá mới = (tồn cũ × giá cũ + SL nhận × đơn giá nhập) / (tồn cũ + SL nhận)`, làm tròn tới đồng. Tồn cũ gồm cả hàng cách ly. Hàng trả, điều chỉnh tăng nhập theo giá vốn hiện tại. Giá trị tồn = (`on_hand` + `quarantined`) × `avg_cost` | Kế hoạch để kế toán chọn; chủ dự án chọn bình quân |
| Q12 | Vai trò | Mỗi tài khoản một vai trò. Mười vai trò ở mục 3 | Kế hoạch cho phép nhiều vai trò; [00](00-quyet-dinh-nen-tang.md) đã chốt một vai trò |
| Q13 | Trạng thái sản phẩm | `draft`, `published`, `archived` như [04](04-trang-thai.md). Không thêm `review`, `hidden` (`archived` chính là ẩn) | Bớt hai trạng thái |
| Q14 | Đơn hàng | Ba trạng thái độc lập và luật L1 đến L14 của [04](04-trang-thai.md). Ánh xạ: Placed/Confirmed = `pending`/`confirmed`; Picking = `processing`; Packed = vận chuyển `ready`; Shipped = `in_transit`; Delivered = `delivered` | Cùng ý, khác tên |
| Q15 | Hàng hoàn | Hàng giao thất bại hoàn về (L11) vào **vị trí cách ly**, không cộng thẳng vào hàng bán được. Sau khi kiểm tra: chuyển sang vị trí `storage` (phiếu chuyển) hoặc huỷ (phiếu điều chỉnh giảm) | Giống kế hoạch. **Đổi quyết định số 3 ở [04](04-trang-thai.md) mục 8** |
| Q16 | Chống ghi trùng | Ghi sổ phiếu đổi trạng thái có điều kiện (`WHERE status = 'submitted'`) trong cùng giao dịch với các dòng sổ kho. Lần gửi thứ hai không đổi được dòng nào nên không ghi gì. Thêm khoá duy nhất ở `stock_movements` để chặn ở mức CSDL. Đặt hàng có `idempotency_key` do trình duyệt sinh | Giống |
| Q17 | Ảnh | Tải qua Route Handler dưới `/admin` (cookie quản trị chỉ gửi tới đây), kiểm tra chữ ký file và kích thước ở máy chủ rồi đẩy lên Supabase Storage, bucket `media`, thư mục `products/` | |
| Q18 | Mô hình 3D | `.glb` tải thẳng từ trình duyệt lên Storage bằng URL tải lên có chữ ký (file lớn vượt giới hạn thân yêu cầu). Sau đó máy chủ đọc 12 byte đầu để kiểm tra chữ ký `glTF`, sai thì xoá. File phải được nén sẵn (meshopt) ở máy cá nhân | |
| Q19 | Nội dung CMS | Văn bản thuần, xuống dòng giữ nguyên. **Không lưu và không hiển thị HTML** lấy từ CSDL | Kế hoạch nói "editor an toàn"; văn bản thuần là cách an toàn nhất |
| Q20 | Xem trước | Bản nháp sản phẩm, trang và banner xem trước bên trong `/admin` bằng chính component của cửa hàng. Bản nháp không bao giờ có URL công khai | |
| Q21 | Lịch hiển thị | Banner và thanh thông báo lọc theo giờ của CSDL. Dữ liệu cache tối đa 5 phút, nên hết hạn có thể trễ tới 5 phút | |
| Q22 | Xuất file | CSV UTF-8 có BOM (mở thẳng bằng Excel). Không làm XLSX | Kế hoạch ghi CSV/XLSX |
| Q23 | Mã vạch | Ô nhập trên phiếu kho nhận SKU hoặc mã vạch; Enter thì thêm dòng hoặc cộng 1. Máy quét kiểu bàn phím dùng được ngay. Không quét bằng camera | |
| Q24 | Sao lưu | Supabase tự sao lưu theo gói. Thêm `npm run backup` xuất toàn bộ bảng ra JSON trong `data/backups/`, và một test khôi phục bản sao lưu vào PGlite rồi kiểm tra tính nhất quán | Kế hoạch yêu cầu diễn tập khôi phục |
| Q25 | Thời gian, tiền | Thời gian lưu mili giây UTC, hiển thị giờ Việt Nam. Tiền VND kiểu `BIGINT`, chưa có cột mã tiền tệ (để dành P3) | Kế hoạch khuyến nghị lưu mã tiền tệ khi mở rộng quốc tế |
| Q26 | Thư viện | Không thêm thư viện mới nếu nền tảng hoặc thư viện đã cài làm được. Biểu đồ, nếu có, dùng SVG hoặc CSS tự vẽ | |

## 3. Vai trò và quyền

Quyền kiểm tra ở máy chủ (Server Action, Route Handler, trang) bằng một bảng duy nhất trong mã nguồn (`src/lib/permissions.ts`). Giao diện chỉ ẩn những gì không có quyền, không thay cho kiểm tra ở máy chủ.

Đăng nhập quản trị nhận mọi vai trò khác `customer`, với tài khoản đang hoạt động. Đăng nhập cửa hàng chỉ nhận `customer`, như hiện tại.

| Mã vai trò | Tên | Ghi chú |
| --- | --- | --- |
| `admin` | Quản trị viên | Toàn quyền |
| `product_manager` | Quản lý sản phẩm | Sản phẩm, biến thể, danh mục, giá, media |
| `warehouse_manager` | Quản lý kho | Mới so với [00](00-quyet-dinh-nen-tang.md). Ghi sổ phiếu kho, xem giá vốn |
| `warehouse` | Nhân viên kho | Lập phiếu, đóng gói, bàn giao |
| `order_staff` | Nhân viên đơn hàng | Xử lý đơn |
| `support` | Chăm sóc khách hàng | Khách hàng, đánh giá |
| `marketing` | Marketing và nội dung | Banner, menu, trang, mã giảm giá |
| `accountant` | Kế toán | Thu tiền, hoàn tiền, giá vốn, báo cáo |
| `viewer` | Chỉ xem | Mới. Giảng viên, người kiểm thử. Thông tin cá nhân của khách bị che |
| `customer` | Khách hàng | Không vào được khu quản trị |

Ma trận (● có quyền):

| Quyền | Ý nghĩa | admin | product_manager | warehouse_manager | warehouse | order_staff | support | marketing | accountant | viewer |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard.view` | Trang tổng quan | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `catalog.view` | Xem sản phẩm, danh mục, thương hiệu, series | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `catalog.edit` | Tạo, sửa, xuất bản, lưu trữ sản phẩm, biến thể, danh mục; tải media; đổi giá bán | ● | ● | | | | | | | |
| `cost.view` | Xem giá vốn, giá trị tồn | ● | | ● | | | | | ● | |
| `inventory.view` | Xem tồn, thẻ kho, phiếu kho | ● | ● | ● | ● | ● | | | ● | ● |
| `inventory.draft` | Tạo, sửa, gửi, huỷ phiếu nháp của mình | ● | | ● | ● | | | | | |
| `inventory.post` | Ghi sổ, huỷ mọi phiếu chưa ghi sổ | ● | | ● | | | | | | |
| `inventory.setup` | Vị trí kho, nhà cung cấp, ngưỡng sắp hết | ● | | ● | | | | | | |
| `orders.view` | Xem đơn hàng | ● | | ● | ● | ● | ● | | ● | ● |
| `orders.process` | L3, L7, L9, L10, L13 | ● | | | | ● | | | | |
| `orders.fulfil` | L4, L5, L6, L11 | ● | | ● | ● | ● | | | | |
| `payments.manage` | L2, L14 | ● | | | | | | | ● | |
| `customers.view` | Danh sách, hồ sơ khách (đủ thông tin liên hệ) | ● | | | | ● | ● | | ● | |
| `customers.manage` | Khoá, mở khoá tài khoản khách | ● | | | | | ● | | | |
| `reviews.moderate` | Duyệt, ẩn đánh giá | ● | | | | | ● | | | |
| `content.edit` | Banner, menu, trang, thanh thông báo, thông tin liên hệ | ● | | | | | | ● | | |
| `coupons.manage` | Mã giảm giá | ● | | | | | | ● | | |
| `reports.view` | Báo cáo và xuất CSV | ● | ● | ● | | | | ● | ● | ● |
| `staff.manage` | Tài khoản nhân viên, vai trò | ● | | | | | | | | |
| `audit.view` | Nhật ký thao tác | ● | | | | | | | ● | ● |

Ghi chú:
- `viewer` vào được danh sách khách và chi tiết đơn nhưng email, số điện thoại và địa chỉ bị che (ví dụ `n***@gmail.com`, `09******12`). Che ở máy chủ, không gửi dữ liệu thật xuống trình duyệt.
- Cột giá vốn và giá trị tồn không được gửi xuống trình duyệt khi người xem không có `cost.view`.
- Không ai tự đổi vai trò hoặc tự khoá chính mình. Phải luôn còn ít nhất một `admin` đang hoạt động.
- Đổi vai trò hoặc khoá tài khoản thì mọi phiên của tài khoản đó bị xoá.

## 4. Yêu cầu chức năng

Cột **Mức** theo kế hoạch: P0 bắt buộc, P1 nên có. Mã yêu cầu dùng trong test và commit.

### 4.1. Nền quản trị (QTN)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-QTN-01 | Đăng nhập quản trị nhận mọi vai trò nhân viên đang hoạt động; tài khoản bị khoá không đăng nhập được, phiên đang mở mất hiệu lực ngay | P0 |
| YC-QTN-02 | Mỗi trang, Server Action và Route Handler trong `/admin` kiểm tra đúng quyền ở mục 3; thiếu quyền thì trang trả 404 hoặc thông báo không có quyền, action trả lỗi và không ghi gì | P0 |
| YC-QTN-03 | Thanh bên chỉ hiện mục mà vai trò có quyền xem; nhóm theo menu ở mục 5 | P0 |
| YC-QTN-04 | Nhật ký thao tác (`audit_logs`) ghi trong cùng giao dịch với thay đổi: đăng nhập quản trị (cả thất bại), đổi giá, xuất bản hoặc lưu trữ nội dung, ghi sổ hoặc huỷ phiếu kho, chuyển trạng thái đơn, thu tiền, hoàn tiền, đổi vai trò, khoá tài khoản, sửa mã giảm giá. Lưu người làm, vai trò, hành động, đối tượng, tóm tắt trước và sau | P0 |
| YC-QTN-05 | Trang nhật ký: lọc theo người, hành động, đối tượng, khoảng ngày; phân trang | P0 |
| YC-QTN-06 | Quản lý nhân viên: tạo tài khoản (email, tên, vai trò, mật khẩu tạm), đổi vai trò, khoá và mở khoá, theo các ràng buộc ở mục 3 | P0 |
| YC-QTN-07 | Trang tổng quan theo vai trò. Mỗi thẻ số liệu dẫn tới danh sách đã lọc sẵn. Kho: khả dụng, đơn chờ lấy hàng, phiếu chờ ghi sổ, SKU dưới ngưỡng. Cửa hàng: đơn hôm nay, doanh số theo trạng thái, tỷ lệ huỷ, bán chạy, hàng tồn thấp đang nổi bật, banner sắp hết lịch, đơn chuyển khoản quá hạn (Q6), đơn đã huỷ chờ hoàn tiền | P0 |
| YC-QTN-08 | Mọi danh sách phân trang và lọc ở máy chủ; dùng được với 1.000 SKU trở lên | P0 |

### 4.2. Kho (KHO)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-KHO-01 | Quản lý vị trí: mã duy nhất trong kho (ví dụ `A-01-02-03`), tên, loại `storage` hoặc `quarantine`, ngừng dùng. Vị trí còn hàng không ngừng dùng được | P0 |
| YC-KHO-02 | Quản lý nhà cung cấp: mã, tên, người liên hệ, điện thoại, email, địa chỉ, ghi chú, ngừng giao dịch | P0 |
| YC-KHO-03 | Phiếu nhập mua: chọn nhà cung cấp, số chứng từ, ngày dự kiến; dòng gồm SKU, vị trí nhận, SL dự kiến, đơn giá nhập. Khi nhận: SL thực nhận, SL nhận tốt, SL cách ly (tốt + cách ly = thực nhận). Ghi sổ: SL tốt vào vị trí nhận, SL cách ly vào vị trí cách ly, cập nhật giá vốn (Q11). Phiếu hiện rõ thiếu hoặc thừa so với dự kiến | P0 |
| YC-KHO-04 | Phiếu xuất khác (không theo đơn): lý do bắt buộc (hàng mẫu, hư hỏng, nội bộ, trả nhà cung cấp, thất lạc); không xuất vượt tồn của vị trí, cũng không vượt khả dụng của biến thể | P0 |
| YC-KHO-05 | Phiếu chuyển vị trí: từ vị trí A sang vị trí B trong cùng kho. Chuyển giữa `storage` và `quarantine` làm đổi `on_hand` và `quarantined` | P0 |
| YC-KHO-06 | Phiếu điều chỉnh: tăng hoặc giảm theo từng (SKU, vị trí), lý do bắt buộc, ghi chú bắt buộc khi giảm; kiểm soát kép theo Q10 | P0 |
| YC-KHO-07 | Kiểm kê: chọn vị trí (một, nhiều hoặc toàn kho), hệ thống chụp số sổ sách lúc tạo phiếu; nhân viên nhập số đếm, không thấy và không sửa được số sổ sách khi đang đếm. Ghi sổ tạo điều chỉnh cho phần chênh. Nếu vị trí có biến động sau lúc chụp thì từ chối ghi sổ và yêu cầu đếm lại | P0 |
| YC-KHO-08 | Phiếu nhập hàng trả: gắn với mã đơn (nếu có), hàng luôn vào vị trí cách ly | P1 |
| YC-KHO-09 | Trang hàng cách ly: liệt kê theo SKU, vị trí; thao tác "bán lại được" (tạo phiếu chuyển sang `storage`) và "huỷ hàng" (tạo phiếu điều chỉnh giảm) | P1 |
| YC-KHO-10 | Danh sách tồn: tìm theo SKU, mã vạch, tên; lọc vị trí, thương hiệu, series, danh mục, trạng thái (còn, sắp hết, hết, có cách ly); các cột thực có, đang giữ, khả dụng, cách ly; giá vốn và giá trị nếu có `cost.view` | P0 |
| YC-KHO-11 | Thẻ kho của một biến thể: mọi dòng sổ kho theo thời gian với loại, vị trí, số lượng, số dư sau, người làm, chứng từ hoặc đơn liên quan (bấm được) | P0 |
| YC-KHO-12 | Phiếu chờ xử lý: phiếu nháp, chờ ghi sổ, nhận thiếu; đơn chờ lấy, chờ đóng gói, chờ bàn giao | P0 |
| YC-KHO-13 | Ngưỡng sắp hết theo từng biến thể (mặc định 3); danh sách SKU dưới ngưỡng; sản phẩm hết hàng nhưng đang hiện ở cửa hàng | P1 |
| YC-KHO-14 | Tuổi tồn: số ngày từ lần nhập gần nhất; lọc hàng lâu không bán (mặc định trên 90 ngày) | P1 |
| YC-KHO-15 | Giá trị tồn theo biến thể, danh mục, tổng (Q11); chỉ vai trò có `cost.view` | P1 |
| YC-KHO-16 | Danh sách lấy hàng: các đơn `processing` chưa đóng gói, mỗi dòng có SKU, số lượng và vị trí gợi ý (Q7); in được | P0 |
| YC-KHO-17 | Ô nhập mã vạch hoặc SKU trên phiếu kho (Q23) | P1 |
| YC-KHO-18 | Đối soát: kiểm tra và liệt kê sai lệch giữa sổ kho và số dư (theo vị trí, theo biến thể), số âm, hàng đang giữ không thuộc đơn nào còn mở, đơn đang mở mà chưa giữ hàng | P0 |
| YC-KHO-19 | Xuất CSV danh sách tồn và thẻ kho | P1 |

### 4.3. Danh mục hàng (SP)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-SP-01 | Danh mục tối đa 2 cấp (tên, slug, mô tả, cha, thứ tự); thương hiệu; series. Không xoá được khi còn sản phẩm | P0 |
| YC-SP-02 | Sản phẩm: tên, slug duy nhất, mô tả ngắn, mô tả, danh mục chính, thương hiệu, series, loại (`figure`, `model_kit`, `combiner`, `accessory`), tỷ lệ, cấp độ, thông số, nội dung hộp, khoá mô hình dựng sẵn, nổi bật | P0 |
| YC-SP-03 | Biến thể: SKU duy nhất (không đổi được sau khi đã có sổ kho hoặc đơn), mã vạch (duy nhất nếu có), tên, tình trạng `new`/`used` kèm ghi chú, giá bán, giá so sánh, màu mô hình 3D, khối lượng và kích thước (tuỳ chọn), bật/tắt, đúng một biến thể mặc định | P0 |
| YC-SP-04 | Màn hình sản phẩm chia tab: Thông tin, Biến thể, Media, SEO, Xem trước. Nút Lưu nháp, Xuất bản, Lưu trữ. Cảnh báo khi thiếu trường bắt buộc | P0 |
| YC-SP-05 | Chỉ xuất bản được khi có ít nhất một biến thể đang bật và có ảnh đại diện. Nhập kho không tự xuất bản sản phẩm | P0 |
| YC-SP-06 | Media: nhiều ảnh mỗi sản phẩm (tuỳ chọn gắn với biến thể), thứ tự, chữ thay thế (alt); tải ảnh WebP, PNG, JPEG tối đa 5 MB (Q17); giữ chức năng chụp ảnh đại diện từ mô hình 3D | P0 |
| YC-SP-07 | Lịch sử giá: mỗi lần đổi giá bán hoặc giá so sánh ghi nhật ký với giá trước và sau; xem được ở tab Biến thể | P0 |
| YC-SP-08 | Xem trước bản nháp trong `/admin` (Q20) | P0 |
| YC-SP-09 | SEO: tiêu đề và mô tả meta cho sản phẩm, danh mục, trang; đổi slug sản phẩm thì slug cũ chuyển hướng 308 sang slug mới | P1 |
| YC-SP-10 | Tải mô hình `.glb` tối đa 25 MB (Q18) | P1 |
| YC-SP-11 | Sản phẩm, biến thể đã có trong đơn hoặc sổ kho thì không xoá, chỉ lưu trữ hoặc tắt | P0 |

### 4.4. Nội dung cửa hàng (CMS)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-CMS-01 | Banner: tiêu đề, phụ đề, ảnh máy tính, ảnh điện thoại (tuỳ chọn), liên kết đích, vị trí (`home_hero`, `home_strip`), thứ tự, thời gian bắt đầu và kết thúc, nháp hoặc xuất bản. Kết thúc phải sau bắt đầu; liên kết nội bộ bắt đầu bằng `/`, liên kết ngoài phải là `https://` | P0 |
| YC-CMS-02 | Trang chủ hiện banner đang hiệu lực theo vị trí, sản phẩm nổi bật, hàng mới, danh mục. Không có banner thì trang vẫn đẹp như hiện tại | P0 |
| YC-CMS-03 | Menu đầu trang và chân trang: nhãn, liên kết, thứ tự, bật/tắt. Liên kết nội bộ phải trỏ tới trang có thật (danh mục, trang thông tin đã xuất bản, đường dẫn cố định của cửa hàng) | P0 |
| YC-CMS-04 | Trang thông tin (giới thiệu, liên hệ, câu hỏi thường gặp, vận chuyển, đổi trả, bảo mật, điều khoản): slug, tiêu đề, nội dung văn bản thuần, mô tả meta, nháp hoặc xuất bản. Mỗi lần xuất bản lưu một phiên bản (người, thời điểm); khôi phục được phiên bản cũ. Cửa hàng hiện ở `/trang/[slug]` | P0 |
| YC-CMS-05 | Thanh thông báo trên đầu trang: nội dung, liên kết, thời gian hiệu lực, bật/tắt | P1 |
| YC-CMS-06 | Thông tin liên hệ và chính sách hiển thị ở chân trang lấy từ CSDL (`site_settings`) thay cho nội dung mẫu trong `src/config/site.ts`. Phí vận chuyển và giới hạn số lượng vẫn ở `site.ts` | P0 |
| YC-CMS-07 | Xem trước banner, trang trước khi xuất bản (Q20) | P0 |

### 4.5. Bán hàng (BH)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-BH-01 | Danh sách đơn: lọc theo ba trạng thái, phương thức thanh toán, khoảng ngày; tìm theo mã đơn, tên, số điện thoại | P0 |
| YC-BH-02 | Chi tiết đơn: dòng hàng (SKU, biến thể), tiền, giảm giá, ba trạng thái, mã vận đơn, lịch sử (`order_events`), thanh toán (`payments`), chứng từ kho liên quan; nút thao tác L2 đến L14 chỉ hiện khi đúng điều kiện và đúng quyền | P0 |
| YC-BH-03 | L6 bắt buộc nhập hãng vận chuyển và mã vận đơn | P0 |
| YC-BH-04 | Danh sách đơn đã huỷ nhưng đã thu tiền, chờ hoàn (YC-QT-07) | P0 |
| YC-BH-05 | Mã giảm giá: mã (chữ in hoa, duy nhất), loại cố định hoặc phần trăm, giá trị, giảm tối đa (với phần trăm), đơn tối thiểu, phạm vi (toàn bộ hoặc một danh mục), thời gian hiệu lực, số lượt dùng tối đa, bật/tắt; xem số lượt đã dùng | P1 |
| YC-BH-06 | Áp mã ở trang thanh toán: máy chủ kiểm tra và tính lại; mỗi đơn một mã; đơn lưu mã và số tiền giảm. Huỷ đơn thì trả lại lượt dùng | P1 |

### 4.6. Khách hàng (KH)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-KH-01 | Danh sách khách: tìm theo tên, email, điện thoại; số đơn, tổng chi; phân trang | P0 |
| YC-KH-02 | Hồ sơ khách: thông tin, trạng thái, đồng ý nhận tin (có hay không, thời điểm), danh sách đơn, địa chỉ đã dùng (lấy từ đơn), đánh giá, sản phẩm yêu thích | P0 |
| YC-KH-03 | Khoá, mở khoá tài khoản khách (YC-TKH-04); khoá thì xoá mọi phiên | P0 |
| YC-KH-04 | Form đăng ký có ô "Nhận tin khuyến mãi", mặc định không chọn; lưu thời điểm đồng ý. Trang tài khoản cho bật, tắt | P1 |
| YC-KH-05 | Đánh giá theo YC-DG-01, YC-DG-02 và luật ở [04](04-trang-thai.md) mục 7; trang quản trị duyệt, ẩn, lọc theo trạng thái và số sao | P1 |
| YC-KH-06 | Yêu thích theo YC-DG-03; quản trị xem sản phẩm được yêu thích nhiều nhất | P1 |

### 4.7. Báo cáo (BC)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-BC-01 | Báo cáo bán hàng theo khoảng ngày: số đơn, doanh thu (chỉ đơn `completed`), doanh số theo trạng thái, tỷ lệ huỷ, sản phẩm bán chạy theo số lượng. Ghi rõ khoảng ngày, múi giờ và trạng thái được tính | P1 |
| YC-BC-02 | Báo cáo kho: tồn hiện tại, sắp hết, tuổi tồn, giá trị tồn (YC-KHO-10, 13, 14, 15) | P0/P1 |
| YC-BC-03 | Xuất CSV cho báo cáo bán hàng, tồn kho, thẻ kho (Q22); kiểm tra quyền như trang tương ứng | P1 |

### 4.8. Vận hành (VH)

| Mã | Yêu cầu | Mức |
| --- | --- | --- |
| YC-VH-01 | `npm run backup` xuất mọi bảng ra JSON trong `data/backups/<thời điểm>/`; test khôi phục vào PGlite rồi kiểm tra đối soát (YC-KHO-18) không có sai lệch | P0 |
| YC-VH-02 | `npm run smoke` tự bật máy chủ phát triển ở cổng riêng, mở mọi trang quản trị (bằng phiên quản trị tạo thẳng trong CSDL) và các trang chính của cửa hàng, báo lỗi nếu trang nào không trả 200 hoặc hiện lỗi | P0 |
| YC-VH-03 | Lỗi máy chủ ghi log kèm mã yêu cầu; trang lỗi trong `/admin` không lộ chi tiết kỹ thuật | P1 |

## 5. Menu và màn hình

Đường dẫn tiếng Việt không dấu như phần còn lại của trang. Cột Quyền là quyền tối thiểu để mở trang.

| Menu | Màn hình | Đường dẫn | Quyền |
| --- | --- | --- | --- |
| Tổng quan | Tổng quan | `/admin` | `dashboard.view` |
| Kho | Tồn kho | `/admin/kho` | `inventory.view` |
| | Thẻ kho | `/admin/kho/the-kho/[variantId]` | `inventory.view` |
| | Phiếu kho | `/admin/kho/phieu`, `/admin/kho/phieu/moi?loai=...`, `/admin/kho/phieu/[id]` | `inventory.view` |
| | Lấy hàng | `/admin/kho/lay-hang` | `orders.fulfil` |
| | Hàng cách ly | `/admin/kho/cach-ly` | `inventory.view` |
| | Vị trí kho | `/admin/kho/vi-tri` | `inventory.setup` |
| | Đối soát | `/admin/kho/doi-soat` | `inventory.view` |
| Danh mục hàng | Sản phẩm | `/admin/san-pham`, `/admin/san-pham/moi`, `/admin/san-pham/[id]` | `catalog.view` |
| | Danh mục, thương hiệu, series | `/admin/danh-muc`, `/admin/thuong-hieu`, `/admin/series` | `catalog.view` |
| | Nhà cung cấp | `/admin/nha-cung-cap` | `inventory.setup` |
| Cửa hàng trực tuyến | Banner | `/admin/noi-dung/banner` | `content.edit` |
| | Menu | `/admin/noi-dung/menu` | `content.edit` |
| | Trang thông tin | `/admin/noi-dung/trang` | `content.edit` |
| | Cài đặt hiển thị | `/admin/noi-dung/cai-dat` | `content.edit` |
| Bán hàng | Đơn hàng | `/admin/don-hang`, `/admin/don-hang/[id]` | `orders.view` |
| | Chờ hoàn tiền | `/admin/don-hang/cho-hoan-tien` | `payments.manage` |
| | Mã giảm giá | `/admin/ma-giam-gia` | `coupons.manage` |
| Khách hàng | Khách hàng | `/admin/khach-hang`, `/admin/khach-hang/[id]` | `customers.view` hoặc vai trò `viewer` |
| | Đánh giá | `/admin/danh-gia` | `reviews.moderate` |
| Báo cáo | Báo cáo | `/admin/bao-cao` | `reports.view` |
| | Xuất CSV | `/admin/xuat/[loai]` (Route Handler) | như trang tương ứng |
| Cài đặt | Nhân viên | `/admin/nhan-vien` | `staff.manage` |
| | Nhật ký | `/admin/nhat-ky` | `audit.view` |

Cửa hàng có thêm: banner và thanh thông báo ở trang chủ, menu lấy từ CSDL, trang `/trang/[slug]`, ô mã giảm giá ở trang thanh toán, đánh giá ở trang sản phẩm, nút yêu thích và trang yêu thích trong tài khoản, chọn biến thể ở trang sản phẩm.

## 6. Quy tắc nghiệp vụ bổ sung

Nối tiếp QT-01 đến QT-10 ở [01](01-dac-ta-yeu-cau.md).

| Mã | Quy tắc |
| --- | --- |
| QT-11 | Không gõ đè số tồn. Mọi thay đổi tồn đi qua phiếu kho hoặc luật đơn hàng, kèm dòng `stock_movements` trong cùng giao dịch |
| QT-12 | Phiếu `posted` không sửa, không xoá, không huỷ. Chỉ huỷ được phiếu `draft` hoặc `submitted` |
| QT-13 | Ghi sổ phiếu là nguyên tử và chống lặp (Q16): gửi lại hai lần chỉ có một bộ dòng sổ kho |
| QT-14 | `stock_levels.on_hand ≥ 0` ở mọi vị trí; `0 ≤ reserved ≤ on_hand` ở `inventory`. Ràng buộc nằm trong CSDL, vi phạm thì cả giao dịch bị huỷ |
| QT-15 | Xuất, chuyển, điều chỉnh giảm từ vị trí `storage` không được làm khả dụng của biến thể xuống dưới 0 (không lấy hàng đã giữ cho đơn) |
| QT-16 | Tại một thời điểm, mỗi vị trí chỉ thuộc một phiếu kiểm kê chưa ghi sổ |
| QT-17 | Số tồn, số lượng là số nguyên dương trên phiếu; tối đa 9.999 mỗi dòng |
| QT-18 | Mã phiếu dạng `<tiền tố>-<YYMMDD>-<4 ký tự>`: PN nhập, PX xuất, DC điều chỉnh, CV chuyển vị trí, KK kiểm kê, HT hàng trả |
| QT-19 | Nhật ký thao tác chỉ thêm; không có giao diện sửa hoặc xoá |
| QT-20 | Nội dung CMS là văn bản thuần (Q19); liên kết kiểm tra theo YC-CMS-01 |
| QT-21 | Mã giảm giá: một mã mỗi đơn; số tiền giảm không vượt tạm tính của phần hàng hợp lệ; không áp cho phí vận chuyển; tăng lượt dùng có điều kiện `used_count < usage_limit` trong giao dịch đặt hàng |
| QT-22 | Tải file: kiểm tra chữ ký thật của file, không tin phần mở rộng hay kiểu MIME do trình duyệt gửi; tên file trên Storage do máy chủ đặt |

## 7. Kịch bản nghiệm thu

Mỗi kịch bản có ít nhất một test Vitest (trên PGlite), tên test bắt đầu bằng mã kịch bản để tra cứu. Nhóm WH, EC, SEC, OPS lấy từ mục 15.3 của kế hoạch; các mã còn lại là bổ sung.

| Mã | Kịch bản | Kết quả mong muốn |
| --- | --- | --- |
| WH-01 | Phiếu nhập dự kiến 10, thực nhận 8 | Sổ kho +8; phiếu hiện thiếu 2; tồn hiện 8 |
| WH-02 | Ghi sổ cùng một phiếu hai lần (kể cả gọi song song) | Chỉ một bộ dòng sổ kho |
| WH-03 | Xuất 11 khi khả dụng là 8 (phiếu xuất và đặt hàng) | Bị chặn; không âm tồn |
| WH-04 | Kiểm kê: sổ sách 8, đếm được 7 | Sau khi ghi sổ có điều chỉnh −1; truy được người và lý do |
| WH-05 | Nhận hàng hoàn (L11) hoặc phiếu hàng trả chưa kiểm tra | `quarantined` tăng; khả dụng không đổi |
| WH-06 | Kiểm kê khi vị trí có biến động sau lúc chụp số | Từ chối ghi sổ |
| WH-07 | Chuyển 3 từ `storage` sang `quarantine` | `on_hand` −3, `quarantined` +3; tổng thực có không đổi |
| WH-08 | Giá vốn: tồn 2 giá 100.000, nhập 2 giá 200.000 | Giá vốn 150.000; giá trị tồn 600.000 |
| WH-09 | Nhân viên kho tự ghi sổ phiếu điều chỉnh do mình tạo | Bị từ chối |
| WH-10 | Đối soát sau một loạt thao tác ngẫu nhiên (nhập, đặt, huỷ, xuất, chuyển, kiểm kê) | Không có sai lệch giữa sổ kho và số dư |
| EC-01 | Biến thể có tồn nhưng sản phẩm `draft` | Không hiện ở cửa hàng, không thêm được vào giỏ |
| EC-02 | Hai khách cùng đặt món cuối cùng | Một đơn thành công, đơn kia báo hết hàng |
| EC-03 | Đổi giá sau khi đơn được tạo | Đơn cũ giữ giá lúc đặt |
| EC-04 | Banner hết thời gian hiệu lực | Không còn hiện (trễ tối đa theo Q21) |
| EC-05 | Bấm đặt hàng hai lần với cùng `idempotency_key` | Một đơn, một bộ dòng giữ hàng |
| EC-06 | Mã giảm giá hết lượt, hết hạn, chưa đủ đơn tối thiểu, sai danh mục | Bị từ chối, nêu lý do; mã hợp lệ thì tổng tiền đúng |
| EC-07 | Huỷ đơn có mã giảm giá | Lượt dùng được trả lại; hàng được giải phóng |
| EC-08 | Bản nháp trang, banner | Không có ở cửa hàng; xem trước được trong `/admin` |
| SEC-01 | Nhân viên nội dung gọi thẳng action điều chỉnh kho | Bị từ chối, không ghi sổ |
| SEC-02 | Vai trò `viewer` mở hồ sơ khách | Email, điện thoại, địa chỉ bị che ngay từ máy chủ |
| SEC-03 | Người không có `cost.view` xem danh sách tồn | Dữ liệu trả về không có giá vốn |
| SEC-04 | Tài khoản bị khoá còn phiên đang mở | Yêu cầu tiếp theo bị đưa về trang đăng nhập |
| SEC-05 | Tải lên file có đuôi `.png` nhưng nội dung không phải ảnh, hoặc lớn hơn giới hạn | Bị từ chối |
| SEC-06 | Admin tự hạ quyền mình, hoặc khoá admin cuối cùng | Bị từ chối |
| AUD-01 | Đổi giá, ghi sổ phiếu, xuất bản banner, chuyển trạng thái đơn | Mỗi thao tác có đúng một dòng nhật ký với người làm và giá trị trước, sau |
| OPS-01 | Sao lưu rồi khôi phục vào CSDL trống | Dữ liệu khớp; đối soát không có sai lệch |
| PERF-01 | 1.000 biến thể | Danh sách tồn, sản phẩm phân trang ở máy chủ; truy vấn trang đầu dưới 300 ms trên PGlite |

## 8. Việc cần người thật làm

Những việc mà Claude Code không thay được, cần làm trước khi mở bán thật:

- Nội dung thật cho các trang thông tin, chính sách đổi trả (số ngày, điều kiện), thông tin liên hệ.
- Rà soát pháp lý theo phụ lục B của kế hoạch (Luật Thương mại điện tử 122/2025/QH15, Nghị định 248/2026/NĐ-CP, bảo vệ dữ liệu cá nhân, thuế, sở hữu trí tuệ).
- Kiểm tra gói Supabase có sao lưu tự động hay không.
- Chọn dịch vụ email (mở khoá thông báo đơn hàng, đặt lại mật khẩu).
- Nghiệm thu với người dùng thật (UAT) theo mục 7, viết hướng dẫn vận hành (SOP) cho nhập, xuất, kiểm kê, xử lý đơn.

## 9. Đối chiếu với kế hoạch

| Chương của kế hoạch | Ở tài liệu này |
| --- | --- |
| 1. Nguyên tắc thiết kế | Q2 đến Q9, QT-11 đến QT-14 |
| 2. Phạm vi | Mục 1 |
| 3. Vai trò, kiểm soát | Mục 3, YC-QTN-01 đến 06 |
| 4. Kho | YC-KHO-01 đến 19, Q11 |
| 5. Quy trình kho, ngoại lệ | [04](04-trang-thai.md), WH-01 đến 10, EC-02, EC-05 |
| 6. Quản trị website | YC-SP, YC-CMS, YC-BH-05, 06 |
| 7. Khách hàng | YC-KH; phiếu hỗ trợ không làm (mục 1) |
| 8. Đơn hàng | Q5 đến Q7, Q14, YC-BH-01 đến 04 |
| 9. Dữ liệu | [03](03-co-so-du-lieu.md) |
| 10. Menu, màn hình | Mục 5 |
| 11. Phi chức năng | YC-QTN-08, YC-VH, SEC, PERF-01; [01](01-dac-ta-yeu-cau.md) mục 5 |
| 12. KPI | YC-QTN-07, YC-BC-01; KPI cần dữ liệu truy cập (tỷ lệ chuyển đổi, hiệu quả tìm kiếm) để sau khi có `events` |
| 13. Phân kỳ | Mục 1 |
| 14. Lộ trình 80 ngày | Thay bằng [../ke-hoach/backlog-quan-tri-kho.md](../ke-hoach/backlog-quan-tri-kho.md) |
| 15. Nghiệm thu | Mục 7 |
| 16. Quyết định cần chốt | 16.2 câu 1 → Q2; 2 → YC-SP-03 (`new`/`used`); 3 → không theo dõi serial; 4 → Q5; 5 → thanh toán thủ công; 6 → Q11; 7 → Q18; 8 → một nhà bán |
| Phụ lục A | [03](03-co-so-du-lieu.md) |
