# 8. Bảo mật, hiệu năng và vận hành hệ thống

Không hiển thị trực tiếp cho khách nhưng bắt buộc phải có khi đưa website vào sử dụng thật.

## 8.1. Bảo mật

- Xác thực và phân quyền ở phía máy chủ.
- Bảo vệ các API quản trị.
- Kiểm tra dữ liệu đầu vào.
- Chống truy cập dữ liệu của người khác.
- Giới hạn tần suất yêu cầu.
- Bảo vệ quy trình đăng nhập và đặt lại mật khẩu.
- Không lưu thông tin thẻ thanh toán nhạy cảm khi không cần thiết.
- Quản lý bí mật và API key bằng biến môi trường hoặc hệ thống quản lý bí mật.
- Ghi log hành động quan trọng.
- Sao lưu và phục hồi dữ liệu.
- Phòng chống các lỗ hổng web phổ biến.

## 8.2. Hiệu năng

- Tối ưu ảnh sản phẩm; tải ảnh theo nhu cầu.
- Tối ưu file 3D; tách phần tải 3D khỏi các thành phần giao diện không cần nó.
- Phân trang danh sách sản phẩm.
- Cache các dữ liệu công khai phù hợp.
- Tránh truy vấn cơ sở dữ liệu dư thừa.
- Tối ưu trải nghiệm trên điện thoại.
- Theo dõi thời gian tải trang và lỗi phía trình duyệt.

## 8.3. Độ tin cậy và vận hành

- Ghi log lỗi ứng dụng.
- Theo dõi tình trạng máy chủ và cơ sở dữ liệu.
- Phát hiện webhook thất bại.
- Thử lại các tác vụ nền theo cơ chế an toàn.
- Chống xử lý giao dịch trùng.
- Sao lưu cơ sở dữ liệu định kỳ và kiểm tra khả năng phục hồi.
- Quản lý phiên bản và quy trình triển khai.
- Tách môi trường phát triển, kiểm thử và production.
- Lưu lịch sử các thay đổi cấu hình quan trọng.
