// Chữ cho phần dữ liệu mẫu thứ ba (seed-details.ts): mảnh câu ghép thành lời đánh giá theo loại sản phẩm và số sao, hỏi đáp
// có câu trả lời lấy từ thông số của chính sản phẩm, bình luận cộng đồng theo chủ đề bài, bài trưng bày thêm, tin tức.
//
// Chỗ giữ chỗ trong câu (thay bằng thông số sản phẩm; câu nào thiếu dữ liệu thì không được chọn):
//   {name} tên đầy đủ · {short} tên ngắn · {alt} dạng biến hình ("xe đua rally") · {car} dạng biến hình có bánh (xe, mô tô)
//   {frame} "Khung trong" (chỉ kit RG, MG) · {height} chiều cao ("khoảng 14 cm")
//   {klass} phân hạng ("Deluxe Class") · {line} dòng phim · {acc} phụ kiện đầu tiên · {members} thành viên hợp thể
//   {count} số thành viên · {grade} cấp độ kit ("HG") · {scale} tỉ lệ · {build} thời gian lắp · {merge} kiểu hợp thể Sentai
//   {for} mẫu dùng phụ kiện · {length} chiều dài phụ kiện · {mount} kiểu gắn · {maker} hãng · {age} độ tuổi · {role} vai trò hợp thể
//   {days} số ngày giao · {city} nơi nhận

export type Kind = "tf" | "combiner" | "kit" | "sentai" | "figure" | "acc";

export const OPENERS: Record<number, string[]> = {
  5: ["Rất ưng ý!", "Quá đẹp luôn.", "Hàng chuẩn, đáng tiền.", "Mê thật sự.", "Ưng cái bụng.", "Đẹp hơn mong đợi.", "Chất lượng tuyệt vời.", "Không chê được điểm nào.", "Xuất sắc!", "Mở hộp là mê."],
  4: ["Khá ưng.", "Hàng đẹp, có vài điểm nhỏ.", "Tổng thể ổn.", "Đáng tiền, trừ chút xíu.", "Hài lòng.", "Gần như hoàn hảo."],
  3: ["Tạm ổn.", "Bình thường.", "Được nhưng chưa như kỳ vọng.", "Ổn so với giá, chưa xuất sắc."],
  2: ["Hơi thất vọng.", "Chưa hài lòng lắm."],
  1: ["Không hài lòng.", "Lần này khá tệ."],
};

