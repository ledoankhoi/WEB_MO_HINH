# 00. Quyết định nền tảng

Ghi lại các quyết định của chủ dự án (12/10/2026). Mọi tài liệu chuẩn khác xây trên file này.

## 1. Bối cảnh

| Mục | Quyết định |
| --- | --- |
| Mục đích | Báo cáo luận văn, đồng thời phát triển thành thương hiệu cá nhân bán hàng thật |
| **Mục tiêu chính (MVP)** | Trang thương mại điện tử mô hình robot đồ chơi **có tích hợp AI** |
| Đóng góp chính của luận văn | Tích hợp AI. Phần nghiệp vụ là nền, không phải trọng tâm |
| Cách làm AI | Tự xây dựng mô hình học máy/AI cho trang web, không dùng mô hình có sẵn của bên thứ ba |
| Tình trạng phần AI | Chưa chốt tính năng. Hoàn thành trang thương mại điện tử trước, bàn AI sau |
| Thời hạn | 1 đến 3 tháng |
| Ràng buộc của trường | Chỉ yêu cầu chung: phân tích, thiết kế, cài đặt, kiểm thử |
| Tài liệu phải có | Đặc tả yêu cầu; use case và sơ đồ UML; thiết kế CSDL (ERD); kiến trúc, API và kiểm thử |
| Dữ liệu sản phẩm | Kết hợp: tên sản phẩm thật để minh hoạ, mô hình 3D tạm dùng bản tự dựng |
| Quy mô danh mục | Trên 500 sản phẩm |
| Vận hành | Nhiều bộ phận |

## 2. Quyết định nghiệp vụ

| Chủ đề | Quyết định | Khác với mã nguồn hiện tại |
| --- | --- | --- |
| Loại hàng | Hàng mới có sẵn, hàng đặt trước, hàng đã qua sử dụng, phụ kiện và linh kiện | Hiện chỉ có hàng có sẵn |
| Biến thể | Đầy đủ: `Product` và `ProductVariant`; mỗi biến thể có SKU, giá, tồn kho riêng | Hiện mỗi sản phẩm một giá, một tồn kho |
| Phân loại | Danh mục cha con; thương hiệu; series; thuộc tính kỹ thuật (tỷ lệ, cấp độ, loại, tình trạng hộp) | Hiện là 7 danh mục cố định trong code |
| Tài khoản | Bắt buộc đăng nhập mới được đặt hàng | Hiện cho khách vãng lai đặt và tra cứu bằng mã đơn |
| Tồn kho | Giữ hàng khi đặt, xuất kho khi giao; có lịch sử biến động | Hiện trừ thẳng khi đặt, không có lịch sử |
| Thanh toán | COD; chuyển khoản VietQR; cổng thanh toán; đặt cọc cho hàng đặt trước | Hiện có COD và VietQR |
| Vận chuyển | Thủ công: nhân viên tạo đơn bên hãng rồi nhập mã vận đơn và cập nhật trạng thái | Hiện chỉ có phí cố định, không có mã vận đơn |
| Phân quyền | Vai trò cố định, mỗi nhân viên một vai trò | Hiện chỉ có `customer` và `admin` |
| Nghiệp vụ mở rộng | Mã giảm giá; đổi trả và hoàn tiền; đánh giá và hỏi đáp; yêu thích và so sánh; nhà cung cấp và nhập hàng; báo cáo; email; quản lý nội dung | Chưa có |
| 3D | Xoay, phóng, toàn màn hình; chú thích bộ phận; quản trị tải file `.glb`; biến hình và AR | Hiện có xoay và phóng |

## 3. Vai trò

| Vai trò | Quyền chính |
| --- | --- |
| Quản trị viên | Toàn quyền, quản lý nhân viên |
| Quản lý sản phẩm | Sản phẩm, biến thể, danh mục, media, file 3D |
| Nhân viên kho | Nhập kho, xuất kho, kiểm kê, điều chỉnh tồn |
| Nhân viên đơn hàng | Xác nhận đơn, đóng gói, vận đơn, giao hàng |
| Chăm sóc khách hàng | Khách hàng, đổi trả, đánh giá và hỏi đáp |
| Marketing | Mã giảm giá, banner, nội dung |
| Kế toán | Thanh toán, hoàn tiền, đối soát, báo cáo tài chính |
| Khách hàng | Mua hàng, quản lý tài khoản và đơn của mình |

## 4. Thứ tự ưu tiên (đã chốt 13/10/2026)

Vì trọng tâm luận văn là AI tự xây dựng, phần thương mại điện tử chỉ cần đủ để bán được hàng và **sinh ra dữ liệu cho mô hình học**. Các nghiệp vụ mở rộng lùi lại sau phần AI.

