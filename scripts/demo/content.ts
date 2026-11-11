// Chữ dùng cho dữ liệu mẫu (scripts/demo/seed-demo.ts): tên, địa chỉ, lời đánh giá, bài cộng đồng, tin tức.
// Mọi người, số điện thoại, địa chỉ ở đây là bịa; email khách mẫu dùng tên miền DEMO_DOMAIN để nhận ra và xoá được.

export const DEMO_DOMAIN = "demo.robotica.vn";

export const LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trịnh", "Lâm", "Mai", "Tạ", "Cao"];
export const MIDDLE_NAMES_M = ["Văn", "Minh", "Quốc", "Đức", "Hoàng", "Gia", "Thanh", "Anh", "Hữu", "Nhật", "Công", "Tuấn", "Bảo", "Đăng"];
export const MIDDLE_NAMES_F = ["Thị", "Ngọc", "Thu", "Minh", "Phương", "Khánh", "Thanh", "Bảo", "Hải", "Mỹ"];
export const FIRST_NAMES_M = ["Huy", "Khoa", "Nam", "Long", "Phúc", "Tùng", "Dũng", "Khánh", "Hiếu", "Quân", "Duy", "Sơn", "Trung", "Đạt", "Thắng", "Vinh", "Tài", "Lộc", "Kiên", "Bình", "Hưng", "Tâm", "Toàn", "Thịnh", "Nhân", "Hải", "Phong", "Tín", "An", "Khang"];
export const FIRST_NAMES_F = ["Linh", "Trang", "Hương", "Mai", "Vy", "Ngân", "Thảo", "Hà", "My", "Nhi", "Quỳnh", "Yến", "Chi", "Hân", "Uyên", "Tiên", "Giang", "Lan"];

// Thành phố và vài đường, phường để ghép địa chỉ. Tỷ trọng gần với nơi khách mua mô hình nhiều.
export const CITIES: { name: string; weight: number; streets: string[]; wards: string[] }[] = [
  {
    name: "TP. Hồ Chí Minh",
    weight: 38,
    streets: ["Nguyễn Trãi", "Lê Văn Sỹ", "Cách Mạng Tháng Tám", "Điện Biên Phủ", "Nguyễn Thị Minh Khai", "Phan Xích Long", "Quang Trung", "Lý Thường Kiệt", "Võ Văn Ngân", "Nguyễn Oanh", "Hoàng Diệu", "Trần Hưng Đạo"],
    wards: ["Phường Bến Thành", "Phường Sài Gòn", "Phường Tân Định", "Phường Bàn Cờ", "Phường Xuân Hoà", "Phường Phú Nhuận", "Phường Gia Định", "Phường Thủ Đức", "Phường Hạnh Thông", "Phường Chợ Lớn"],
  },
  {
    name: "Hà Nội",
    weight: 30,
    streets: ["Cầu Giấy", "Xuân Thuỷ", "Tây Sơn", "Chùa Bộc", "Kim Mã", "Nguyễn Chí Thanh", "Láng Hạ", "Trần Duy Hưng", "Hoàng Quốc Việt", "Phạm Văn Đồng", "Bạch Mai", "Minh Khai"],
    wards: ["Phường Cầu Giấy", "Phường Đống Đa", "Phường Ba Đình", "Phường Láng", "Phường Thanh Xuân", "Phường Hoàn Kiếm", "Phường Hai Bà Trưng", "Phường Nghĩa Đô", "Phường Tây Hồ"],
  },
  { name: "Đà Nẵng", weight: 8, streets: ["Nguyễn Văn Linh", "Lê Duẩn", "Hàm Nghi", "Ngũ Hành Sơn", "Tôn Đức Thắng"], wards: ["Phường Hải Châu", "Phường Thanh Khê", "Phường An Hải", "Phường Hoà Khánh"] },
  { name: "Cần Thơ", weight: 4, streets: ["3 Tháng 2", "Nguyễn Văn Cừ", "Trần Hưng Đạo", "Mậu Thân"], wards: ["Phường Ninh Kiều", "Phường Cái Khế", "Phường An Bình"] },
  { name: "Hải Phòng", weight: 4, streets: ["Lạch Tray", "Văn Cao", "Tô Hiệu", "Lê Hồng Phong"], wards: ["Phường Ngô Quyền", "Phường Lê Chân", "Phường Hải An"] },
  { name: "Đồng Nai", weight: 3, streets: ["Phạm Văn Thuận", "Đồng Khởi", "Võ Thị Sáu"], wards: ["Phường Trấn Biên", "Phường Tam Hiệp", "Phường Long Bình"] },
  { name: "Khánh Hoà", weight: 3, streets: ["Trần Phú", "Lê Thánh Tôn", "23 Tháng 10"], wards: ["Phường Nha Trang", "Phường Bắc Nha Trang", "Phường Tây Nha Trang"] },
  { name: "Huế", weight: 3, streets: ["Hùng Vương", "Lê Lợi", "Nguyễn Huệ"], wards: ["Phường Thuận Hoá", "Phường Phú Xuân", "Phường An Cựu"] },
  { name: "Lâm Đồng", weight: 2, streets: ["Phan Đình Phùng", "Bùi Thị Xuân", "3 Tháng 2"], wards: ["Phường Xuân Hương - Đà Lạt", "Phường Lâm Viên - Đà Lạt"] },
  { name: "Nghệ An", weight: 2, streets: ["Lê Lợi", "Quang Trung", "Nguyễn Văn Cừ"], wards: ["Phường Vinh Phú", "Phường Trường Vinh"] },
  { name: "Quảng Ninh", weight: 2, streets: ["Trần Hưng Đạo", "Hạ Long", "Nguyễn Văn Cừ"], wards: ["Phường Hạ Long", "Phường Bãi Cháy"] },
  { name: "Bắc Ninh", weight: 1, streets: ["Lý Thái Tổ", "Ngô Gia Tự"], wards: ["Phường Kinh Bắc", "Phường Võ Cường"] },
];

