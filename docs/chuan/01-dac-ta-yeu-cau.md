# 01. Đặc tả yêu cầu

Yêu cầu của **bước 1**: trang thương mại điện tử cốt lõi. Phần AI (bước 2) sẽ có tài liệu riêng; các nghiệp vụ mở rộng (bước 3) chỉ được liệt kê ở mục 7.

Căn cứ: [00-quyet-dinh-nen-tang.md](00-quyet-dinh-nen-tang.md). Dữ liệu: [03-co-so-du-lieu.md](03-co-so-du-lieu.md). Trạng thái: [04-trang-thai.md](04-trang-thai.md).

Cột **Hiện trạng** so với mã nguồn ngày 12/10/2026: *Có* (đã chạy), *Sửa* (có nhưng phải đổi theo thiết kế mới), *Chưa*.

## 1. Mục tiêu và phạm vi

ROBOTICA là website bán mô hình robot sưu tầm (Transformers, Super Sentai, Gundam và các dòng khác), cho khách xem mô hình 3D tương tác trước khi mua, và có tích hợp AI do dự án tự xây dựng.

Trong phạm vi bước 1:
- Khách tìm, xem, đặt mua và theo dõi đơn hàng.
- Nhân viên quản lý sản phẩm, kho và đơn hàng theo vai trò.
- Hệ thống ghi lại hành vi người dùng làm dữ liệu cho phần AI.

Ngoài phạm vi bước 1: cổng thanh toán trực tuyến, tích hợp hãng vận chuyển, hàng đặt trước, đổi trả, mã giảm giá, nhà cung cấp, báo cáo, email, quản lý nội dung.

## 2. Tác nhân

| Tác nhân | Mô tả |
| --- | --- |
| Khách vãng lai | Chưa đăng nhập. Xem, tìm, dùng giỏ hàng; không đặt hàng được |
| Khách hàng | Đã đăng nhập. Đặt hàng, quản lý tài khoản, đánh giá, yêu thích |
| Quản lý sản phẩm | Sản phẩm, biến thể, danh mục, thương hiệu, series |
| Nhân viên kho | Nhập kho, kiểm kê, đóng gói, nhận hàng hoàn |
| Nhân viên đơn hàng | Xác nhận đơn, vận đơn, cập nhật giao hàng, huỷ đơn |
| Chăm sóc khách hàng | Xem khách hàng và đơn hàng, duyệt đánh giá |
| Kế toán | Ghi nhận thu tiền, hoàn tiền |
| Marketing | Chưa có chức năng ở bước 1 (để dành cho bước 3) |
| Quản trị viên | Toàn quyền; quản lý tài khoản nhân viên |

## 3. Yêu cầu chức năng

### 3.1. Danh mục và sản phẩm (DM)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-DM-01 | Sản phẩm thuộc một danh mục (tối đa 2 cấp), có thể có thương hiệu, series, loại, tỷ lệ, cấp độ | Sửa |
| YC-DM-02 | Sản phẩm có một hoặc nhiều biến thể; mỗi biến thể có SKU, tên, tình trạng (mới, đã qua sử dụng), giá riêng | Có (dữ liệu; màn hình quản lý biến thể ở T06) |
| YC-DM-03 | Chỉ sản phẩm `published` và biến thể đang bật hiện cho khách | Có |
| YC-DM-04 | Trang sản phẩm hiện tên, thương hiệu, series, giá và tình trạng hàng của biến thể đang chọn, mô tả, thông số, đánh giá, sản phẩm liên quan | Sửa |
| YC-DM-05 | Khách đổi biến thể trên trang sản phẩm; giá, tồn kho và màu mô hình 3D đổi theo | Có (trừ màu mô hình 3D dựng sẵn) |
| YC-DM-06 | Trang chủ hiện sản phẩm nổi bật, hàng mới và các danh mục | Có |

