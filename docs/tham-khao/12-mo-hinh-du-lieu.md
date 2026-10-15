# 12. Mô hình dữ liệu cốt lõi

Bản đồ thực thể ban đầu. Sơ đồ ERD chính thức còn phải xác định khoá chính, khoá ngoại, quan hệ một nhiều, ràng buộc và chỉ mục.

| Nhóm | Thực thể |
| --- | --- |
| Catalog | Product, ProductVariant, Category, Brand, Series, ProductMedia, Model3D |
| Customer | User, Role, Address, Wishlist, Cart, CartItem |
| Commerce | Order, OrderItem, Coupon, Promotion, Payment, Refund |
| Inventory | Warehouse, InventoryBalance, StockMovement, StockReservation, PurchaseOrder |
| Fulfillment | Shipment, ShipmentEvent, ReturnRequest, ReturnItem |
| Engagement | Review, Question, Answer, Notification, SupportTicket |
| Administration | AuditLog, AppSetting, StaffPermission, Report |

## Nguyên tắc thiết kế

- `Product` mô tả sản phẩm chung; `ProductVariant` mô tả phiên bản bán được.
- SKU duy nhất trong phạm vi quản lý đã xác định.
- `OrderItem` lưu bản chụp tên, SKU, giá và số lượng tại thời điểm đặt hàng.
- `Payment` và `Refund` có lịch sử giao dịch riêng.
- `StockMovement` ghi nhận từng biến động kho.
- `Model3D` liên kết với sản phẩm hoặc biến thể và có trạng thái xử lý.
- `AuditLog` ghi lại các thao tác quản trị quan trọng.
- Xoá sản phẩm không được làm mất dữ liệu lịch sử đơn hàng.
- Tiền tệ dùng kiểu dữ liệu chính xác, không dùng số dấu phẩy động để tính tiền.
- Các giao dịch quan trọng phải bảo đảm tính nguyên tử và chống xử lý lặp.
