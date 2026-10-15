# 3. Nghiệp vụ phía khách hàng (Storefront)

Toàn bộ những gì khách hàng có thể làm khi truy cập website.

## 3.1. Trang chủ và điều hướng

Mục tiêu: giúp khách nhanh chóng tìm thấy dòng mô hình họ yêu thích.

Nghiệp vụ:
- Hiển thị banner, sản phẩm nổi bật và sản phẩm mới.
- Điều hướng đến Transformers, Super Sentai, Power Rangers, Gundam và các dòng khác.
- Hiển thị hàng bán chạy, hàng giảm giá, hàng sắp về.
- Hiển thị bộ sưu tập theo series, nhân vật hoặc hãng sản xuất.
- Hiển thị sản phẩm đã xem gần đây.
- Hiển thị chương trình khuyến mãi đang diễn ra.
- Điều hướng đến trang liên hệ, chính sách và hướng dẫn mua hàng.

Quy tắc:
- Chỉ hiển thị sản phẩm được phép công khai.
- Sản phẩm hết hàng vẫn có thể hiển thị nếu cửa hàng cho phép.
- Banner và sản phẩm nổi bật do quản trị viên cấu hình.
- Nội dung có trạng thái nháp, xuất bản và hết hạn khi phù hợp.

## 3.2. Danh mục và phân loại sản phẩm

Mô hình robot cần phân loại sâu hơn một cửa hàng thông thường. Ví dụ:

| Dòng | Phân nhóm |
| --- | --- |
| Transformers | G1, Movie, Masterpiece, Studio Series |
| Super Sentai | Theo series, chiến đội, robot hợp thể |
| Gundam và model kit | HG, RG, MG, PG, SD |

Nghiệp vụ:
- Tạo, sửa, ẩn, xoá danh mục.
- Phân loại theo thương hiệu, series, nhân vật, dòng sản phẩm.
- Phân loại theo loại sản phẩm: figure hoàn chỉnh, model kit, robot hợp thể, phụ kiện.
- Phân loại theo độ tuổi khuyến nghị, kích thước, tỷ lệ, chất liệu.
- Gán nhiều danh mục cho một sản phẩm.
- Quản lý danh mục cha con.
- Sắp xếp thứ tự hiển thị.
- Tạo bộ sưu tập riêng, ví dụ "Robot dưới 1 triệu", "Hàng chính hãng Nhật Bản".

## 3.3. Quản lý và hiển thị sản phẩm

Thông tin sản phẩm:

| Nhóm dữ liệu | Trường thông tin |
| --- | --- |
| Định danh | ID, SKU, tên, slug, mã vạch nếu có |
| Thương hiệu | Brand, nhà sản xuất, series |
| Nhân vật | Tên robot, tên nhân vật, phiên bản |
| Thương mại | Giá bán, giá niêm yết, giá vốn, thuế nếu áp dụng |
| Kho hàng | Số lượng, tình trạng còn hàng, ngưỡng tồn thấp |
| Đặc tính | Chiều cao, tỷ lệ, vật liệu, trọng lượng |
| Phiên bản | Màu sắc, phiên bản thường hoặc đặc biệt, bản giới hạn |
| Tình trạng | Mới, đã qua sử dụng, hộp móp, thiếu phụ kiện |
| Media | Ảnh, video, mô hình 3D, hướng dẫn |
| Bán hàng | Mô tả, bảo hành, đổi trả, xuất xứ |
| SEO | Tiêu đề, mô tả SEO, slug |

Nghiệp vụ:
1. Tạo sản phẩm mới.
2. Chỉnh sửa thông tin sản phẩm.
3. Tạo biến thể sản phẩm.
4. Quản lý SKU cho từng biến thể.
5. Quản lý nhiều ảnh theo góc chụp.
6. Đăng video giới thiệu hoặc video biến hình.
7. Gán mô hình 3D tương ứng.
8. Thiết lập giá và chương trình khuyến mãi.
9. Xuất bản, tạm ẩn hoặc ngừng kinh doanh.
10. Lưu lịch sử thay đổi giá và thông tin.
11. Quản lý sản phẩm liên quan, sản phẩm thay thế.
12. Quản lý hàng đặt trước và ngày dự kiến về hàng.