### 3.2. Tìm kiếm và lọc (TK)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-TK-01 | Tìm theo tên, mô tả, thương hiệu, series, SKU; không phân biệt dấu tiếng Việt | Sửa |
| YC-TK-02 | Lọc theo danh mục, thương hiệu, series, loại, tình trạng, khoảng giá, còn hàng | Sửa |
| YC-TK-03 | Sắp xếp theo mới nhất, nổi bật, giá tăng, giá giảm, tên | Có |
| YC-TK-04 | Bộ lọc nằm trên URL, giữ nguyên khi chuyển trang; có nút xoá bộ lọc và trạng thái không có kết quả | Có |

### 3.3. Mô hình 3D (3D)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-3D-01 | Xoay bằng chuột và cảm ứng; phóng to, thu nhỏ trong giới hạn; về góc nhìn ban đầu | Có |
| YC-3D-02 | Không tự xoay theo mặc định; khách tự bật | Có |
| YC-3D-03 | Chế độ toàn màn hình và các góc nhìn cố định (trước, sau, trái, phải, trên) | Chưa |
| YC-3D-04 | Hiển thị file `.glb` nếu sản phẩm có; lỗi tải hoặc không có WebGL thì hiện ảnh thay thế, không làm hỏng trang | Sửa (chưa thử với file thật) |
| YC-3D-05 | Thư viện 3D chỉ tải ở trang có khung xem; ngừng vẽ khi khung nằm ngoài màn hình | Có |

### 3.4. Tài khoản (TKH)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-TKH-01 | Đăng ký bằng email và mật khẩu; đăng nhập; đăng xuất | Có |
| YC-TKH-02 | Sửa họ tên, số điện thoại; đổi mật khẩu (đăng xuất các thiết bị khác) | Có |
| YC-TKH-03 | Sổ địa chỉ: thêm, sửa, xoá, chọn địa chỉ mặc định | Chưa |
| YC-TKH-04 | Tài khoản bị khoá không đăng nhập được | Có một phần (chặn đăng nhập và phiên; chưa có nút khoá) |

### 3.5. Giỏ hàng và đặt hàng (GH)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-GH-01 | Thêm biến thể vào giỏ, đổi số lượng, xoá; giỏ lưu ở trình duyệt và còn sau khi tải lại | Có |
| YC-GH-02 | Giỏ luôn hiện giá và tồn kho mới nhất từ máy chủ; cảnh báo khi hết hàng hoặc vượt tồn | Có |
| YC-GH-03 | Phải đăng nhập mới vào được trang đặt hàng; sau khi đăng nhập quay lại đúng trang đó | Sửa |
| YC-GH-04 | Chọn địa chỉ từ sổ địa chỉ hoặc nhập mới; chọn COD hoặc chuyển khoản | Sửa |
| YC-GH-05 | Máy chủ tính lại toàn bộ giá và tổng tiền; không dùng số do trình duyệt gửi | Có |
| YC-GH-06 | Đặt hàng giữ hàng trong kho; hai khách đặt món cuối cùng thì chỉ một người thành công | Có |
| YC-GH-07 | Bấm đặt hàng nhiều lần không tạo đơn trùng | Có |
| YC-GH-08 | Giá đổi hoặc hết hàng lúc đặt thì báo rõ sản phẩm nào và không tạo đơn | Có |

### 3.6. Đơn hàng phía khách (DH)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-DH-01 | Khách xem danh sách và chi tiết đơn của mình: sản phẩm, tiền, ba trạng thái, mã vận đơn, lịch sử | Có (trang đơn theo liên kết; danh sách trong tài khoản chưa hiện ba trạng thái) |
| YC-DH-02 | Khách không xem được đơn của người khác | Sửa (đang dùng liên kết có token) |
| YC-DH-03 | Khách huỷ đơn khi đơn còn `pending` | Có |
| YC-DH-04 | Đơn chuyển khoản chưa thanh toán hiện mã VietQR kèm số tiền và nội dung | Có |

