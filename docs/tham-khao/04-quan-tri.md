# 4. Nghiệp vụ quản trị (Admin Portal)

Khu vực quyết định cửa hàng có vận hành thực tế được hay không.

## 4.1. Dashboard

Chỉ số nên có:
- Tổng doanh thu theo ngày, tuần, tháng.
- Số đơn mới và đơn cần xử lý.
- Giá trị đơn hàng trung bình; số lượng sản phẩm bán ra.
- Sản phẩm sắp hết hàng; sản phẩm bán chạy.
- Tỷ lệ huỷ đơn và hoàn hàng.
- Các giao dịch đang chờ xác minh.
- Tỷ lệ chuyển đổi từ lượt xem sang đơn hàng.

Lưu ý: doanh thu, tiền đã thu, giá trị đơn đã tạo và lợi nhuận là các chỉ số khác nhau, không gộp thành một con số.

## 4.2. Quản trị sản phẩm

- Tạo, sửa, ẩn, xuất bản sản phẩm.
- Quản lý SKU và biến thể.
- Nhập dữ liệu hàng loạt từ CSV hoặc bảng tính.
- Quản lý ảnh, video, file 3D.
- Thiết lập giá, giá vốn và trạng thái kinh doanh.
- Quản lý mô tả và thông số.
- Gán thương hiệu, series và danh mục.
- Thiết lập sản phẩm nổi bật.
- Kiểm tra sản phẩm thiếu ảnh, giá hoặc dữ liệu bắt buộc.
- Xem lịch sử thay đổi.

## 4.3. Quản trị tài nguyên 3D

1. Tải file 3D lên.
2. Kiểm tra định dạng và dung lượng.
3. Xác minh quyền sử dụng tài nguyên.
4. Xử lý hoặc tối ưu mô hình.
5. Tạo ảnh xem trước.
6. Gắn mô hình với sản phẩm hoặc biến thể.
7. Kiểm tra hiển thị trên desktop và mobile.
8. Xuất bản hoặc gỡ mô hình.
9. Thay phiên bản file và lưu lịch sử.
10. Theo dõi lỗi tải, hiệu năng và tài nguyên chưa dùng.

Định dạng phù hợp cho trình xem 3D trên web: GLB/glTF.

## 4.4. Quản trị đơn hàng

- Xem danh sách đơn theo trạng thái.
- Tìm đơn bằng mã đơn, tên hoặc số điện thoại theo quyền được cấp.
- Xác nhận đơn; kiểm tra thanh toán.
- Xác nhận giữ hàng hoặc xuất kho.
- In phiếu đóng gói; tạo vận đơn.
- Cập nhật thông tin giao hàng trong phạm vi cho phép.
- Huỷ đơn theo quy trình; xử lý đơn giao thất bại.
- Tiếp nhận yêu cầu đổi trả.
- Xem toàn bộ lịch sử thao tác.

## 4.5. Quản lý kho

Vòng đời tồn kho:

| Giai đoạn | Mô tả |
| --- | --- |
| Nhập hàng | Từ nhà cung cấp hoặc đơn nhập |
| Tồn kho khả dụng | Tồn thực tế trừ lượng đã giữ và lượng không thể bán |
| Giữ hàng, xuất kho | Khi đơn được xác nhận và đóng gói |
| Đối soát và điều chỉnh | Huỷ đơn, hoàn hàng, hàng lỗi, kiểm kê |

Nghiệp vụ:
- Quản lý tồn kho theo SKU; nhập kho và xuất kho.
- Giữ hàng cho đơn đang xử lý; giải phóng hàng khi đơn bị huỷ.
- Cảnh báo tồn kho thấp; kiểm kê định kỳ.
- Điều chỉnh tồn kho có lý do.
- Quản lý hàng hư hỏng hoặc hộp móp.
- Quản lý nhiều kho nếu cửa hàng mở rộng.
- Theo dõi lịch sử biến động tồn kho.
- Kiểm tra chênh lệch giữa tồn hệ thống và tồn thực tế.

Quy tắc: mọi thay đổi tồn kho phải có lịch sử giao dịch. Nhân viên không được sửa số lượng trực tiếp mà không lưu lý do và người thực hiện.