Quy tắc: một sản phẩm có thể có nhiều biến thể, mỗi biến thể có SKU, giá và tồn kho riêng. Màu sắc hay phiên bản khác nhau không được dùng chung SKU nếu tồn kho của chúng được quản lý riêng.

## 3.4. Xem mô hình 3D tương tác

Điểm khác biệt lớn nhất so với một cửa hàng trực tuyến thông thường.

Nghiệp vụ:
- Hiển thị mô hình 3D ngay trên trang sản phẩm.
- Xoay mô hình theo mọi hướng; phóng to và thu nhỏ.
- Tự động xoay khi khách không tương tác.
- Chuyển góc nhìn trước, sau, hai bên và phía trên.
- Chuyển màu sắc hoặc biến thể nếu mô hình hỗ trợ.
- Ẩn hoặc hiện các bộ phận nếu file 3D cho phép.
- Hiển thị chú thích về các bộ phận robot.
- Chuyển giữa ảnh thực tế, video và mô hình 3D.
- Chế độ toàn màn hình.
- Hỗ trợ chuột, cảm ứng và màn hình di động.
- Hiển thị trạng thái tải, lỗi tải và ảnh thay thế.
- Chỉ tải mô hình 3D khi cần để tối ưu tốc độ.

Nâng cao:
- Biến hình robot thành phương tiện nếu mô hình có cấu trúc và animation phù hợp.
- Lắp ráp hoặc tháo rời từng bộ phận.
- Hiển thị phụ kiện tương thích.
- So sánh kích thước giữa các mô hình.
- Xem thử trong không gian thực bằng AR nếu thiết bị và định dạng hỗ trợ.

Quy tắc:
- Mỗi biến thể có thể dùng một mô hình 3D riêng.
- Không có mô hình 3D thì tự chuyển về ảnh sản phẩm.
- Quản trị viên kiểm soát định dạng, dung lượng, phiên bản và trạng thái xử lý file.
- Lỗi WebGL hoặc file 3D không được làm hỏng cả trang sản phẩm.
- Phải có quyền sử dụng hợp lệ đối với file 3D và tài nguyên thương hiệu.

## 3.5. Tìm kiếm và bộ lọc

Khách có thể tìm theo:
- Tên robot hoặc nhân vật; tên series, hãng sản xuất.
- SKU hoặc mã sản phẩm.
- Dòng sản phẩm (Transformers, Super Sentai, Gundam...).
- Khoảng giá; tình trạng còn hàng.
- Tỷ lệ, chiều cao, chất liệu.
- Hàng mới, hàng đặt trước, hàng giới hạn.
- Đánh giá của khách hàng.
- Loại sản phẩm và tình trạng hộp.

Nghiệp vụ đi kèm:
- Gợi ý khi nhập từ khoá; gợi ý sửa từ khoá gần đúng.
- Hiển thị số lượng kết quả.
- Sắp xếp theo giá, độ phổ biến, mới nhất, đánh giá.
- Giữ nguyên bộ lọc khi chuyển trang.
- Thông báo khi không tìm thấy sản phẩm.
- Theo dõi từ khoá tìm kiếm phổ biến để cải thiện danh mục.

## 3.6. Tài khoản và xác thực

Khách hàng có thể:
- Đăng ký bằng email hoặc phương thức được hỗ trợ; đăng nhập và đăng xuất.
- Xác minh email; quên và đặt lại mật khẩu.
- Quản lý tên hiển thị, số điện thoại, nhiều địa chỉ giao hàng.
- Xem lịch sử đơn hàng; quản lý danh sách yêu thích.
- Yêu cầu xoá tài khoản theo chính sách dữ liệu.