// Nhận xét về chính mô hình, theo loại. good: 4–5 sao; mixed: điểm trừ nhẹ (3–4 sao); bad: 1–2 sao.
export const ASPECTS: Record<Kind, { good: string[]; mixed: string[]; bad: string[] }> = {
  tf: {
    good: [
      "Biến hình sang {alt} khá mượt, lần đầu mất tầm 15 phút, lần sau chỉ 5 phút.",
      "Dạng {alt} khít, không hở như mấy bản cũ mình từng chơi.",
      "Cầm chắc tay, nhựa dày, sơn sắc ở mặt và ngực.",
      "Đứng cạnh mấy con {klass} khác trên kệ rất đồng bộ.",
      "Cao {height}, nhìn ngoài to hơn mình nghĩ.",
      "Khớp vai và hông giữ dáng tốt, tạo dáng chiến đấu đứng vững không cần đế.",
      "Chi tiết khuôn mặt sắc nét, mắt sơn đều, đúng chất {line}.",
      "Biến qua lại chục lần vẫn chưa thấy lỏng khớp nào.",
      "Màu sơn giống bản hoạt hình, nhìn rất hoài niệm.",
      "{acc} cầm vừa tay, gắn vào không bị lỏng.",
      "Các tab khoá ở dạng {alt} ăn khớp, cầm lên không bị bung.",
      "{short} là nhân vật mình thích nhất từ hồi nhỏ, cầm bản này trên tay thấy rất đã.",
      "Tỉ lệ cân đối, dạng robot nhìn đúng như phim.",
      "Bánh xe lăn được, để dạng {car} trên bàn làm việc rất vui mắt.",
    ],
    mixed: [
      "Một vài bước biến hình hơi chặt, phải xem video mới làm được.",
      "Khớp hông hơi lỏng so với các khớp khác.",
      "Có vài chỗ sơn chưa thật sắc ở phần chân.",
      "Dạng {alt} hơi hở ở phần lưng, nhìn kỹ mới thấy.",
      "Sách hướng dẫn in hơi nhỏ, nhiều bước khó nhìn.",
      "Lần đầu biến hình mình phải mất gần nửa tiếng.",
    ],
    bad: [
      "Khớp vai bị lỏng ngay từ lúc mở hộp, tạo dáng là rũ tay.",
      "Một tab ở chân bị gãy khi biến hình lần đầu dù mình làm rất nhẹ tay.",
      "Sơn ở mặt bị lem, nhìn gần khá xấu.",
    ],
  },
  combiner: {
    good: [
      "Bộ {count} con hợp thể ra {short} cao {height}, đứng trên kệ rất uy.",
      "Từng thành viên chơi riêng cũng đẹp, gom lại hợp thể càng đã.",
      "Các chốt hợp thể ăn khớp, ráp xong cầm lên không bị rời tay chân.",
      "Lần hợp thể đầu tiên mất khoảng 30 phút, vui như hồi bé.",
      "Hộp to, các thành viên xếp riêng từng ngăn, rất gọn gàng.",
      "Đủ cả {members}, không thiếu con nào.",
      "Dạng hợp thể đứng vững, tay cầm vũ khí được luôn.",
      "Giá cả bộ rẻ hơn mua lẻ từng con khá nhiều.",
    ],
    mixed: [
      "Khớp nối tay hơi lỏng nếu để dạng hợp thể lâu ngày.",
      "Dạng hợp thể hơi nặng phần trên, phải dang chân rộng mới đứng vững.",
      "Vài thành viên biến hình khá đơn giản so với giá.",
    ],
    bad: ["Một chốt hợp thể bị gãy ngay lần ráp đầu.", "Thiếu một bàn tay hợp thể, đang chờ shop đổi."],
  },
  kit: {
    good: [
      "Kit {grade} {scale} lắp sướng tay, mình mất khoảng {build}.",
      "Khuôn nhựa sắc, ít ba via, chỉ cần kìm cắt và dao gọt là đủ.",
      "Màu nhựa tách sẵn khá chuẩn, không sơn vẫn đẹp.",
      "Khớp linh hoạt, tạo được nhiều tư thế.",
      "Lắp xong cao {height}, đứng cạnh các bộ cùng tỉ lệ {scale} rất đẹp.",
      "Sách hướng dẫn rõ ràng, người mới như mình làm theo không bị rối.",
      "Dán sticker xong nhìn khác hẳn.",
      "Không cần keo, bấm khớp là chắc.",
      "{frame} chi tiết, lắp đến đâu thích đến đó.",
    ],
    mixed: ["Sticker hơi khó dán ở mấy góc cong.", "Một vài khớp nhỏ hơi chặt, phải gọt bớt.", "Chân hơi lỏng sau khi lắp, phải siết lại."],
    bad: ["Thiếu một runner nhỏ trong hộp, đã báo shop.", "Một chi tiết bị nứt ngay trên runner."],
  },
  sentai: {
    good: [
      "Hợp thể {merge} đúng như phim, nhìn rất hoài niệm.",
      "Cao {height}, sơn đẹp, chi tiết sắc.",
      "Fan {line} như mình mua về là ưng liền.",
      "{acc} làm khá chi tiết, cầm vừa tay.",
      "Nhựa chắc, cầm nặng tay, đúng hàng {maker}.",
      "Đặt lên kệ cạnh mấy con robot khác vẫn nổi bật nhờ màu sắc.",
    ],
    mixed: ["Khớp hơi ít, tạo dáng hạn chế.", "Màu sơn hơi đậm hơn bản trong phim."],
    bad: ["Một tay bị lỏng, cầm vũ khí là rơi."],
  },
  figure: {
    good: [
      "Mô hình hoàn thiện sẵn, mở hộp là trưng bày được ngay.",
      "Sơn ánh kim rất đẹp, lên đèn càng lung linh.",
      "{acc} đi kèm đầy đủ, tạo dáng dễ.",
      "Cao {height}, chi tiết sắc nét từng mảnh giáp.",
      "Khớp chắc, giữ dáng tốt.",
    ],
    mixed: ["Hơi nhiều chi tiết nhỏ, lắp phụ kiện cần cẩn thận.", "Khớp cổ tay hơi lỏng."],
    bad: ["Một mảnh giáp bị bong sơn khi mở hộp."],
  },
  acc: {
    good: [
      "Gắn vừa khít {for}, chốt chắc, không lỏng.",
      "Dài {length}, cầm trên tay mẫu gốc nhìn cân đối.",
      "Nhựa tốt, màu khớp với mẫu gốc.",
      "Rẻ mà làm mẫu gốc nhìn ngầu hẳn.",
      "Chi tiết nhỏ nhưng làm sắc nét.",
    ],
    mixed: ["Chốt gắn hơi chặt lúc đầu.", "Màu hơi nhạt so với mẫu gốc."],
    bad: ["Chốt gắn bị lỏng, cầm một lúc là rơi."],
  },
};