## 4.6. Nhà cung cấp và nhập hàng

- Lưu thông tin nhà cung cấp; quản lý danh mục hàng có thể nhập.
- Tạo đơn mua hàng.
- Theo dõi hàng đã đặt, đang vận chuyển và đã nhận.
- Kiểm tra số lượng thực nhận; ghi nhận hàng thiếu hoặc lỗi.
- Cập nhật giá vốn.
- Đối chiếu hoá đơn mua hàng và công nợ nếu có.
- Theo dõi thời gian nhập hàng; lịch sử mua hàng theo SKU.

Hàng giới hạn hoặc hàng Nhật đặt trước có thể cần quản lý số lượng phân bổ, ngày dự kiến về và tiền cọc.

## 4.7. Vận chuyển

- Cấu hình đơn vị vận chuyển và phương thức giao hàng.
- Tính hoặc nhận báo giá vận chuyển.
- Tạo vận đơn; theo dõi trạng thái giao hàng.
- Tiếp nhận webhook cập nhật.
- Xử lý giao thất bại và hoàn hàng về kho.
- Đối chiếu phí vận chuyển.
- Quản lý các đơn vị chỉ hỗ trợ xử lý thủ công.

## 4.8. Đổi trả và hoàn tiền

Trường hợp cần hỗ trợ:
- Giao sai mô hình.
- Sản phẩm lỗi hoặc thiếu phụ kiện.
- Hư hỏng khi vận chuyển.
- Khách đổi ý theo chính sách được công bố.
- Sản phẩm có tình trạng khác mô tả.

Quy trình:
1. Tiếp nhận yêu cầu.
2. Kiểm tra điều kiện và thời hạn.
3. Yêu cầu bằng chứng nếu cần.
4. Phê duyệt hoặc từ chối có lý do.
5. Hướng dẫn gửi hàng lại.
6. Kiểm tra hàng hoàn.
7. Quyết định nhập lại kho, cách ly hoặc xử lý hư hỏng.
8. Hoàn tiền hoặc phương án thay thế.
9. Hoàn tất hồ sơ và lưu lịch sử.

Phải phân biệt huỷ đơn trước giao hàng, đổi hàng, trả hàng và hoàn tiền, vì chúng tác động khác nhau đến kho, doanh thu và thanh toán.

## 4.9. Khuyến mãi và khách hàng thân thiết

- Tạo mã giảm giá; cấu hình chương trình khuyến mãi; giới hạn số lần sử dụng.
- Quản lý điểm thưởng; thiết lập cấp thành viên.
- Ghi nhận điểm cộng và điểm trừ; xử lý điểm khi đơn bị huỷ hoặc hoàn trả.
- Tạo chiến dịch chăm sóc khách hàng; đo hiệu quả chương trình.

## 4.10. Nội dung website

- Quản lý banner, trang giới thiệu, FAQ.
- Quản lý chính sách mua hàng, bảo hành và đổi trả.
- Quản lý bài viết hướng dẫn sưu tầm và tin tức sản phẩm mới.
- Thiết lập SEO.
- Lên lịch xuất bản và kết thúc hiển thị.
- Quản lý nội dung theo từng ngôn ngữ nếu cần.

## 4.11. Nhân viên và phân quyền

| Vai trò | Quyền chính |
| --- | --- |
| Super Admin | Toàn quyền hệ thống |
| Product Manager | Sản phẩm, danh mục, media |
| Warehouse Staff | Nhập kho, xuất kho, kiểm kê |
| Order Staff | Xử lý đơn và giao hàng |
| Customer Support | Khách hàng, yêu cầu hỗ trợ |
| Marketing Staff | Banner, khuyến mãi, nội dung |
| Accountant | Thanh toán, đối soát, báo cáo tài chính |

Nghiệp vụ đi kèm:
- Tạo và khoá tài khoản nhân viên; gán vai trò và quyền cụ thể.
- Giới hạn quyền xem dữ liệu nhạy cảm.
- Ghi nhật ký hành động.
- Kiểm soát các thao tác quan trọng như hoàn tiền và điều chỉnh kho.
- Tài khoản nhân viên không thể tự nâng quyền.
