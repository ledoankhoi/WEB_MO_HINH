# Tài liệu nghiệp vụ ROBOTICA

Tài liệu nghiệp vụ ban đầu cho website bán mô hình robot sưu tầm (Transformers, Super Sentai, Gundam và các dòng robot khác).

**Tình trạng:** bản tham khảo, được tổng hợp từ nguồn bên ngoài và chưa đối chiếu hết với dự án. Nội dung có thể sai hoặc không phù hợp; khi mâu thuẫn với mã nguồn thì cần xem xét lại trước khi làm theo. Đây là danh mục nghiệp vụ ở phạm vi rộng, không phải danh sách việc phải làm ngay: thứ tự ưu tiên nằm ở [14-pham-vi-uu-tien.md](14-pham-vi-uu-tien.md).

## Mục lục

| File | Nội dung |
| --- | --- |
| [01-tong-quan.md](01-tong-quan.md) | Ba khu vực của hệ thống và luồng nghiệp vụ xuyên suốt |
| [02-danh-muc-nghiep-vu.md](02-danh-muc-nghiep-vu.md) | Bản đồ 26 nhóm nghiệp vụ |
| [03-storefront.md](03-storefront.md) | Nghiệp vụ phía khách hàng |
| [04-quan-tri.md](04-quan-tri.md) | Nghiệp vụ quản trị và vận hành |
| [05-tai-chinh.md](05-tai-chinh.md) | Tài chính, đối soát, hoá đơn |
| [06-bao-cao.md](06-bao-cao.md) | Báo cáo và phân tích kinh doanh |
| [07-marketing.md](07-marketing.md) | Marketing và phát triển khách hàng |
| [08-bao-mat-van-hanh.md](08-bao-mat-van-hanh.md) | Bảo mật, hiệu năng, độ tin cậy |
| [09-tich-hop.md](09-tich-hop.md) | Các hệ thống bên ngoài |
| [10-quy-trinh.md](10-quy-trinh.md) | Bốn quy trình xuyên suốt |
| [11-trang-thai.md](11-trang-thai.md) | Quy tắc trạng thái và tính nhất quán |
| [12-mo-hinh-du-lieu.md](12-mo-hinh-du-lieu.md) | Các nhóm thực thể cốt lõi |
| [13-nghiep-vu-dac-thu.md](13-nghiep-vu-dac-thu.md) | Nghiệp vụ riêng của cửa hàng mô hình robot |
| [14-pham-vi-uu-tien.md](14-pham-vi-uu-tien.md) | Phân chia P0, P1, P2 và thứ tự triển khai |
| [15-nghiem-thu.md](15-nghiem-thu.md) | Checklist nghiệm thu mức MVP |
| [16-ke-hoach-quan-tri-kho.md](16-ke-hoach-quan-tri-kho.md) | Kế hoạch quản lý kho và quản trị website (bản chữ của file Word, 15/10/2026) |

## Điểm khác với dự án hiện tại

Những chỗ tài liệu này chưa khớp với mã nguồn (tính đến 12/10/2026):

- **Biến thể và SKU:** tài liệu yêu cầu `Product` và `ProductVariant` tách riêng. Dự án hiện chỉ có bảng `products`, mỗi sản phẩm một mức giá và một số tồn kho.
- **Trạng thái đơn hàng:** dự án dùng `pending`, `confirmed`, `shipping`, `completed`, `cancelled`. Tài liệu đề xuất thêm `Processing`, `Delivered`, giao thất bại và các trạng thái đổi trả, đồng thời tách riêng trạng thái vận chuyển.
- **Tồn kho:** dự án trừ thẳng cột `stock` khi đặt hàng và cộng lại khi huỷ. Chưa có giữ hàng (reservation) hay lịch sử biến động kho.
- **Thanh toán:** dự án chỉ có một cột `payment_status` trên đơn hàng, chưa có bảng giao dịch thanh toán và hoàn tiền.
- **Danh mục:** dự án dùng danh sách cố định trong `src/lib/catalog.ts`, chưa có danh mục cha con, thương hiệu hay series.
- **Trang quản trị:** chưa có giao diện.
- **Mô hình 3D:** dự án không tự xoay mô hình theo mặc định, trái với mục 3.4 của tài liệu.
