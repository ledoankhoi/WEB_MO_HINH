# 11. Quy tắc trạng thái và tính nhất quán dữ liệu

Một website có đủ giao diện vẫn có thể sai nghiệp vụ nếu không quản lý trạng thái chặt chẽ.

## 11.1. Vòng đời đơn hàng

Mô hình tham khảo:

| Bước | Trạng thái | Ý nghĩa |
| --- | --- | --- |
| 1 | Pending confirmation | Chờ xác nhận đơn |
| 2 | Confirmed → Processing | Đã xác nhận, đang chuẩn bị |
| 3 | Shipped → Delivered | Đã gửi hàng, đã giao |
| 4 | Completed | Hoàn tất theo quy định của cửa hàng |

Nhánh riêng: Cancelled, Delivery failed, Return requested, Returned.

Không phải trạng thái nào cũng được chuyển trực tiếp sang trạng thái khác. Đây là ví dụ thiết kế, không phải quy trình bắt buộc: khi triển khai cần xác định các bước chuyển hợp lệ, điều kiện chuyển và vai trò được phép thực hiện.

## 11.2. Tách trạng thái đơn hàng, thanh toán và vận chuyển

Không dùng một trường duy nhất để biểu diễn tất cả.

| Đối tượng | Ví dụ trạng thái |
| --- | --- |
| Đơn hàng | Pending, Confirmed, Processing, Completed, Cancelled |
| Thanh toán | Pending, Paid, Failed, Partially refunded, Refunded |
| Vận chuyển | Not created, Ready, In transit, Delivered, Failed, Returned |
| Đổi trả | Requested, Approved, Rejected, Received, Resolved |
| Sản phẩm | Draft, Published, Archived |
| Tồn kho | Available, Reserved, Damaged, Quarantined |

Ví dụ: một đơn có thể đã thanh toán nhưng chưa gửi hàng. Đơn khác có thể đã giao thành công theo COD nhưng tiền chưa được đơn vị vận chuyển chuyển về cửa hàng.

Các trạng thái liên kết với nhau bằng quy tắc nghiệp vụ, không giả định chúng luôn thay đổi đồng thời.