Quy tắc bảo mật:
- Không lưu mật khẩu dạng văn bản thuần.
- Giới hạn số lần thử đăng nhập và chống lạm dụng.
- Kiểm tra quyền mỗi khi đọc hoặc sửa dữ liệu riêng tư.
- Khách không xem được đơn hàng của người khác.
- Chỉ thu thập dữ liệu cá nhân thực sự cần thiết.

## 3.7. Danh sách yêu thích và so sánh sản phẩm

- Thêm hoặc xoá sản phẩm khỏi danh sách yêu thích.
- Lưu danh sách cho tài khoản đã đăng nhập; khách chưa đăng nhập lưu tạm trên thiết bị.
- Đồng bộ danh sách khi khách đăng nhập.
- So sánh giá, kích thước, series, vật liệu, phụ kiện.
- Chuyển sản phẩm yêu thích vào giỏ hàng.
- Thông báo khi giá giảm hoặc có hàng trở lại, nếu khách đăng ký nhận.

## 3.8. Giỏ hàng

Nghiệp vụ:
- Thêm sản phẩm, đổi số lượng, xoá sản phẩm, chọn biến thể.
- Hiển thị giá từng sản phẩm và tổng tiền.
- Áp dụng hoặc gỡ mã giảm giá.
- Hiển thị phí vận chuyển ước tính.
- Lưu giỏ hàng khi chuyển trang; khôi phục khi đăng nhập.
- Cảnh báo sản phẩm đã hết hàng hoặc đổi giá.
- Gợi ý phụ kiện hoặc sản phẩm liên quan.

Quy tắc:
- Số lượng đặt không vượt quá lượng hàng khả dụng.
- Giá phải được xác minh lại từ máy chủ khi checkout.
- Không tin giá hoặc tổng tiền do trình duyệt gửi lên.
- Giỏ hàng không giữ hàng cho khách, trừ khi hệ thống có cơ chế đặt giữ tồn kho.
- Khi hai khách cùng mua sản phẩm cuối cùng, hệ thống phải tránh bán vượt tồn kho.

## 3.9. Checkout

| Bước | Nội dung |
| --- | --- |
| 1. Xác nhận giỏ hàng | Sản phẩm, phiên bản, số lượng, giá hiện tại |
| 2. Thông tin giao hàng | Người nhận, số điện thoại, địa chỉ, ghi chú |
| 3. Áp dụng ưu đãi | Mã giảm giá, điểm thưởng và điều kiện áp dụng |
| 4. Tính tổng đơn | Tiền hàng, giảm giá, vận chuyển, thuế nếu áp dụng |
| 5. Chọn thanh toán | COD, chuyển khoản hoặc cổng thanh toán |
| 6. Xác nhận đặt hàng | Tạo mã đơn, lưu bản chụp giá và chi tiết đơn |

Quy tắc:
- Địa chỉ giao hàng phải đủ thông tin cần thiết.
- Mã giảm giá phải còn hiệu lực và đạt điều kiện.
- Tổng tiền được tính lại ở máy chủ.
- Mỗi đơn có mã định danh duy nhất.
- Không tạo hai đơn giống nhau khi khách bấm nút nhiều lần.
- Thanh toán thất bại thì phải có quy trình thử lại.
- Sản phẩm hết hàng trước khi xác nhận thì thông báo và yêu cầu khách điều chỉnh.
- Hàng đặt trước phải hiển thị ngày dự kiến giao và chính sách cọc riêng.

## 3.10. Khuyến mãi và định giá