export const SERVICE: { good: string[]; mixed: string[]; bad: string[] } = {
  good: [
    "Đặt hàng {days} là nhận, hộp vuông vức.",
    "Đóng gói 3 lớp chống sốc rất kỹ.",
    "Shop gọi xác nhận đơn nhanh, tư vấn nhiệt tình.",
    "Giao ra {city} mà hộp không móp chút nào.",
    "Shipper gọi trước khi giao, thân thiện.",
    "Hàng có tem chính hãng, đầy đủ hoá đơn.",
    "Nhắn hỏi shop buổi tối vẫn được trả lời nhanh.",
    "Giao {days}, nhanh hơn mình nghĩ.",
    "Hộp được bọc màng co, mở ra còn mới tinh.",
    "Thùng carton ngoài chèn xốp kín, lắc không nghe tiếng động.",
    "Nhận hàng ở {city}, mọi thứ nguyên vẹn.",
    "Shop gửi kèm tờ hướng dẫn bảo quản, rất chu đáo.",
    "Mã vận đơn cập nhật đầy đủ, theo dõi dễ.",
    "Đơn có chút trục trặc địa chỉ nhưng shop gọi lại xử lý ngay.",
    "Đặt sáng, chiều đã thấy bàn giao vận chuyển.",
  ],
  mixed: ["Giao hơi lâu, mất {days}.", "Hộp ngoài có vết móp nhỏ ở góc.", "Đóng gói ổn nhưng hơi ít xốp."],
  bad: ["Hộp bị móp một góc khi nhận.", "Giao trễ gần một tuần so với dự kiến.", "Shop có phản hồi nhưng hơi chậm."],
};

export const CONTEXTS: string[] = [
  "Mua tặng em trai dịp sinh nhật, bé thích lắm.",
  "Đây là con thứ {n} trong bộ sưu tập của mình.",
  "Lần đầu mua mô hình online, khá yên tâm nhờ xem 3D trước.",
  "Mua làm quà cho người yêu, bạn ấy ưng lắm.",
  "Săn mẫu này lâu rồi, giờ mới chốt được.",
  "Xem bản 3D trên web rồi mới mua, thực tế giống y như vậy.",
  "Đặt buổi tối, sáng hôm sau shop đã gọi xác nhận.",
  "Mua cùng bạn thân, mỗi đứa một con.",
  "Hồi nhỏ xem phim mê lắm, giờ mới tự mua được.",
  "Mua để trưng bàn làm việc, đồng nghiệp hỏi suốt.",
  "Canh đợt giảm giá mới chốt, rất hời.",
  "Đọc đánh giá của mọi người rồi mới quyết, không thất vọng.",
];

export const CLOSERS: Record<number, string[]> = {
  5: ["Sẽ ủng hộ shop dài dài.", "Recommend cho anh em mới chơi.", "Chắc chắn sẽ mua thêm.", "Rất đáng tiền.", "Cảm ơn shop!", "5 sao xứng đáng."],
  4: ["Vẫn sẽ ủng hộ shop.", "Nhìn chung đáng mua.", "Mong shop chèn thêm xốp lần sau."],
  3: ["Hy vọng lần sau tốt hơn.", "Tạm chấp nhận được."],
  2: ["Mong shop kiểm hàng kỹ hơn.", "Đã nhắn shop, đang chờ phản hồi."],
  1: ["Đã nhắn shop, đang chờ đổi hàng.", "Mong shop kiểm tra hàng trước khi gửi."],
};

// Câu về tuỳ chọn Xưởng của dòng đơn (khoá theo nhóm và lựa chọn trong src/lib/workshop.ts).
export const WORKSHOP_LINES: Record<string, string> = {
  paint: "Dịch vụ sơn lại màu {paint} của xưởng làm kỹ, lớp sơn mịn, không lem.",
  finish: "Lớp phủ {finish} lên đèn nhìn rất sang.",
  stand: "Đế lục giác giữ dáng chắc, khắc tên mẫu nhìn chuyên nghiệp.",
  "stand-led": "Đế lục giác có đèn LED bật lên buổi tối đẹp mê.",
  led: "Đèn LED mắt và ngực sáng đều, công tắc giấu dưới chân rất tinh tế.",
  assembly: "Nhờ xưởng lắp hộ, ráp gọn gàng, đỡ mất mấy buổi tối tự lắp.",
  "assembly-panel": "Xưởng lắp, kẻ chỉ và phủ mờ rất kỹ, nhìn như hàng trưng bày.",
  decal: "Decal tên riêng \"{text}\" in sắc nét, dán ở vai rất đẹp.",
  gift: "Hộp quà đỏ của shop rất đẹp, người nhận ai cũng khen.",
};

// ---------------------------------------------------------------------------------------------------------
// Hỏi đáp theo loại sản phẩm. Câu trả lời của cửa hàng lấy số liệu từ thông số sản phẩm; `buyer` là câu trả lời của
// khách đã mua (chỉ cho câu hỏi về trải nghiệm).

export type QaTemplate = { q: string; staff: string; buyer?: string };