export const ORDER_NOTES = [
  "Gọi trước khi giao giúp mình.",
  "Giao giờ hành chính.",
  "Giao sau 18h.",
  "Hàng sưu tầm, đóng gói kỹ giúp mình nhé.",
  "Cho mình xin thêm túi chống sốc.",
  "Gửi bảo vệ toà nhà nếu không gọi được.",
  "Quà sinh nhật, đừng để hoá đơn trong hộp.",
  "Hộp ngoài còn đẹp giúp mình, mình để trưng bày.",
  "Giao cuối tuần.",
];

export const CARRIERS = [
  { name: "Giao Hàng Nhanh", prefix: "GHN" },
  { name: "Giao Hàng Tiết Kiệm", prefix: "GHTK" },
  { name: "Viettel Post", prefix: "VTP" },
  { name: "J&T Express", prefix: "JT" },
];

export const SUPPLIERS = [
  { code: "DEMO-NCC-01", name: "Công ty TNHH Đồ chơi Mô hình Ánh Dương", contact: "Trần Minh Đức", phone: "0283 845 1201", email: `nhaphang@anhduong.${DEMO_DOMAIN}`, address: "45 Nguyễn Văn Trỗi, Phường Phú Nhuận, TP. Hồ Chí Minh", note: "Phân phối Transformers chính hãng. Công nợ 30 ngày." },
  { code: "DEMO-NCC-02", name: "Hobby Link Asia (đại lý Bandai Spirits)", contact: "Lê Thu Hà", phone: "0243 766 2290", email: `sales@hobbylink.${DEMO_DOMAIN}`, address: "12 Trần Duy Hưng, Phường Trung Hoà, Hà Nội", note: "Gunpla, Model Kit. Hàng về theo đợt hằng tháng." },
  { code: "DEMO-NCC-03", name: "Công ty CP Thương mại Kỷ Nguyên Robot", contact: "Phạm Quốc Bảo", phone: "0909 318 552", email: `kho@kynguyen.${DEMO_DOMAIN}`, address: "Lô B3, KCN Tân Bình, TP. Hồ Chí Minh", note: "Super Sentai, Figure nhập Nhật. Đặt trước 45 ngày." },
  { code: "DEMO-NCC-04", name: "Sao Bắc Toys", contact: "Ngô Thanh Tùng", phone: "0912 664 078", email: `donhang@saobac.${DEMO_DOMAIN}`, address: "88 Lạch Tray, Phường Ngô Quyền, Hải Phòng", note: "Hàng tồn giá tốt, cần kiểm hộp khi nhận." },
  { code: "DEMO-NCC-05", name: "Đông Á Collectibles", contact: "Võ Ngọc Yến", phone: "0236 381 9045", email: `info@donga.${DEMO_DOMAIN}`, address: "21 Hàm Nghi, Phường Thanh Khê, Đà Nẵng", note: "Phụ kiện, đế trưng bày, hộp mica." },
];

