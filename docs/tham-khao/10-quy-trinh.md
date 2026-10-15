# 10. Các quy trình nghiệp vụ xuyên suốt

Các module không tồn tại độc lập. Dưới đây là bốn quy trình quan trọng nhất.

## Quy trình A: Bán một sản phẩm có sẵn

1. Khách xem sản phẩm và mô hình 3D.
2. Chọn biến thể, thêm vào giỏ hàng.
3. Checkout; xác minh giá và tồn kho.
4. Tạo đơn hàng và yêu cầu thanh toán.
5. Xác nhận thanh toán hoặc COD.
6. Giữ hàng, đóng gói và xuất kho.
7. Giao hàng và cập nhật trạng thái.
8. Hoàn tất đơn, ghi nhận dữ liệu bán hàng.

Điểm cần kiểm thử: giá thay đổi trong lúc checkout; hai khách mua món hàng cuối cùng; thanh toán gửi kết quả trùng; đơn bị huỷ sau khi giữ hàng; vận chuyển cập nhật chậm.

## Quy trình B: Đặt trước mô hình robot

1. Quản trị viên tạo sản phẩm đặt trước.
2. Khai báo thời gian mở đặt trước và dự kiến về hàng.
3. Thiết lập số lượng được nhận đặt.
4. Khách đặt hàng và thanh toán cọc hoặc toàn bộ theo chính sách.
5. Hệ thống ghi nhận nghĩa vụ giao hàng trong tương lai.
6. Quản trị viên cập nhật lịch nhập hàng.
7. Thông báo khi hàng sắp về hoặc có thay đổi.
8. Thu phần tiền còn lại nếu có.
9. Xuất kho và giao hàng.
10. Xử lý huỷ hoặc hoàn cọc theo điều kiện đã công bố.

Quy tắc: phân biệt hàng có sẵn với hàng đặt trước. Không cộng số lượng đặt trước vào tồn kho thực tế như thể hàng đã về.

## Quy trình C: Đổi trả sản phẩm bị lỗi

1. Khách tạo yêu cầu đổi trả.
2. Hệ thống kiểm tra đơn hàng và thời hạn.
3. Nhân viên tiếp nhận bằng chứng.
4. Duyệt hoặc từ chối yêu cầu.
5. Nhận hàng hoàn về và kiểm tra.
6. Phân loại: còn bán được, cần sửa, hoặc hàng lỗi.
7. Hoàn tiền hoặc gửi hàng thay thế.
8. Cập nhật tồn kho và hồ sơ tài chính.
9. Đóng yêu cầu và lưu lịch sử.

## Quy trình D: Nhập hàng từ nhà cung cấp

1. Tạo đề nghị nhập hàng.
2. Xác nhận nhà cung cấp, SKU, giá và số lượng.
3. Tạo đơn mua hàng.
4. Theo dõi tiến độ.
5. Nhận và kiểm tra hàng.
6. Ghi nhận thiếu hụt hoặc hư hỏng.
7. Nhập kho theo số lượng thực nhận.
8. Cập nhật giá vốn và công nợ.
9. Hoàn tất đối soát.