export const QA: Record<Kind | "any", QaTemplate[]> = {
  tf: [
    { q: "{short} biến hình có khó không shop? Mình mới chơi lần đầu.", staff: "Dạ {short} biến hình giữa robot và {alt}, độ khó vừa phải ạ. Lần đầu bạn mất khoảng 10–15 phút, trong hộp có sách hướng dẫn từng bước.", buyer: "Mình mới chơi cũng biến được, quen tay lần sau chỉ 3–4 phút." },
    { q: "Mẫu này cao khoảng bao nhiêu ạ?", staff: "Dạ theo thông số nhà sản xuất, {short} cao {height}, thuộc phân hạng {klass} ạ.", buyer: "Mình đo được đúng tầm đó, đứng cạnh mấy con {klass} khác vừa đẹp." },
    { q: "{short} có đi kèm vũ khí không shop?", staff: "Dạ có ạ, mẫu này đi kèm {acc}. Bạn xem đầy đủ ở mục Trong hộp có gì trên trang sản phẩm nhé." },
    { q: "Con này hợp thể được không ạ?", staff: "Dạ {short} là {role}. Muốn hợp thể đầy đủ bạn cần gom đủ các thành viên còn lại của nhóm ạ.", buyer: "Mình gom đủ bộ rồi, hợp thể lên rất đã, nên gom nha bạn." },
    { q: "Hàng của hãng nào vậy shop? Có phải hàng nhái không?", staff: "Dạ hàng do {maker} sản xuất, chính hãng, có tem và hoá đơn nhập từ nhà phân phối ạ." },
    { q: "Bé nhà mình 7 tuổi chơi được không shop?", staff: "Dạ nhà sản xuất khuyến nghị {age}. Bé nhỏ hơn nên có người lớn hướng dẫn lúc biến hình để tránh bẻ ngược khớp ạ.", buyer: "Con mình 8 tuổi, bố con chơi cùng vài lần là bé tự biến được." },
    { q: "Dạng {car} có lăn bánh được không ạ?", staff: "Dạ ở dạng {car} các bánh xe lăn được trên mặt phẳng ạ.", buyer: "Lăn được nha, con mình đẩy chạy khắp nhà 😄" },
    { q: "Dạng {alt} có đứng vững trên kệ không shop?", staff: "Dạ dạng {alt} khoá chắc bằng các tab, đặt trên kệ ổn định ạ. Ảnh thật của dạng này bạn xem ở tab Ảnh thật nhé." },
    { q: "{klass} với Voyager khác nhau thế nào vậy shop?", staff: "Dạ phân hạng là cỡ của mô hình: Deluxe khoảng 13–14 cm, Voyager khoảng 18 cm, Leader trên 20 cm ạ. {short} thuộc {klass}, cao {height}." },
  ],
  combiner: [
    { q: "Bộ này có đủ {count} con không shop hay phải mua lẻ?", staff: "Dạ bộ bán theo set {count} thành viên: {members}. Mua một lần là hợp thể được luôn ạ.", buyer: "Mình nhận đủ {count} con trong một hộp lớn, xếp rất gọn." },
    { q: "Hợp thể xong cao bao nhiêu vậy ạ?", staff: "Dạ dạng hợp thể của {short} cao {height} theo thông số nhà sản xuất ạ.", buyer: "Cao thật, kệ của mình phải nâng tầng lên mới vừa." },
    { q: "Hợp thể có chắc không, có bị rơi tay chân không shop?", staff: "Dạ các khớp nối dùng chốt khoá nên đứng trưng bày ổn định ạ. Lần đầu bạn nên làm theo hướng dẫn để chốt vào đúng vị trí.", buyer: "Lúc đầu hơi chặt, sau vài lần thì vào khớp ngọt, không rơi." },
    { q: "Từng con có biến hình riêng được không ạ?", staff: "Dạ mỗi thành viên đều biến hình riêng giữa robot và xe/thú như bản phim, sau đó mới ghép lại thành {short} ạ." },
  ],
  kit: [
    { q: "Kit này có cần keo không shop?", staff: "Dạ không cần keo ạ, các bộ {grade} lắp bằng khớp bấm. Bạn chỉ cần kìm cắt và dao gọt để làm sạch ba via.", buyer: "Mình chỉ dùng kìm cắt với dao gọt, không cần keo." },
    { q: "Người mới chơi lắp {grade} {scale} có khó không ạ?", staff: "Dạ {grade} {scale} {difficulty}", buyer: "Mình lắp bộ đầu tiên mất {build}, làm theo sách là được." },
    { q: "Lắp xong cao khoảng bao nhiêu shop?", staff: "Dạ {short} tỉ lệ {scale}, lắp xong cao {height} ạ." },
    { q: "Shop có nhận lắp hộ không ạ?", staff: "Dạ có ạ. Trong trang Xưởng của sản phẩm bạn chọn Lắp ráp hộ: lắp hoàn chỉnh 300.000đ, lắp kèm kẻ chỉ và phủ mờ 550.000đ, xưởng làm thêm khoảng 4 ngày." },
    { q: "Trong hộp có sticker không shop?", staff: "Dạ có tờ sticker dán theo bộ kit và sách hướng dẫn lắp ạ. Danh sách đầy đủ bạn xem mục Trong hộp có gì nhé." },
  ],
  sentai: [
    { q: "Mẫu này có hợp thể được không ạ?", staff: "Dạ {short} hợp thể {merge} như trong phim ạ.", buyer: "Hợp thể vui lắm, giống y hồi xem phim." },
    { q: "Cao khoảng bao nhiêu vậy shop?", staff: "Dạ {short} cao {height} ạ." },
    { q: "Có kèm vũ khí không ạ?", staff: "Dạ mẫu này đi kèm {acc} ạ." },
  ],
  figure: [
    { q: "Đây là mô hình lắp ráp hay hoàn thiện sẵn vậy shop?", staff: "Dạ đây là mô hình hoàn thiện sẵn, mở hộp là trưng bày được, không cần lắp ráp ạ." },
    { q: "Có kèm đế trưng bày không ạ?", staff: "Dạ mẫu này đi kèm {acc} ạ." },
  ],
  acc: [
    { q: "Phụ kiện này gắn được cho mẫu nào ạ?", staff: "Dạ dùng cho {for}, kiểu gắn {mount} ạ.", buyer: "Mình gắn cho mẫu đó vừa khít luôn." },
    { q: "Dài khoảng bao nhiêu vậy shop?", staff: "Dạ dài {length} ạ." },
  ],
  any: [
    { q: "Shop giao ra {city} mất mấy ngày ạ?", staff: "Dạ nội thành Hà Nội và TP. Hồ Chí Minh thường 1–3 ngày, các tỉnh khác 3–5 ngày ạ." },
    { q: "Phí ship bao nhiêu vậy shop?", staff: "Dạ phí giao 30.000đ toàn quốc, đơn từ 1.000.000đ được miễn phí vận chuyển ạ." },
    { q: "Sản phẩm bảo hành thế nào ạ?", staff: "Dạ bảo hành 12 tháng với lỗi khớp, gãy chi tiết do nhà sản xuất; đổi trả trong 7 ngày nếu hàng lỗi hoặc giao sai ạ." },
    { q: "Hộp ngoài có bị móp khi giao không? Mình mua để sưu tầm.", staff: "Dạ shop đóng 3 lớp: hộp gốc bọc màng, xốp chống sốc và thùng carton ngoài. Nếu hộp móp khi nhận, bạn chụp ảnh gửi shop để được hỗ trợ ạ.", buyer: "Mình nhận hộp vuông vức, không trầy." },
    { q: "Có thanh toán khi nhận hàng không shop?", staff: "Dạ có ạ, shop nhận COD, chuyển khoản và VNPay. Đơn COD từ 2.000.000đ cần xác nhận email trước khi đặt." },
  ],
};