// Lời đánh giá theo số sao. {p}: tên sản phẩm.
export const REVIEW_TEXTS: Record<number, string[]> = {
  5: [
    "Hàng đẹp y hình, khớp chắc, sơn sắc nét. Đóng gói rất kỹ, hộp không móp chút nào.",
    "{p} quá đẹp, cầm lên mới thấy chi tiết nhiều hơn ảnh. Shop giao nhanh, tư vấn nhiệt tình.",
    "Mua làm quà cho em trai, em thích lắm. Hộp còn nguyên seal, có đủ phụ kiện.",
    "Lần thứ ba mua ở shop, lần nào cũng ưng. {p} biến hình mượt, không bị lỏng khớp.",
    "Xem 3D trên web trước rồi mới mua, nhận hàng đúng như mong đợi. Rất đáng tiền.",
    "Đóng gói 3 lớp chống sốc, giao từ Sài Gòn ra Hà Nội mà hộp vẫn vuông vức. 10 điểm.",
    "Chất nhựa tốt, không có mùi, các khớp giữ dáng tốt. Đặt lên kệ nhìn rất có lực.",
    "Shop gọi xác nhận đơn rất nhanh, 2 ngày là nhận. {p} xứng đáng 5 sao.",
    "Màu sơn đều, không lem. Mình soi kỹ không thấy lỗi nào. Sẽ ủng hộ tiếp.",
    "Cuối cùng cũng săn được {p} giá hợp lý. Hàng chính hãng, có tem.",
  ],
  4: [
    "Hàng đẹp, đúng mô tả. Trừ 1 sao vì giao hơi lâu so với dự kiến.",
    "{p} đẹp, khớp chắc. Hướng dẫn biến hình hơi khó hiểu, phải xem video mới làm được.",
    "Chất lượng tốt so với giá. Hộp ngoài có vết xước nhỏ nhưng mô hình bên trong hoàn hảo.",
    "Mô hình đẹp, chi tiết ổn. Mong shop có thêm đế trưng bày đi kèm.",
    "Ưng ý, nhưng một khớp vai hơi cứng lúc đầu, chơi vài lần thì mượt hơn.",
    "Giao nhanh, đóng gói ổn. Màu thực tế đậm hơn ảnh một chút nhưng vẫn đẹp.",
  ],
  3: [
    "Mô hình ổn, nhưng hộp bị móp một góc khi nhận. Shop có xin lỗi và tặng mã giảm giá.",
    "Chất lượng tạm được so với giá. Vài chỗ sơn chưa thật sắc.",
    "Hàng đúng mẫu nhưng giao chậm gần một tuần.",
  ],
  2: ["Khớp hông bị lỏng, đứng tạo dáng lâu là đổ. Đã nhắn shop hỗ trợ.", "Hộp ngoài rách khá nhiều, mua để sưu tầm nên hơi tiếc."],
  1: ["Nhận hàng thiếu một phụ kiện nhỏ, đang chờ shop gửi bù."],
};

export type CommunityTopic = "chia-se" | "hoi-dap" | "trung-bay" | "cua-hang";