### 3.7. Đánh giá và yêu thích (DG)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-DG-01 | Khách đã mua và đơn đã hoàn tất được đánh giá 1 đến 5 sao kèm nhận xét, mỗi lần mua một lần | Chưa |
| YC-DG-02 | Đánh giá chỉ hiện sau khi được duyệt; trang sản phẩm hiện điểm trung bình và số đánh giá | Chưa |
| YC-DG-03 | Khách thêm, bỏ sản phẩm yêu thích; xem danh sách yêu thích | Chưa |

### 3.8. Quản trị (QT)

Cập nhật 15/10/2026: phần quản trị và kho được đặc tả chi tiết ở [10-quan-tri-va-kho.md](10-quan-tri-va-kho.md) (vai trò mới, quyền, phiếu kho, nội dung cửa hàng, mã giảm giá, nghiệm thu). Bảng dưới vẫn đúng; tài liệu 10 chi tiết hơn và đúng hơn khi khác nhau.

| Mã | Yêu cầu | Vai trò | Hiện trạng |
| --- | --- | --- | --- |
| YC-QT-01 | Trang quản trị chỉ mở cho nhân viên; mỗi chức năng kiểm tra vai trò ở máy chủ | Tất cả | Có |
| YC-QT-02 | Tạo, sửa, xuất bản, lưu trữ sản phẩm; quản lý biến thể | Quản lý sản phẩm | Chưa (có sẵn một phần xử lý ở máy chủ) |
| YC-QT-03 | Quản lý danh mục, thương hiệu, series | Quản lý sản phẩm | Có |
| YC-QT-04 | Chụp ảnh đại diện từ mô hình 3D khi lưu sản phẩm | Quản lý sản phẩm | Chưa (có sẵn phần chụp) |
| YC-QT-05 | Xem tồn kho, nhập kho, điều chỉnh có lý do, xem lịch sử biến động, danh sách sắp hết | Nhân viên kho | Có |
| YC-QT-06 | Danh sách đơn lọc theo trạng thái, tìm theo mã đơn; thực hiện các thao tác L2 đến L14 theo đúng vai trò | Theo bảng ở tài liệu 04 | Có |
| YC-QT-07 | Danh sách các đơn đã huỷ nhưng đã thu tiền, chờ hoàn | Kế toán | Có |
| YC-QT-08 | Duyệt, ẩn đánh giá | Chăm sóc khách hàng | Chưa |
| YC-QT-09 | Xem danh sách khách hàng và đơn của từng người | Chăm sóc khách hàng | Chưa |
| YC-QT-10 | Tạo tài khoản nhân viên, đổi vai trò, khoá tài khoản; không ai tự đổi vai trò của mình | Quản trị viên | Có |
| YC-QT-11 | Trang tổng quan: số đơn theo trạng thái, đơn cần xử lý, hàng sắp hết | Tất cả nhân viên | Chưa |
| YC-QT-12 | Ghi nhật ký mọi thao tác quản trị làm thay đổi dữ liệu | Hệ thống | Chưa |

### 3.9. Ghi nhận hành vi (HV)

| Mã | Yêu cầu | Hiện trạng |
| --- | --- | --- |
| YC-HV-01 | Ghi sự kiện: xem sản phẩm, tìm kiếm, thêm và bỏ giỏ, yêu thích, mua, tương tác 3D | Chưa |
| YC-HV-02 | Mỗi trình duyệt có một mã khách ngẫu nhiên để nối hành vi trước và sau khi đăng nhập | Chưa |
| YC-HV-03 | Ghi sự kiện thất bại không được làm hỏng thao tác của khách | Chưa |
| YC-HV-04 | Xuất được dữ liệu sự kiện ra file để huấn luyện mô hình | Chưa |

## 4. Quy tắc nghiệp vụ