// Câu hỏi về gói quà chỉ hợp với sản phẩm có Xưởng (không phải phụ kiện).
export const QA_GIFT: QaTemplate = { q: "Có gói quà không shop?", staff: "Dạ có ạ. Trong trang Xưởng của sản phẩm bạn chọn Hộp quà (40.000đ): hộp cứng màu đỏ, giấy rơm và thiệp." };

export const KIT_DIFFICULTY: Record<string, string> = {
  HG: "dễ, phù hợp người mới, mất khoảng 3–4 giờ ạ.",
  RG: "nhiều chi tiết nhỏ và khung trong, bạn nên lắp vài bộ HG trước cho quen tay ạ.",
  MG: "có khung trong đầy đủ, chi tiết nhiều, thường mất vài buổi tối nhưng sách hướng dẫn rất rõ ạ.",
};
export const KIT_BUILD: Record<string, string> = { HG: "3–4 tiếng", RG: "hai buổi tối", MG: "gần một tuần, mỗi tối vài tiếng" };

// ---------------------------------------------------------------------------------------------------------
// Cộng đồng: bài trưng bày thêm (thay cho bài trùng nội dung), bình luận theo chủ đề và theo từng bài hỏi đáp.

export const EXTRA_DISPLAY_POSTS: string[] = [
  "Cuối cùng cũng có chỗ cho {p} trên kệ tầng 2. Đèn trắng hơi gắt, mọi người thấy nên đổi sang đèn vàng không?",
  "Thử tạo dáng {p} đang lao tới, mất cả buổi chỉnh khớp tay. Thấy cũng đáng!",
  "Kệ góc phòng làm việc, mỗi lần căng thẳng nhìn {p} là thấy đỡ hẳn 😄",
  "Nền giấy đen, đèn hắt từ dưới lên, {p} nhìn ngầu như poster phim.",
  "Mua thêm tủ kính nhỏ cho {p}, đỡ phải lau bụi mỗi tuần.",
  "Bộ sưu tập năm nay có thêm {p}. Mục tiêu năm sau là gom đủ một đội hợp thể.",
  "Đem {p} ra công viên chụp, mấy bạn nhỏ chạy lại hỏi mua ở đâu 😂",
  "Chụp cận mặt {p}, chi tiết sơn ở mắt sắc quá.",
  "So dáng {p} ở hai chế độ, các bác thích dạng nào hơn?",
  "Lần đầu thử chụp phơi sáng với đèn pin, {p} như đang phát sáng.",
  "Xếp lại kệ theo phe, {p} đứng giữa làm trọng tài.",
  "Làm mini diorama bãi phế liệu cho {p}, dùng ống hút và giấy bạc làm đạo cụ.",
  "{p} đứng canh bàn làm việc của mình từ hôm qua, đồng nghiệp ai cũng xin chụp ảnh.",
  "Ảnh trước và sau khi dán sticker cho {p}. Khác biệt rõ rệt!",
  "Góc kệ mới với {p}, dùng đế mica trong để giữ dáng bay.",
  "Thử đèn LED dải dưới kệ, {p} nổi bật hẳn lên lúc tối.",
  "Chụp {p} cạnh mô hình thành phố mini, tỉ lệ khá hợp.",
  "Sáng chủ nhật pha cà phê, ngắm {p} trên kệ là đủ vui.",
  "Ảnh gia đình robot: {p} cùng mấy anh em đã gom trong năm nay.",
  "In thêm phông nền phim hoạt hình cho {p}, nhìn rất hoài niệm.",
];