// Bài cộng đồng. {p}: tên một sản phẩm đã gắn vào bài (nếu có).
export const COMMUNITY_POSTS: { topic: CommunityTopic; body: string; product: boolean; image: boolean }[] = [
  { topic: "trung-bay", product: true, image: true, body: "Góc kệ mới dọn lại cuối tuần. {p} đứng giữa là đẹp nhất, ánh đèn LED vàng chiếu vào nhìn rất có hồn. Mọi người góp ý cách xếp giúp mình với!" },
  { topic: "trung-bay", product: true, image: true, body: "Vừa đập hộp {p}. Chi tiết sắc hơn mình nghĩ, khớp chắc, tạo dáng chiến đấu đứng vững không cần đế." },
  { topic: "trung-bay", product: true, image: true, body: "Một năm sưu tầm, cuối cùng cũng có đủ đội hình mình muốn. {p} là con mình thích nhất vì biến hình rất đã tay." },
  { topic: "trung-bay", product: true, image: true, body: "Chụp thử {p} ngoài ban công lúc hoàng hôn. Nền trời cam làm màu sơn nổi hẳn lên." },
  { topic: "trung-bay", product: true, image: true, body: "Dựng diorama nhỏ bằng xốp và bột đá, đặt {p} vào nhìn như đang giữa chiến trường. Mất hai buổi tối nhưng rất vui." },
  { topic: "trung-bay", product: true, image: true, body: "Kệ trưng bày tháng này: thêm {p}. Vợ bảo nhà sắp thành bảo tàng robot rồi 😅" },
  { topic: "trung-bay", product: true, image: true, body: "Lần đầu thử chụp mô hình bằng điện thoại với hộp đèn tự chế. {p} lên ảnh khá ổn, mọi người cho mình xin kinh nghiệm chỉnh ánh sáng nhé." },
  { topic: "trung-bay", product: true, image: true, body: "Dáng đứng kinh điển của {p}. Mình mất 15 phút chỉnh tay chân mới ưng." },
  { topic: "hoi-dap", product: true, image: false, body: "Mọi người cho hỏi {p} biến hình có khó không? Mình mới chơi, sợ làm gãy khớp." },
  { topic: "hoi-dap", product: false, image: false, body: "Nên lau bụi mô hình bằng gì cho an toàn với lớp sơn? Mình đang dùng cọ trang điểm mềm, không biết có ổn không." },
  { topic: "hoi-dap", product: false, image: false, body: "Mô hình để gần cửa sổ có bị bạc màu không mọi người? Phòng mình nắng chiều khá gắt." },
  { topic: "hoi-dap", product: true, image: false, body: "{p} bản này với bản cũ khác nhau chỗ nào vậy? Mình thấy giá chênh khá nhiều." },
  { topic: "hoi-dap", product: false, image: false, body: "Có ai dùng tủ kính IKEA để trưng bày chưa? Kích thước tầm bao nhiêu thì vừa dòng Leader class?" },
  { topic: "hoi-dap", product: false, image: false, body: "Khớp bị lỏng thì xử lý thế nào? Mình nghe nói sơn móng tay trong suốt được, có đúng không?" },
  { topic: "hoi-dap", product: true, image: false, body: "Ai đã mua {p} cho mình xin cảm nhận với. Đang phân vân giữa con này và một mẫu khác cùng tầm giá." },
  { topic: "hoi-dap", product: false, image: false, body: "Gunpla mới lắp lần đầu thì nên mua thêm dụng cụ gì? Kìm cắt, giũa, bút kẻ lằn… mọi người tư vấn giúp." },
  { topic: "chia-se", product: false, image: false, body: "Mẹo nhỏ: giữ lại xốp và túi nilon trong hộp gốc. Sau này muốn bán lại hay chuyển nhà thì hộp đủ đồ sẽ giữ giá hơn nhiều." },
  { topic: "chia-se", product: false, image: false, body: "Chia sẻ cách mình chống bụi cho kệ mở: dán ron cao su quanh cửa kính và đặt gói hút ẩm ở góc. Ba tháng rồi gần như không phải lau." },
  { topic: "chia-se", product: true, image: true, body: "Review nhanh {p} sau một tháng: khớp vẫn chắc, sơn không tróc, biến qua lại chục lần không vấn đề gì. Đáng tiền." },
  { topic: "chia-se", product: false, image: false, body: "Ai mới chơi thì đừng ham biến hình nhanh. Xem kỹ hướng dẫn, khớp nào cứng thì dùng máy sấy tóc hơ nhẹ cho nhựa mềm rồi mới bẻ." },
  { topic: "chia-se", product: true, image: true, body: "Mình thử sơn lại phần đèn mắt của {p} bằng màu trong suốt, lên đèn UV nhìn lung linh hẳn." },
  { topic: "chia-se", product: false, image: false, body: "Ghi chép sưu tầm của mình: dùng một file bảng tính lưu ngày mua, giá, tình trạng hộp. Rất tiện khi muốn đổi hay bán lại." },
  { topic: "chia-se", product: true, image: true, body: "So sánh kích thước: {p} cạnh lon nước ngọt cho mọi người dễ hình dung. To hơn mình tưởng!" },
  { topic: "cua-hang", product: false, image: false, body: "Vừa nhận đơn thứ 5 từ ROBOTICA, lần nào đóng gói cũng kỹ. Mong shop sớm có thêm hàng Super Sentai." },
  { topic: "cua-hang", product: false, image: false, body: "Tính năng xem 3D trên web hay thật, xoay được từng góc nên mua online yên tâm hơn hẳn." },
  { topic: "cua-hang", product: false, image: false, body: "Gacha hôm nay quay được thẻ hiếm, đổi được mã giảm 10%. Ai quay chưa?" },
  { topic: "cua-hang", product: false, image: false, body: "Đề xuất shop thêm phần so sánh kích thước giữa các mẫu, mình hay phân vân không biết con nào to hơn." },
  { topic: "cua-hang", product: false, image: false, body: "Đọc xong chương mới của truyện tranh trên web, các mô hình trên kệ thức dậy ban đêm 😂 dễ thương ghê." },
];