Các loại khuyến mãi có thể hỗ trợ:
- Giảm theo phần trăm; giảm số tiền cố định; giảm phí vận chuyển.
- Giảm theo danh mục hoặc thương hiệu; giảm khi mua đủ số lượng.
- Combo robot và phụ kiện; quà tặng kèm.
- Ưu đãi khách hàng thân thiết; khuyến mãi theo thời gian; ưu đãi riêng cho một nhóm khách.

Quản trị viên thiết lập thời gian bắt đầu và kết thúc, số lượt sử dụng, số tiền tối thiểu, sản phẩm áp dụng và giới hạn cho mỗi khách.

Cần quy định rõ: khuyến mãi có cộng dồn không, mã nào được ưu tiên, cách phân bổ giảm giá cho từng sản phẩm, và cách xử lý khi đơn bị huỷ hoặc hoàn trả.

## 3.11. Thanh toán

Phương thức có thể tích hợp:
- COD (thanh toán khi nhận hàng).
- Chuyển khoản ngân hàng.
- Cổng thanh toán trực tuyến; ví điện tử.
- Thanh toán tiền cọc cho hàng đặt trước.

Nghiệp vụ:
- Tạo yêu cầu thanh toán; ghi nhận trạng thái chờ thanh toán.
- Xác minh giao dịch qua thông báo máy chủ hoặc webhook.
- Xử lý thành công, thất bại, hết hạn và huỷ giao dịch.
- Đối chiếu số tiền thực tế với số tiền đơn hàng.
- Chống ghi nhận thanh toán trùng.
- Hoàn tiền toàn phần hoặc một phần khi đủ điều kiện.
- Lưu lịch sử giao dịch và mã tham chiếu.

Quy tắc: không đánh dấu thanh toán thành công chỉ vì trình duyệt chuyển về trang thành công. Trạng thái phải được xác minh bằng cơ chế tin cậy của nhà cung cấp.

## 3.12. Theo dõi đơn hàng

Khách xem được: mã đơn, ngày đặt, chi tiết sản phẩm và số lượng, địa chỉ giao hàng, tổng tiền, phương thức thanh toán, trạng thái đơn, mã vận đơn nếu có, lịch sử cập nhật trạng thái, hướng dẫn khi giao hàng thất bại.

Thao tác tuỳ trạng thái:
- Huỷ đơn khi còn đủ điều kiện.
- Thanh toán lại đơn chưa thanh toán.
- Cập nhật thông tin trong giai đoạn được phép.
- Yêu cầu đổi trả hoặc hoàn tiền.
- Mua lại sản phẩm từ đơn cũ.

## 3.13. Đánh giá, hỏi đáp và nội dung cộng đồng

- Đánh giá theo sao và nhận xét; đăng ảnh thực tế.
- Hỏi đáp về kích thước, độ khớp, phụ kiện.
- Xác nhận người đánh giá đã mua hàng.
- Báo cáo nội dung vi phạm; quản trị viên duyệt hoặc ẩn nội dung vi phạm.
- Câu hỏi thường gặp theo sản phẩm.

Quy tắc: không tự động xoá đánh giá tiêu cực. Kiểm duyệt dựa trên nội dung và quy định rõ ràng.

## 3.14. Thông báo và chăm sóc khách hàng

Các loại thông báo:
- Xác nhận đặt hàng; xác nhận thanh toán.
- Đơn đã đóng gói hoặc bàn giao vận chuyển.
- Giao thành công hoặc giao thất bại.
- Huỷ đơn và hoàn tiền.
- Hàng đặt trước sắp về; sản phẩm yêu thích đã có hàng.
- Chương trình khuyến mãi phù hợp.

Kênh gửi: thông báo trên website, email hoặc SMS qua nhà cung cấp tích hợp.

Chăm sóc khách hàng:
- Gửi câu hỏi hỗ trợ; tra cứu đơn hàng; tiếp nhận khiếu nại.
- Theo dõi trạng thái yêu cầu hỗ trợ; lưu lịch sử trao đổi.
- Chuyển yêu cầu cho nhân viên phụ trách.
