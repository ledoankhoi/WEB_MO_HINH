// Chữ cho phần dữ liệu mẫu thứ hai (seed-extras.ts): hỏi đáp sản phẩm, chat hỗ trợ, lý do trả hàng, công ty xuất hoá đơn.
// {p}: tên sản phẩm.

export const QUESTIONS: { q: string; staff: string; buyer?: string }[] = [
  { q: "Mẫu {p} cao khoảng bao nhiêu cm vậy shop?", staff: "Chào bạn, mô hình cao khoảng 18–20 cm ở dạng robot. Bạn có thể xem kích thước so sánh trong tab Xem 3D nhé.", buyer: "Mình đo được 19 cm, đặt cạnh lon nước ngọt cao hơn một chút." },
  { q: "{p} có kèm đế trưng bày không ạ?", staff: "Dạ mẫu này không kèm đế. Bạn có thể chọn thêm đế lục giác trong mục Xưởng của trang sản phẩm." },
  { q: "Hàng chính hãng hay hàng Trung Quốc vậy shop?", staff: "Dạ tất cả sản phẩm tại ROBOTICA là hàng chính hãng nhập từ nhà phân phối, có hoá đơn và tem của hãng.", buyer: "Mình nhận hộp có tem hologram của hãng, yên tâm nha." },
  { q: "Biến hình {p} có khó không, cho trẻ 10 tuổi chơi được không?", staff: "Mẫu này độ khó trung bình, khoảng 15–20 bước. Bé 10 tuổi chơi được nếu có người lớn hướng dẫn vài lần đầu ạ.", buyer: "Con mình 9 tuổi, chơi 2 lần là tự biến được rồi." },
  { q: "Phí giao hàng bao nhiêu vậy shop?", staff: "Dạ phí giao 30.000đ toàn quốc, đơn từ 1.000.000đ được miễn phí vận chuyển ạ." },
  { q: "{p} có mấy phiên bản màu vậy?", staff: "Hiện cửa hàng có bản tiêu chuẩn theo màu gốc của hãng. Bạn có thể thử phủ màu khác ở mục Xưởng để xem trước trên 3D." },
  { q: "Mua 2 con có được giảm giá không shop?", staff: "Bạn xem các combo ở trang sản phẩm nhé: mua đủ bộ được giảm thêm theo % của combo. Ngoài ra đơn từ 1 triệu được miễn phí vận chuyển." },
  { q: "Khớp của {p} có bị lỏng sau thời gian chơi không?", staff: "Khớp dùng nhựa ABS và khớp ma sát nên giữ dáng tốt. Nếu khớp lỏng trong thời gian bảo hành 12 tháng, shop hỗ trợ đổi linh kiện ạ.", buyer: "Mình chơi 3 tháng, biến qua lại nhiều lần vẫn chắc." },
  { q: "Đặt hôm nay thì bao lâu nhận được ở Đà Nẵng?", staff: "Dạ thường 3–4 ngày làm việc đi Đà Nẵng ạ. Bạn tra cứu đơn bằng mã đơn và số điện thoại để theo dõi." },
  { q: "{p} có đèn LED không shop?", staff: "Mẫu gốc không có đèn. Bạn có thể thêm đèn LED mắt/ngực ở mục Xưởng, xem trước hiệu ứng trong Phòng tối." },
  { q: "Hộp ngoài có bị móp khi giao không? Mình mua để sưu tầm.", staff: "Shop đóng 3 lớp: hộp gốc bọc màng, xốp chống sốc và thùng carton ngoài. Nếu hộp móp khi nhận, bạn chụp ảnh gửi shop để được hỗ trợ đổi.", buyer: "Mình nhận hộp vuông vức, không trầy." },
  { q: "Có thanh toán trả góp không ạ?", staff: "Hiện shop nhận COD, chuyển khoản và VNPay. Trả góp chưa hỗ trợ, shop sẽ thông báo khi có ạ." },
  { q: "{p} với bản cũ khác nhau chỗ nào?", staff: "Bản này khuôn mới, nhiều khớp hơn và sơn chi tiết hơn ở mặt, ngực. Bạn xem ảnh thật ở tab Ảnh thật để so sánh nhé." },
  { q: "Có nhận gói quà không shop?", staff: "Dạ có. Bạn chọn tuỳ chọn Hộp quà ở mục Xưởng khi đặt hàng nhé." },
  { q: "Sản phẩm có bảo hành không ạ?", staff: "Dạ bảo hành 12 tháng lỗi khớp, gãy chi tiết do nhà sản xuất. Đổi trả trong 7 ngày nếu hàng lỗi hoặc giao sai." },
];