// Bài trưng bày gắn với phụ kiện (súng, pháo tay): nói về việc gắn cho mẫu gốc thay vì tạo dáng.
export const ACCESSORY_DISPLAY_POSTS: string[] = [
  "Gắn thử {p} cho mẫu gốc, nhìn ngầu hẳn lên.",
  "Mua thêm {p} cho đủ bộ, chụp cận chi tiết cho mọi người xem.",
  "{p} nhỏ mà chi tiết sắc ghê, gắn vào là mẫu gốc khác hẳn.",
  "Ai đang phân vân {p} thì xem ảnh này nhé, gắn vừa khít.",
];

// Bình luận chung cho bài trưng bày (bài nào cũng hợp).
export const DISPLAY_COMMENTS: string[] = [
  "Góc chụp xịn thật.",
  "Con {p} này mình cũng có, công nhận giữ dáng tốt.",
  "Dáng này ngầu quá!",
  "Bạn chụp bằng điện thoại gì vậy?",
  "Nhìn xong muốn sắm thêm một con.",
  "Ảnh có chiều sâu ghê.",
  "Hóng ảnh đủ đội hình.",
  "Tạo dáng có hồn quá.",
  "Ảnh này để làm hình nền được luôn.",
  "Đẹp, nhưng nhớ để tránh nắng nha bạn.",
  "Mình cũng đang gom con này, nhìn ảnh càng muốn chốt.",
  "Chi tiết sơn nhìn rõ ghê.",
];

// Bình luận chỉ hợp khi bài nhắc tới đúng thứ đó (diorama, đèn, kệ/tủ, phông nền).
export const DISPLAY_KEYWORD_COMMENTS: { keys: string[]; comments: string[] }[] = [
  { keys: ["diorama"], comments: ["Diorama công phu ghê, bạn làm mất bao lâu?", "Ống hút với giấy bạc mà thành bãi phế liệu, sáng tạo thật."] },
  { keys: ["đèn", "LED"], comments: ["Đèn vàng nhìn ấm hơn đó bạn.", "Đèn LED dải mua ở đâu vậy bạn?", "Bác cho xin thông số đèn với."] },
  { keys: ["kệ", "tủ kính"], comments: ["Kệ đẹp quá, cho mình xin link tủ với.", "Kệ gọn mà vẫn đủ chỗ, khéo thật.", "Tủ kính nhìn sạch sẽ ghê, bạn lau bằng gì vậy?"] },
  { keys: ["nền", "phông"], comments: ["Phông nền đẹp, xin cách làm với.", "Nền đen hợp với con này thật."] },
];

export const SHARE_COMMENTS: string[] = [
  "Mẹo hay, lưu lại!",
  "Cảm ơn bạn đã chia sẻ.",
  "Mình làm y vậy, hiệu quả thật.",
  "Thêm một mẹo: để gói hút ẩm trong hộp cất mô hình.",
  "Ước gì biết mẹo này sớm hơn.",
  "Hữu ích quá, share cho nhóm sưu tầm của mình.",
  "Máy sấy để chế độ ấm thôi nha, nóng quá dễ cong nhựa.",
  "Bài viết có tâm, cảm ơn bạn.",
  "Mình bổ sung: nên giữ cả túi nilon gốc, bán lại được giá hơn.",
  "Đúng là tiền nào của nấy, hàng chính hãng bền thật.",
  "Ghi chép bộ sưu tập kiểu này hay ghê, mình làm theo.",
  "Thử rồi, ổn áp.",
];

export const SHOP_COMMENTS: string[] = [
  "Đồng ý, shop đóng gói kỹ thật.",
  "Mình cũng vừa nhận đơn, hộp vuông vức.",
  "Tính năng 3D giúp mình chọn đúng mẫu, đỡ mua nhầm.",
  "+1 mong shop có thêm hàng Super Sentai.",
  "Mình quay gacha mãi chưa ra thẻ hiếm 😭",
  "Truyện tranh chương mới dễ thương ghê.",
  "Shop có trang So sánh rồi đó bạn, chọn vài mẫu là xem được kích thước cạnh nhau.",
  "Nhân viên tư vấn qua chat nhiệt tình lắm.",
  "Flash sale lần trước mình săn được một con, giá hời.",
  "Mua combo được giảm thêm, đáng lắm.",
];

