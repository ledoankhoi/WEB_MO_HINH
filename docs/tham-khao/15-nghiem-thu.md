# 15. Checklist nghiệm thu mức MVP

Dùng để theo dõi tiến độ. Đánh dấu hoàn thành không thay cho kiểm thử kỹ thuật và kiểm thử nghiệp vụ thực tế.

## Giao diện và sản phẩm

- [ ] Trang chủ hiển thị dữ liệu từ hệ thống
- [ ] Danh mục và bộ lọc hoạt động
- [ ] Trang sản phẩm hiển thị đúng giá, biến thể và tồn kho
- [ ] Mô hình 3D hoạt động và có ảnh dự phòng
- [ ] Giao diện dùng được trên điện thoại

## Mua hàng

- [ ] Thêm, sửa, xoá sản phẩm trong giỏ
- [ ] Checkout xác minh lại giá và tồn kho
- [ ] Tạo đơn không bị trùng khi gửi lặp
- [ ] Thanh toán có thể đối chiếu trạng thái
- [ ] Khách xem được lịch sử và trạng thái đơn

## Quản trị và kho

- [ ] Quản trị viên quản lý sản phẩm
- [ ] Nhân viên xử lý được đơn hàng
- [ ] Tồn kho không bị bán vượt trong giao dịch đồng thời
- [ ] Huỷ đơn giải phóng lượng hàng đã giữ
- [ ] Mọi điều chỉnh kho quan trọng đều có lịch sử

## An toàn và vận hành

- [ ] Khách không thể truy cập dữ liệu đơn của người khác
- [ ] API quản trị có kiểm tra quyền
- [ ] Lỗi thanh toán và webhook được ghi nhận
- [ ] Có sao lưu và kiểm tra phục hồi
- [ ] Có kiểm thử các luồng mua, huỷ và hoàn tiền
