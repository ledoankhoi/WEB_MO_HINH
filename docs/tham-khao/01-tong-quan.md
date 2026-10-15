# 1. Tổng quan hệ thống

Một cửa hàng trực tuyến hoàn chỉnh phải xử lý toàn bộ vòng đời mua bán, không chỉ xem sản phẩm và đặt hàng: khách truy cập, tìm mô hình, kiểm tra hàng, đặt hàng, thanh toán, giao hàng, chăm sóc sau bán, cùng với quản lý kho, tài chính và vận hành.

## Ba khu vực

| Khu vực | Người dùng | Vai trò |
| --- | --- | --- |
| Storefront | Khách hàng | Khám phá, xem 3D, mua hàng, theo dõi đơn, đánh giá |
| Admin Portal | Quản trị viên, nhân viên vận hành | Sản phẩm, đơn hàng, kho, khuyến mãi, báo cáo; đóng gói, giao hàng, đổi trả, chăm sóc khách hàng |
| Backend | Hệ thống | Giá, tồn kho, thanh toán, phân quyền, dữ liệu, bảo mật, tích hợp thanh toán và vận chuyển |

## Luồng nghiệp vụ xuyên suốt

Sản phẩm → Giỏ hàng → Đặt hàng → Thanh toán → Kho → Giao hàng → Hậu mãi