// Câu trả lời cho từng bài hỏi đáp mẫu (khoá là đoạn đầu nội dung bài trong content.ts).
export const QUESTION_POST_ANSWERS: { starts: string; answers: string[] }[] = [
  {
    starts: "Nên lau bụi mô hình bằng gì",
    answers: [
      "Cọ trang điểm mềm là ổn rồi bạn, nhớ quét nhẹ theo một chiều.",
      "Mình dùng quả bóp thổi bụi máy ảnh, không chạm vào sơn nên yên tâm.",
      "Khăn microfiber khô cũng được, tránh khăn ướt và cồn.",
      "Cho vào tủ kính là đỡ lau hẳn bạn ạ.",
      "Bụi bám lâu thì dùng cọ vẽ màu nước lông mềm, rất nhẹ tay.",
    ],
  },
  {
    starts: "Mô hình để gần cửa sổ",
    answers: [
      "Có đấy bạn, nắng chiều vài tháng là nhựa trắng ngả vàng.",
      "Bạn dán phim chống UV lên kính cửa sổ là đỡ nhiều.",
      "Kéo rèm mỏng vào buổi chiều là được.",
      "Mình từng để gần cửa sổ, nửa năm sau phần màu đỏ nhạt hẳn.",
    ],
  },
  {
    starts: "Có ai dùng tủ kính IKEA",
    answers: [
      "Tủ Detolf cao 160 cm, mỗi tầng tầm 35 cm, để Leader class thoải mái.",
      "Mình dùng Detolf, nên mua thêm kính tầng để chia nhỏ.",
      "Gắn thêm đèn LED trên trần tủ nhìn sang hẳn.",
    ],
  },
  {
    starts: "Khớp bị lỏng thì xử lý",
    answers: [
      "Sơn móng tay trong suốt quét thật mỏng vào chốt, để khô rồi lắp lại.",
      "Đừng phết dày quá, khô rồi khớp bị dính cứng luôn.",
      "Còn bảo hành thì nhắn shop đổi linh kiện cho nhanh.",
      "Quấn một vòng băng keo Teflon mỏng cũng được nè.",
    ],
  },
  {
    starts: "Gunpla mới lắp lần đầu",
    answers: [
      "Kìm cắt một lưỡi là quan trọng nhất, mua loại tốt chút.",
      "Thêm dao gọt và giũa mịn để làm sạch ba via.",
      "Bút kẻ lằn giúp nhìn chi tiết hơn hẳn.",
      "Người mới nên bắt đầu từ HG, đừng nhảy MG ngay.",
    ],
  },
  {
    starts: "Mọi người cho hỏi",
    answers: [
      "Lần đầu mất tầm 15 phút, cứ làm chậm theo hướng dẫn là được.",
      "Không khó đâu bạn, khó nhất là bước gập vai.",
      "Mình vừa xem video vừa làm, dễ hơn hẳn.",
    ],
  },
  {
    starts: "Ai đã mua",
    answers: [
      "Mình mua rồi, khớp chắc, sơn đẹp, rất đáng tiền.",
      "Đáng mua bạn ạ, chơi một tháng vẫn chắc tay.",
      "Cân nhắc kích thước kệ nhé, con này to hơn mình nghĩ.",
    ],
  },
  {
    starts: "bản này với bản cũ",
    answers: ["Bản mới nhiều khớp hơn và sơn chi tiết hơn bạn ạ.", "Khuôn mới nên biến hình hợp lý hơn, bản cũ hở nhiều.", "Theo mình bản mới đáng tiền hơn."],
  },
];

// Bài cộng đồng nhắc tới "biến hình" nhưng gắn với sản phẩm không biến hình (kit, phụ kiện...): viết lại theo loại.
export const KIND_QUESTION_POSTS: Partial<Record<Kind, { body: string; answers: string[] }>> = {
  kit: {
    body: "Mọi người cho hỏi {p} lắp mất bao lâu? Mình mới chơi lần đầu.",
    answers: ["Tầm 3–4 tiếng nếu là HG, cứ làm từ từ.", "Mình lắp mất hai buổi tối, gọt ba via kỹ nên hơi lâu.", "Nhớ cắt cách chi tiết một chút rồi mới gọt sát, đỡ bị trắng nhựa."],
  },
  acc: {
    body: "Mọi người cho hỏi {p} gắn vào có chắc không?",
    answers: ["Chốt gắn chặt lắm bạn, không lo rơi.", "Gắn vừa khít, mình tháo ra lắp vào nhiều lần vẫn chắc.", "Lần đầu hơi chặt, ấn mạnh tay một chút là vào."],
  },
  sentai: {
    body: "Mọi người cho hỏi {p} hợp thể có khó không?",
    answers: ["Không khó đâu bạn, làm theo sách là được.", "Lần đầu mất tầm 20 phút, sau thì nhanh.", "Khớp hơi chặt lúc đầu, chơi vài lần là ngọt."],
  },
  figure: {
    body: "Mọi người cho hỏi {p} có cần lắp gì không hay mở hộp là trưng bày được?",
    answers: ["Mở hộp là trưng bày được luôn bạn ạ.", "Chỉ cần gắn phụ kiện với đế thôi, không phải lắp ráp.", "Mình mua rồi, hàng hoàn thiện sẵn, rất tiện."],
  },
};
export const NO_TRANSFORM_REVIEW_POSTS: Record<"kit" | "acc" | "other", string> = {
  kit: "Review nhanh {p} sau một tháng: khớp vẫn chắc, nhựa không ố, tạo dáng nhiều lần vẫn ổn. Đáng tiền.",
  acc: "Review nhanh {p} sau một tháng: gắn tháo nhiều lần chốt vẫn chặt, màu không phai. Đáng tiền.",
  other: "Review nhanh {p} sau một tháng: khớp vẫn chắc, sơn không tróc, tạo dáng nhiều lần vẫn ổn. Đáng tiền.",
};
export const ACCESSORY_PAINT_POST = "Mình thử kẻ chỉ cho {p}, chi tiết nổi rõ hẳn.";