### Bước 1: Trang thương mại điện tử cốt lõi

| Nhóm | Chức năng | Vì sao cần cho AI |
| --- | --- | --- |
| Danh mục | Biến thể và SKU; thương hiệu; series; danh mục cha con; thuộc tính kỹ thuật; tình trạng hàng | Thuộc tính sản phẩm là đặc trưng đầu vào của mô hình |
| Khám phá | Tìm kiếm; lọc; sắp xếp | Từ khoá tìm kiếm là dữ liệu học |
| Tài khoản | Đăng ký, đăng nhập; bắt buộc đăng nhập khi đặt hàng | Gắn hành vi với từng người dùng |
| Mua hàng | Giỏ hàng; checkout; COD và VietQR | Lịch sử mua là tín hiệu mạnh nhất |
| Kho và đơn | Giữ hàng, xuất kho, lịch sử kho; trạng thái đơn, thanh toán, vận chuyển; mã vận đơn nhập tay | |
| Đánh giá, yêu thích | Đánh giá của người đã mua; danh sách yêu thích | Điểm đánh giá và lượt thích là nhãn học |
| Quản trị | Sản phẩm, đơn hàng, kho, khách hàng; vai trò cố định | |
| Ghi nhận hành vi | Lưu lượt xem sản phẩm, tìm kiếm, thêm giỏ, mua, thời gian tương tác 3D | Nguồn dữ liệu huấn luyện; phải có từ đầu vì không bù lại được |
| 3D | Xoay, phóng, toàn màn hình, góc nhìn cố định | |

### Bước 2: Tích hợp AI

Chưa chốt. Sẽ đề xuất các hướng sau khi bước 1 xong, rồi ghi vào một tài liệu riêng trong thư mục này.

### Bước 3: Nghiệp vụ mở rộng (sau AI, hoặc sau bảo vệ)

Mã giảm giá; đổi trả và hoàn tiền; cổng thanh toán; hàng đặt trước và đặt cọc; nhà cung cấp và đơn mua hàng; báo cáo kinh doanh; email; quản lý nội dung; so sánh sản phẩm; hỏi đáp; chú thích bộ phận 3D; tải file `.glb` qua trang quản trị; biến hình và AR.

## 5. Việc còn mở

- Chưa chốt tính năng AI và cách xây dựng mô hình (mục tiêu chính của dự án).
- Chưa chọn cổng thanh toán (VNPay hay MoMo).
- Chưa chọn dịch vụ gửi email.
- Chưa chọn nơi lưu file 3D và ảnh (đề xuất: Supabase Storage, vì đã dùng Supabase).
- Chính sách đổi trả (số ngày, điều kiện) chưa được chủ dự án cung cấp.
- Dùng tên sản phẩm thật: cần ghi rõ trong luận văn là dữ liệu minh hoạ, và không gắn nhãn "chính hãng" khi chưa có căn cứ.

## 6. Thay đổi ngày 15/10/2026

| Chủ đề | Quyết định mới | Thay cho |
| --- | --- | --- |
| Thứ tự làm | **Làm trang quản trị (quản trị website và quản lý kho) trước**, theo kế hoạch trong file Word `Ke_hoach_quan_ly_kho_va_quan_tri_website_robot_collectibles`. Phạm vi: các mục P0 và P1 của kế hoạch. Đặc tả: [10-quan-tri-va-kho.md](10-quan-tri-va-kho.md) | Mục 4: nghiệp vụ mở rộng sau AI |
| Phần cửa hàng | Chỉ sửa những gì cần để khớp dữ liệu mới (biến thể, giữ hàng, mã giảm giá, đánh giá, yêu thích, nội dung từ CSDL). Bắt buộc đăng nhập khi đặt hàng, sổ địa chỉ, bỏ trang tra cứu đơn để giai đoạn cửa hàng | |
| Vai trò | Thêm `warehouse_manager` (quản lý kho: ghi sổ phiếu kho, xem giá vốn) và `viewer` (chỉ xem, che thông tin cá nhân). Vẫn mỗi tài khoản một vai trò | Bảng vai trò ở mục 3 |
| Giá vốn | Bình quân gia quyền di động | Chưa có |
| CSDL | Supabase chỉ có dữ liệu mẫu; cho phép migration xoá và tạo lại bảng | |
| Cách làm | Làm từng việc theo [../ke-hoach/backlog-quan-tri-kho.md](../ke-hoach/backlog-quan-tri-kho.md) trên nhánh `auto/quan-tri-kho`, trong phiên có người theo dõi. Đã thử chạy tự động (T00–T03) rồi **bỏ hẳn** vì tốn hạn mức | |