export const COMMENTS = [
  "Đẹp quá bác ơi!",
  "Góc kệ xịn thật, xin info đèn LED với.",
  "Con này mình cũng có, công nhận khớp chắc.",
  "Ảnh chụp có hồn ghê.",
  "Mình cũng đang tính mua, đọc xong càng muốn chốt.",
  "Biến hình lần đầu hơi khó, quen tay là dễ thôi bạn.",
  "Bạn thử dùng cọ mềm với quạt thổi bụi mini, rất tiện.",
  "Không nên để gần nắng nha, nhựa sẽ ngả vàng sau vài tháng.",
  "Hóng bài review chi tiết hơn của bác.",
  "Diorama đẹp quá, có hướng dẫn làm không bạn?",
  "Sơn móng tay trong suốt dùng được nhưng chỉ phết mỏng thôi, dày quá khớp bị dính.",
  "Shop đóng gói kỹ thật, mình cũng nhận hộp vuông vức.",
  "Cho mình hỏi mua ở đợt nào vậy bạn?",
  "Kệ này nhìn muốn sắm theo luôn.",
  "Hay quá, lưu lại để làm theo.",
  "Đồng ý, tính năng 3D giúp mình chọn đúng mẫu.",
  "Tủ IKEA Detolf vừa leader class nhé bạn, cao 160 cm.",
  "Đẹp nhưng ví mình đau quá 😅",
  "Chúc mừng bạn săn được hàng!",
  "Màu sơn bản này đẹp hơn bản cũ nhiều.",
];