// Bài mới gần đây còn chờ duyệt (hàng đợi của nhân viên kiểm duyệt).
// {alt}: dạng biến hình của sản phẩm gắn với bài (chỉ chọn sản phẩm có dạng biến hình).
export const PENDING_POSTS: { topic: "trung-bay" | "hoi-dap" | "chia-se"; body: string; product: boolean }[] = [
  { topic: "hoi-dap", product: true, body: "Mọi người ơi {p} nên để dạng robot hay dạng {alt} trên kệ thì đẹp hơn?" },
  { topic: "trung-bay", product: true, body: "Vừa nhận {p} sáng nay, khui hộp liền. Tối nay sẽ chụp kỹ hơn cho mọi người xem." },
  { topic: "chia-se", product: false, body: "Mình vừa thử làm hộp đèn chụp ảnh bằng thùng carton và giấy can, tốn chưa tới 50 nghìn mà ảnh sáng đều hẳn." },
];

// ---------------------------------------------------------------------------------------------------------
// Tin tức bổ sung. Bài flash sale, combo, 12.12 được ghép danh sách từ dữ liệu thật lúc chạy.

export const GUIDE_POSTS: { title: string; summary: string; body: string; date: string }[] = [
  {
    title: "Gunpla cho người mới: nên chọn HG, RG hay MG?",
    summary: "Ba cấp độ phổ biến nhất của mô hình lắp ráp Gundam khác nhau về kích thước, số chi tiết và thời gian lắp.",
    date: "09-18",
    body:
      "Mô hình lắp ráp Gundam (Gunpla) chia theo cấp độ. Ba cấp phổ biến nhất là HG, RG và MG.\n\n" +
      "HG (High Grade), tỉ lệ 1/144: cao khoảng 12–13 cm, ít chi tiết, lắp trong vài giờ. Đây là lựa chọn tốt nhất cho người mới.{hg}\n\n" +
      "RG (Real Grade), tỉ lệ 1/144: cùng cỡ với HG nhưng có khung trong và rất nhiều chi tiết nhỏ. Nên lắp vài bộ HG trước cho quen tay.{rg}\n\n" +
      "MG (Master Grade), tỉ lệ 1/100: cao khoảng 18–20 cm, khung trong đầy đủ, lắp mất vài buổi tối.{mg}\n\n" +
      "Dụng cụ tối thiểu: kìm cắt một lưỡi, dao gọt và giũa mịn. Không cần keo vì các bộ đều lắp bằng khớp bấm. Nếu không có thời gian, bạn có thể chọn Lắp ráp hộ trong trang Xưởng của sản phẩm.",
  },
  {
    title: "Phân hạng Transformers: Deluxe, Voyager, Leader khác nhau thế nào?",
    summary: "Phân hạng cho biết cỡ và độ phức tạp của mô hình Transformers. Biết phân hạng giúp bạn xếp kệ đồng bộ.",
    date: "10-22",
    body:
      "Mô hình Transformers chính hãng được chia theo phân hạng (class). Mỗi phân hạng là một cỡ mô hình.\n\n" +
      "Deluxe Class: cao khoảng 13–14 cm ở dạng robot, biến hình vừa phải, giá dễ tiếp cận.{deluxe}\n\n" +
      "Voyager Class: cao khoảng 18 cm, nhiều bước biến hình hơn, chi tiết hơn.{voyager}\n\n" +
      "Leader Class: trên 20 cm, thường là các thủ lĩnh, nhiều phụ kiện.{leader}\n\n" +
      "Mẹo xếp kệ: đặt các mẫu cùng phân hạng cạnh nhau để tỉ lệ đồng bộ. Trang sản phẩm ghi rõ phân hạng và chiều cao; bạn cũng có thể dùng trang So sánh để đặt hai mẫu cạnh nhau trước khi mua.",
  },
];