| Mã | Quy tắc |
| --- | --- |
| QT-01 | Giá, tổng tiền và tồn kho luôn do máy chủ quyết định |
| QT-02 | Số có thể bán = `on_hand − reserved`; không bao giờ âm |
| QT-03 | Mỗi lần đặt, một biến thể tối đa 10 chiếc |
| QT-04 | Phí vận chuyển 30.000 ₫; miễn phí cho đơn từ 1.000.000 ₫ (cấu hình trong `src/config/site.ts`) |
| QT-05 | Đơn hàng lưu bản chụp tên, SKU và giá tại lúc đặt |
| QT-06 | Sản phẩm, biến thể đã có trong đơn hàng thì không xoá |
| QT-07 | Mọi thay đổi tồn kho có một dòng lịch sử; điều chỉnh tay bắt buộc ghi lý do |
| QT-08 | Trạng thái chỉ đổi theo các luật L1 đến L14 ở tài liệu 04 |
| QT-09 | Mật khẩu từ 8 đến 128 ký tự, lưu dạng băm scrypt |
| QT-10 | Không gắn nhãn "chính hãng", "giới hạn", "hàng hiếm" khi không có căn cứ; dữ liệu minh hoạ phải được ghi rõ |

## 5. Yêu cầu phi chức năng

| Mã | Yêu cầu | Cách kiểm |
| --- | --- | --- |
| PCN-01 | Mọi kiểm tra quyền và dữ liệu đầu vào thực hiện ở máy chủ | Xem mã; test gọi thẳng không qua giao diện |
| PCN-02 | Giới hạn tần suất cho đăng nhập, đăng ký, đặt hàng | Test |
| PCN-03 | Kết nối CSDL dùng TLS có xác minh; mọi bảng bật RLS | Đã kiểm trên Supabase |
| PCN-04 | Phiên đăng nhập lưu trong cookie HttpOnly; CSDL chỉ giữ mã băm của token | Xem mã |
| PCN-05 | Trang xem hàng hiện nội dung dưới 1 giây trên bản production ở mạng thông thường | Đo bằng trình duyệt |
| PCN-06 | Dùng được ở chiều rộng 375, 768, 1024 và 1440 px, không tràn ngang | Chụp màn hình tự động |
| PCN-07 | Dùng được bằng bàn phím; có nhãn cho trình đọc màn hình; tôn trọng thiết lập giảm chuyển động | Kiểm tay |
| PCN-08 | Giao diện tiếng Việt; tiền hiển thị theo VND | Xem giao diện |
| PCN-09 | Bí mật (chuỗi kết nối, mật khẩu) chỉ nằm trong biến môi trường, không đưa lên git | Xem `.gitignore` |
| PCN-10 | Các giao dịch đặt hàng, huỷ đơn, kho là nguyên tử và có test tự động | `npm test` |

## 6. Giả định và ràng buộc

- Công nghệ: Next.js 16, TypeScript, PostgreSQL (Supabase), Three.js. Chi tiết ở tài liệu 05.
- Vận chuyển xử lý thủ công: nhân viên tự tạo đơn bên hãng rồi nhập mã vận đơn.
- Chuyển khoản được xác nhận thủ công bởi kế toán.
- Tên sản phẩm thật chỉ dùng để minh hoạ; mô hình 3D là bản tự dựng.
- Chưa có chính sách đổi trả và thông tin liên hệ thật; trang không hiển thị các mục này cho tới khi chủ dự án cung cấp.

## 7. Để dành cho bước 3

Mã giảm giá; đổi trả và hoàn tiền một phần; cổng thanh toán; hàng đặt trước và đặt cọc; nhà cung cấp và đơn mua hàng; báo cáo kinh doanh; email (xác nhận đơn, đặt lại mật khẩu, xác minh email); quản lý nội dung; so sánh sản phẩm; hỏi đáp; chú thích bộ phận 3D; tải file `.glb` qua trang quản trị; biến hình và AR.

Lưu ý: **đặt lại mật khẩu cần gửi email**, nên ở bước 1 khách quên mật khẩu chưa tự xử lý được. Nếu muốn có ngay, cần chọn dịch vụ gửi email và kéo mục này lên bước 1.