// Bài tin tức. {p1}, {p2}, {p3}: tên sản phẩm ghép vào khi sinh dữ liệu.
export const NEWS_POSTS: { title: string; summary: string; body: string }[] = [
  {
    title: "ROBOTICA ra mắt trình xem mô hình 3D cho mọi sản phẩm",
    summary: "Từ nay khách có thể xoay, phóng to và xem biến hình của từng mô hình ngay trên trang sản phẩm trước khi mua.",
    body: "Mua mô hình qua mạng luôn khó ở một điểm: ảnh chụp chỉ cho thấy vài góc. ROBOTICA vừa đưa trình xem 3D vào mọi trang sản phẩm để giải quyết chuyện đó.\n\nTrên trang của {p1}, bạn có thể dùng chuột hoặc ngón tay để xoay mô hình 360 độ, phóng to vào từng chi tiết và với các mẫu hỗ trợ, bấm nút đổi dạng để xem cả quá trình biến hình.\n\nMô hình 3D là minh hoạ do cửa hàng dựng, giúp bạn hình dung kích thước và tạo dáng. Ảnh thật của sản phẩm vẫn nằm ở tab \"Ảnh thật\" ngay bên cạnh.\n\nHãy thử và cho chúng tôi biết cảm nhận ở mục Cộng đồng nhé!",
  },
  {
    title: "Hàng mới về tháng 6: Transformers và Gundam đổ bộ",
    summary: "Đợt hàng tháng 6 có {p1}, {p2} cùng nhiều mẫu được khách hỏi nhiều.",
    body: "Đợt hàng tháng 6 vừa cập bến kho ROBOTICA. Nổi bật nhất là {p1}, mẫu được hỏi nhiều nhất trong ba tháng qua, và {p2} với lớp sơn hoàn thiện rất sắc.\n\nSố lượng mỗi mẫu có hạn. Bạn có thể bấm \"Thông báo khi có hàng\" trên trang sản phẩm để nhận email ngay khi mẫu mình thích về thêm.\n\nToàn bộ hàng đều được kiểm hộp, kiểm phụ kiện trước khi lên kệ.",
  },
  {
    title: "Hướng dẫn bảo quản mô hình robot: 7 điều cần nhớ",
    summary: "Tránh nắng, tránh ẩm, lau bụi đúng cách: những thói quen nhỏ giúp bộ sưu tập giữ được vẻ đẹp nhiều năm.",
    body: "1. Tránh ánh nắng trực tiếp. Tia UV làm nhựa ngả vàng và sơn bạc màu chỉ sau vài tháng.\n\n2. Giữ độ ẩm vừa phải. Khí hậu Việt Nam ẩm, hãy đặt gói hút ẩm trong tủ kính và thay định kỳ.\n\n3. Lau bụi bằng cọ mềm hoặc quạt thổi bụi. Không dùng khăn ướt hay cồn lên bề mặt sơn.\n\n4. Không để mô hình giữ dáng khó quá lâu. Khớp chịu lực liên tục sẽ lỏng dần.\n\n5. Biến hình chậm, đúng thứ tự. Khớp nào cứng, hơ nhẹ bằng máy sấy cho nhựa mềm rồi mới bẻ.\n\n6. Giữ lại hộp và xốp gốc. Hộp đủ đồ giúp mô hình giữ giá khi bạn muốn đổi hoặc bán lại.\n\n7. Ghi chép bộ sưu tập: ngày mua, giá, tình trạng. Vừa dễ quản lý vừa vui khi nhìn lại.",
  },
  {
    title: "Mừng Quốc khánh 2/9: giảm đến 15% toàn bộ Gundam",
    summary: "Từ 30/8 đến 3/9, toàn bộ dòng Gundam giảm đến 15%, miễn phí vận chuyển cho đơn từ 1 triệu đồng.",
    body: "Nhân dịp Quốc khánh 2/9, ROBOTICA giảm giá toàn bộ dòng Gundam từ 30/8 đến hết 3/9.\n\nMức giảm áp dụng trực tiếp trên giá hiển thị, không cần nhập mã. Đơn từ 1 triệu đồng được miễn phí vận chuyển toàn quốc.\n\nMột vài gợi ý trong đợt này: {p1} và {p2}. Số lượng có hạn, đơn đặt trước sẽ được xử lý trước.\n\nChương trình đã kết thúc. Cảm ơn hơn 100 khách hàng đã tham gia!",
  },
  {
    title: "Ra mắt Gacha ROBOTICA: quay thẻ, nhận mã giảm giá",
    summary: "Làm nhiệm vụ nhận xu, dùng xu quay thẻ nhân vật và đổi thẻ trùng lấy mã giảm giá. Tỷ lệ công khai.",
    body: "Gacha là trò chơi nhỏ chúng tôi làm cho cộng đồng sưu tầm. Bạn nhận xu khi làm nhiệm vụ hằng ngày: đăng nhập, đọc truyện tranh, viết đánh giá, đăng bài trưng bày.\n\nDùng xu để quay thẻ nhân vật. Tỷ lệ ra từng độ hiếm được công khai ngay trên trang Gacha. Gacha chỉ quay bằng xu, không bán xu bằng tiền thật.\n\nThẻ trùng có thể đổi thành mảnh và đổi mảnh lấy mã giảm giá dùng khi mua hàng. Chúc bạn may mắn!",
  },
  {
    title: "Phân biệt hàng chính hãng và hàng nhái: kinh nghiệm cho người mới",
    summary: "Tem, hộp, chất nhựa và độ khít khớp là những dấu hiệu đầu tiên giúp bạn nhận ra mô hình chính hãng.",
    body: "Hàng nhái ngày càng tinh vi, nhưng vẫn có vài dấu hiệu dễ nhận ra.\n\nHộp: in sắc nét, chữ không lem, có mã vạch và thông tin nhà sản xuất. Hàng nhái thường in nhoè và màu nhạt hơn.\n\nNhựa: hàng chính hãng không có mùi hắc, bề mặt mịn. Hàng nhái hay có ba via (viền thừa) ở mép.\n\nKhớp: khít, giữ dáng tốt. Hàng nhái thường quá lỏng hoặc quá cứng, dễ gãy khi biến hình.\n\nGiá: một mẫu đang bán 1,5 triệu mà ở đâu đó chỉ 300 nghìn thì gần như chắc chắn là hàng nhái.\n\nMọi sản phẩm tại ROBOTICA đều nhập từ nhà phân phối có hoá đơn. Nếu nghi ngờ, bạn có thể gửi ảnh cho chúng tôi kiểm tra giúp.",
  },
  {
    title: "Hàng mới về tháng 7: thêm Super Sentai cho fan tokusatsu",
    summary: "{p1} và nhiều mẫu robot Super Sentai lần đầu có mặt tại ROBOTICA.",
    body: "Sau nhiều lời đề xuất ở mục Cộng đồng, ROBOTICA đã nhập thêm các mẫu robot Super Sentai.\n\nĐáng chú ý là {p1}, mẫu hợp thể được nhiều fan tokusatsu săn lùng. Bên cạnh đó là {p2} với đầy đủ phụ kiện.\n\nTrên trang sản phẩm, bạn có thể xem mô hình 3D để hình dung kích thước trước khi đặt.",
  },
  {
    title: "Mở trang Truyện tranh: các mô hình trên kệ thức dậy lúc nửa đêm",
    summary: "Truyện ngắn đọc vài phút một chương, mỗi chương đọc xong được tặng xu để quay gacha.",
    body: "Khi cửa cuốn kéo xuống và đèn cửa hàng tắt, các mô hình trên kệ ROBOTICA bắt đầu cựa quậy. Đó là ý tưởng của bộ truyện tranh ngắn vừa ra mắt trên website.\n\nMỗi chương đọc trong vài phút, nhân vật chính là những mẫu robot đang bán tại cửa hàng, trong đó có {p1}.\n\nĐọc xong mỗi chương, bạn nhận xu để quay gacha. Chương mới sẽ ra định kỳ, theo dõi mục Tin tức để không bỏ lỡ.",
  },
  {
    title: "Sale 10/10: giảm 10% cho đơn từ 1 triệu với mã ROBOT10",
    summary: "Nhập mã ROBOT10 khi thanh toán để giảm 10% (tối đa 200.000đ) cho đơn từ 1 triệu đồng.",
    body: "Ngày đôi 10/10 đã đến! Nhập mã ROBOT10 khi thanh toán để được giảm 10%, tối đa 200.000đ, cho đơn hàng từ 1.000.000đ.\n\nMã áp dụng cho mọi sản phẩm còn hàng, kể cả {p1} và {p2}. Không áp dụng chung với mã giảm giá khác.\n\nĐơn đặt trong ngày 10/10 sẽ được xử lý và bàn giao vận chuyển trong vòng 48 giờ.",
  },
  {
    title: "Cách chụp ảnh mô hình đẹp bằng điện thoại",
    summary: "Một hộp đèn tự chế, một tấm nền trơn và vài mẹo bố cục là đủ để có bộ ảnh trưng bày ấn tượng.",
    body: "Bạn không cần máy ảnh đắt tiền để chụp mô hình đẹp.\n\nÁnh sáng: dùng hai nguồn sáng trắng chiếu chéo từ hai bên, phủ một lớp giấy can để ánh sáng dịu lại. Hộp carton khoét lỗ và dán giấy can là đủ làm hộp đèn.\n\nNền: giấy bìa màu trơn uốn cong từ mặt bàn lên tường để không thấy đường gấp.\n\nGóc chụp: hạ thấp điện thoại ngang ngực mô hình để robot trông to lớn, uy lực hơn.\n\nLấy nét: chạm vào mặt mô hình trên màn hình và khoá nét trước khi chụp.\n\nChụp xong, hãy khoe bộ ảnh ở mục Cộng đồng, chủ đề Trưng bày.",
  },
  {
    title: "Ưu đãi 20/10: tặng đế trưng bày cho đơn từ 2 triệu",
    summary: "Từ 18/10 đến 21/10, mỗi đơn từ 2 triệu đồng được tặng một đế trưng bày mica.",
    body: "Mừng ngày Phụ nữ Việt Nam 20/10, ROBOTICA tặng một đế trưng bày mica cho mỗi đơn hàng từ 2.000.000đ đặt từ 18/10 đến hết 21/10.\n\nĐế mica trong suốt giúp mô hình đứng vững ở những dáng khó và giữ kệ gọn gàng.\n\nGợi ý quà tặng: {p1} cho người yêu thích robot cổ điển, hoặc {p2} cho người mới bắt đầu sưu tầm.\n\nChương trình đã kết thúc.",
  },
  {
    title: "Thời gian giao hàng mùa mưa bão miền Trung",
    summary: "Một số đơn đi Huế, Đà Nẵng, Quảng Ngãi có thể chậm 2–3 ngày do ảnh hưởng thời tiết.",
    body: "Do ảnh hưởng của mưa lớn tại các tỉnh miền Trung, đơn vị vận chuyển thông báo thời gian giao hàng tới Huế, Đà Nẵng, Quảng Ngãi có thể chậm thêm 2–3 ngày.\n\nĐơn hàng của bạn vẫn được đóng gói chống nước hai lớp. Bạn có thể theo dõi tình trạng đơn qua trang Tra cứu đơn hàng bằng mã đơn và số điện thoại.\n\nMong quý khách thông cảm và giữ an toàn.",
  },
  {
    title: "Ra mắt Xưởng: tuỳ chỉnh màu và phụ kiện cho mô hình",
    summary: "Chọn phủ màu, thêm đế trưng bày hay hộp mica ngay trên trang sản phẩm, xem trước trên mô hình 3D.",
    body: "Xưởng là tính năng mới cho phép bạn tuỳ chỉnh mô hình trước khi đặt hàng.\n\nTrên trang sản phẩm, kéo xuống mục Xưởng để chọn phủ màu, thêm đế trưng bày hoặc hộp mica. Mọi lựa chọn được xem trước ngay trên mô hình 3D, giá cập nhật theo từng tuỳ chọn.\n\nThử ngay với {p1} để xem bản phối màu riêng của bạn trông như thế nào.",
  },
  {
    title: "Top 5 mô hình bán chạy tháng 10",
    summary: "{p1} tiếp tục dẫn đầu, theo sau là {p2} và {p3}.",
    body: "Tháng 10 là tháng bán chạy nhất từ đầu năm của ROBOTICA, nhờ đợt sale 10/10 và 20/10.\n\nĐứng đầu vẫn là {p1}, mẫu có lượt yêu thích cao nhất trang Trưng bày. Vị trí thứ hai thuộc về {p2}, và {p3} bất ngờ vươn lên vị trí thứ ba.\n\nXem đầy đủ bảng xếp hạng theo lượt bán, lượt yêu thích và điểm đánh giá ở trang Trưng bày.",
  },
  {
    title: "Đặt trước đợt hàng tháng 12: giữ chỗ chỉ với 30% tiền cọc",
    summary: "Một số mẫu hiếm mở đặt trước, cọc 30% để giữ suất, phần còn lại thanh toán khi hàng về.",
    body: "Một số mẫu hiếm về hàng theo đợt sẽ mở đặt trước trên website.\n\nBạn chỉ cần cọc 30% giá trị để giữ suất. Khi hàng về kho, chúng tôi sẽ email thông báo và giao hàng; phần còn lại thanh toán khi nhận.\n\nNếu đợt hàng bị huỷ từ phía nhà sản xuất, tiền cọc được hoàn lại đầy đủ.\n\nDanh sách mẫu mở đặt trước sẽ được cập nhật trên trang sản phẩm với nhãn \"Đặt trước\".",
  },
  {
    title: "Hàng mới về tháng 11: chuẩn bị cho mùa quà Giáng sinh",
    summary: "Đợt hàng cuối năm với {p1}, {p2} và nhiều mẫu phù hợp làm quà tặng.",
    body: "Mùa quà cuối năm đang đến gần. Đợt hàng tháng 11 của ROBOTICA tập trung vào những mẫu đẹp, hộp sang, phù hợp làm quà.\n\n{p1} với hộp in hình nghệ thuật là lựa chọn an toàn cho người mới. Người đã sưu tầm lâu sẽ thích {p2} với độ chi tiết cao.\n\nXem mô hình 3D trên trang sản phẩm để chọn đúng kích thước trước khi đặt.",
  },
];
