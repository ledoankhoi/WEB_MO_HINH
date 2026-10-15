# 6. Báo cáo và phân tích kinh doanh

Hệ thống nên trả lời được các câu hỏi:
- Mô hình robot nào bán chạy nhất?
- Dòng Transformers hay Super Sentai tạo ra nhiều doanh thu hơn?
- Sản phẩm nào có lượt xem cao nhưng ít người mua?
- Sản phẩm nào thường xuyên hết hàng?
- Khách thường mua kèm phụ kiện nào?
- Tỷ lệ huỷ đơn có đang tăng không?
- Khách quay lại mua lần hai chiếm bao nhiêu?
- Chương trình khuyến mãi nào mang lại kết quả tốt?
- Sản phẩm nào có tỷ lệ hoàn trả cao?

## Các nhóm báo cáo

| Nhóm | Chỉ số |
| --- | --- |
| Bán hàng | Doanh thu, số đơn, giá trị đơn trung bình |
| Sản phẩm | Lượt xem, tỷ lệ mua, sản phẩm bán chạy |
| Kho | Tồn kho, hàng chậm luân chuyển, hàng sắp hết |
| Khách hàng | Khách mới, khách quay lại, giá trị mua |
| Vận hành | Thời gian xử lý đơn, giao thất bại, huỷ đơn |
| Tài chính | Tiền thu, tiền hoàn, chi phí, lợi nhuận ước tính |
| Marketing | Lượt truy cập, nguồn truy cập, hiệu quả chiến dịch |
| 3D | Tỷ lệ mở trình xem, thời gian tương tác, lỗi tải |

Nên tách dữ liệu vận hành trực tiếp khỏi dữ liệu tổng hợp báo cáo. Khi dữ liệu lớn, các báo cáo nặng có thể tính định kỳ thay vì truy vấn toàn bộ giao dịch mỗi lần.