// Hội thoại chat: tin khách và tin nhân viên xen kẽ, bắt đầu bằng khách. {p}: tên sản phẩm.
export const CHATS: string[][] = [
  ["Shop ơi mẫu {p} còn hàng không?", "Chào bạn, mẫu này còn hàng ạ. Bạn đặt trên web là shop gửi trong ngày nhé.", "Ok cảm ơn shop, mình đặt luôn."],
  ["Mình đặt đơn hôm qua mà chưa thấy xác nhận", "Dạ shop kiểm tra rồi, đơn của bạn đã xác nhận và đang đóng gói, chiều nay bàn giao vận chuyển ạ.", "Dạ cảm ơn shop"],
  ["Cho mình hỏi đổi địa chỉ giao được không?", "Dạ được ạ, bạn gửi mã đơn và địa chỉ mới giúp shop.", "Mã đơn mình gửi trong mail nha, địa chỉ mới là chỗ làm ở quận 3.", "Shop đã cập nhật địa chỉ mới cho bạn rồi ạ."],
  ["Shop có mẫu Optimus nào dưới 1 triệu không?", "Dạ bạn vào Cửa hàng, lọc giá đến 1.000.000đ và chọn thương hiệu Transformers sẽ thấy các mẫu phù hợp ạ."],
  ["Mình chuyển khoản rồi mà đơn vẫn báo chưa thanh toán", "Dạ kế toán đối soát sổ ngân hàng trong giờ làm việc ạ. Shop vừa kiểm tra, tiền đã về và đơn đã cập nhật đã thanh toán.", "Ok shop"],
  ["Mô hình mình nhận bị lỏng khớp tay trái", "Shop xin lỗi bạn ạ. Bạn gửi yêu cầu trả hàng trong trang đơn hàng kèm ảnh nhé, shop sẽ duyệt và đổi cho bạn.", "Mình gửi rồi nha"],
  ["Bao giờ có hàng {p} lại vậy shop?", "Dạ dự kiến đợt hàng tới về đầu tháng sau ạ. Bạn bấm \"Thông báo khi có hàng\" ở trang sản phẩm để nhận email nhé."],
  ["Shop có xuất hoá đơn công ty không?", "Dạ có ạ. Khi thanh toán bạn tích \"Xuất hoá đơn\" và điền thông tin công ty, shop gửi hoá đơn qua email sau khi đơn thanh toán đủ."],
  ["Mã ROBOT10 còn dùng được không?", "Dạ mã còn dùng được cho đơn từ 1.000.000đ, giảm 10% tối đa 200.000đ ạ."],
  ["Mình muốn mua làm quà cho bạn, shop tư vấn giúp mẫu nào đẹp", "Dạ tầm giá bạn muốn khoảng bao nhiêu ạ?", "Tầm 1 triệu rưỡi", "Bạn tham khảo {p} nhé, hộp đẹp, dễ biến hình, rất hợp làm quà ạ.", "Ok mình xem thử"],
  ["Shop ơi có giao vào cuối tuần không?", "Dạ đơn vị vận chuyển vẫn giao thứ 7, chủ nhật ạ. Bạn ghi chú khi đặt hàng là được."],
  ["Hello shop", "Chào bạn, ROBOTICA có thể giúp gì cho bạn ạ?"],
];

export const RETURN_NOTES: Record<string, string[]> = {
  defective: ["Khớp vai bên trái bị gãy khi mở hộp.", "Một chân không khoá được ở dạng robot."],
  missing_parts: ["Thiếu vũ khí đi kèm như trong mô tả.", "Hộp thiếu tờ hướng dẫn và một chi tiết nhỏ."],
  wrong_item: ["Mình đặt bản thường nhưng nhận bản khác màu."],
  not_as_described: ["Màu thực tế khác khá nhiều so với ảnh."],
  changed_mind: ["Mình đặt nhầm mẫu, hàng còn nguyên seal."],
};

export const COMPANIES = [
  { companyName: "Công ty TNHH Giải pháp Phần mềm Sao Việt", taxCode: "0316789012", companyAddress: "Tầng 5, 72 Lê Thánh Tôn, Phường Sài Gòn, TP. Hồ Chí Minh" },
  { companyName: "Công ty CP Truyền thông Đỉnh Cao", taxCode: "0109876543", companyAddress: "18 Duy Tân, Phường Cầu Giấy, Hà Nội" },
  { companyName: "Công ty TNHH Thiết kế Kiến Trúc Mộc", taxCode: "0401234567", companyAddress: "56 Nguyễn Văn Linh, Phường Hải Châu, Đà Nẵng" },
  { companyName: "Công ty TNHH Sự kiện Ánh Sao", taxCode: "0315556677", companyAddress: "120 Nguyễn Thị Minh Khai, Phường Bàn Cờ, TP. Hồ Chí Minh" },
  { companyName: "Công ty CP Công nghệ Bình Minh", taxCode: "0108889990", companyAddress: "35 Láng Hạ, Phường Láng, Hà Nội" },
];
