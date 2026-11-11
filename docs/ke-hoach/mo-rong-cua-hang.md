# Mở rộng cửa hàng: Trưng bày, Truyện tranh, Xu và Nhiệm vụ, Gacha, Cộng đồng, Xưởng

Chủ dự án yêu cầu ngày 07/11/2026; ảnh tham khảo (bản thiết kế "MechaForge") chỉ dùng làm ý tưởng bố cục. Mọi trang theo đúng
giao diện cửa hàng hiện có ("Hộp mô hình": đỏ `brand`, đen `ink`, xanh coban, chữ `font-condensed` viết hoa, viền dày,
bóng đổ khối), dùng chung đầu trang và chân trang.

## Quyết định đã chốt (07/11/2026)

| Vấn đề | Quyết định | Lý do |
| --- | --- | --- |
| Gacha trả bằng gì | **Chỉ bằng xu.** Xu kiếm từ nhiệm vụ và mua hàng, không nạp bằng tiền | Trả tiền thật để nhận quà ngẫu nhiên dễ bị coi là trò chơi may rủi có thưởng; khuyến mại may rủi phải đăng ký với cơ quan quản lý |
| Thứ tự làm | 0 Menu → 1 Trưng bày → 2 Truyện tranh → 3 Xu + Nhiệm vụ → 4 Gacha → 5 Cộng đồng → 6 Xưởng | Phần ít rủi ro trước; Gacha cần xu; Xưởng đụng giỏ hàng, đơn hàng, kho nên làm cuối |
| Cộng đồng | Khách đăng bài kèm ảnh, **qua kiểm duyệt** của nhân viên; có báo cáo vi phạm | Tránh nội dung xấu hiện công khai |
| Xưởng | Tuỳ chọn phải thực tế với đồ chơi đã sản xuất: đế trưng bày, đèn LED, decal, phụ kiện thêm, dịch vụ sơn lại (xem trước màu trên 3D), hộp quà; mỗi tuỳ chọn có giá, tồn riêng | Không thể đổi linh kiện của hàng nhà sản xuất |
| Tên bảng mới | Không trùng bảng có sẵn trên CSDL Supabase dùng chung (xem CLAUDE.md) | CSDL có bảng do nơi khác tạo |

Mỗi giai đoạn xong thì chủ dự án xem trước khi sang giai đoạn sau. Link trên thanh menu (bảng `nav_items`, sửa ở
`/admin/noi-dung/menu`) thêm cùng lúc với trang của nó.

## Giai đoạn

- [x] 0–1. Trưng bày `/trung-bay`: bảng xếp hạng bán chạy, yêu thích, đánh giá cao, chờ hàng, mới về; con số tổng quan. Không cần bảng mới.
- [x] 2. Truyện tranh `/truyen-tranh`: 3 chương tự viết "Đêm ở kệ ROBOTICA" (`src/data/comics.ts`), mỗi khung dùng một sản phẩm đang bán làm hình, có link mua. Đọc tới cuối chương thì ghi `comic_reads` (nhiệm vụ Đọc truyện).
- [x] 3. Xu và Nhiệm vụ `/nhiem-vu`: sổ xu `coin_ledger` (không lưu số dư riêng, không nhận trùng nhờ khoá duy nhất user + lý do + mã), điểm danh ngày (+10, đủ 7 ngày +50), 6 nhiệm vụ một lần, đọc truyện (+20 mỗi chương), xu từ đơn hoàn tất (1 xu mỗi 10.000 ₫). Hằng số ở `src/lib/quests.ts`.
- [x] 4. Gacha `/gacha`: series 1 gồm 12 thẻ là sản phẩm đang bán; tỷ lệ công khai Thường 70%, Hiếm 22%, Siêu hiếm 7%, Bí mật 1%; 9 lượt liền không ra Hiếm thì lượt thứ 10 chắc chắn Hiếm trở lên. Thẻ Hiếm trở lên kèm mã giảm giá dùng một lần (hạn 30 ngày). Bản 2 (08/11/2026, xem mục dưới): hai cách chơi chung một bộ sưu tập, máy quay viên nang và mở gói thẻ, mảnh ghép, lượt miễn phí mỗi ngày, thưởng đủ bộ là mã giảm giá.
- [x] 5. Cộng đồng `/cong-dong`: bài viết theo chủ đề (Chia sẻ, Hỏi đáp, Góc trưng bày, Góp ý cửa hàng) kèm tối đa 4 ảnh, gắn sản phẩm; bình luận, thả tim, báo cáo; mục "Đánh giá" lấy đánh giá đã duyệt của cửa hàng; thành viên nổi bật. Bài mới chờ duyệt ở `/admin/cong-dong` (quyền `community.moderate`: hỗ trợ, marketing). Bảng `community_posts`, `community_post_images`, `community_comments`, `community_likes`, `community_reports`.
- [x] 6. Xưởng (khối `#xuong` trong trang sản phẩm, trừ Phụ kiện): sơn lại 4 phối màu (xem trước màu trên 3D), lớp hoàn thiện, đế trưng bày, LED mắt ngực, lắp ráp hộ (chỉ model kit), decal tên riêng, hộp quà; giá và số ngày xử lý thêm ở `src/lib/workshop.ts`. Thanh "Bóc tách linh kiện" tách các khối của mô hình ra xa tâm. Cấu hình đi theo dòng giỏ (`cfg`), máy chủ tính lại giá khi đặt; đơn hàng lưu mô tả tuỳ chọn. Không có tồn riêng cho tuỳ chọn (dịch vụ làm theo đơn), tồn tính theo mẫu.

## Bảng và migration mới

Mã migration có tiền tố `ext_` để không trùng migration của nơi khác dùng chung CSDL:

| Migration | Nội dung |
| --- | --- |
| `ext_01_xu_nhiem_vu_gacha` | `coin_ledger`, `comic_reads`, `gacha_pulls` |
| `ext_02_cong_dong` | `community_posts`, `community_post_images`, `community_comments`, `community_likes`, `community_reports` |
| `ext_03_xuong` | Cột `order_items.options`, `options_price`, `options_config` (`ADD COLUMN IF NOT EXISTS`) |
| `ext_04_gacha_v2` | Cột `gacha_pulls.source` (machine, free, pack, craft), `free_day` và chỉ mục duy nhất (một lượt miễn phí mỗi người mỗi ngày); bảng `gacha_shards` (sổ mảnh ghép), `gacha_rewards` (thưởng đủ bộ) |
| `ext_07_gacha_series` | Kệ hộp mù theo series: chỉ mục duy nhất đổi từ (khách) sang (khách, series) |
| `ext_05_hop_mu` | Bảng `gacha_box_cases` (kệ hộp mù, mỗi khách một kệ đang mở), cột `gacha_pulls.box_case`, `box_slot` và chỉ mục duy nhất (một hộp chỉ mở một lần) |

## Gacha bản 2 (08/11/2026)

Chủ dự án yêu cầu làm gacha thành một trò chơi thật (ảnh tham khảo: máy quay viên nang ba cột, mở gói thẻ kiểu TCG). Quyết định đã chốt:

| Vấn đề | Quyết định |
| --- | --- |
| Gói thẻ | 5 thẻ, 450 xu (rẻ hơn 5 lượt lẻ): 4 thẻ theo tỷ lệ công khai, thẻ thứ 5 chắc chắn từ Hiếm trở lên (Hiếm 73,3%, Siêu hiếm 23,3%, Bí mật 3,3%) |
| Thẻ trùng | Thành mảnh ghép: Thường 2, Hiếm 5, Siêu hiếm 15, Bí mật 40. Ghép thẻ còn thiếu: Thường 20 mảnh, Hiếm 50 mảnh; Siêu hiếm và Bí mật không ghép được. Thẻ ghép không kèm mã giảm giá, không tính vào bảo hiểm. Bỏ luật cũ "thẻ Thường trùng +10 xu" |
| Lượt miễn phí | 1 lượt máy quay mỗi ngày (giờ Việt Nam) cho khách đã đăng nhập, không gắn với mua hàng |
| Thưởng đủ bộ | Mã giảm 300.000 ₫ cho đơn từ 1.500.000 ₫, dùng một lần, hạn 30 ngày, một lần mỗi series (thay 500 xu). Ai đã nhận 500 xu theo luật cũ coi như đã nhận |

Giao diện (`src/components/gacha/`, hoạt ảnh trong `gacha.css`, chỉ tải ở trang gacha): máy quay có vòm viên nang tung lên, núm vặn xoay, viên nang rơi ra cửa; màu viên nang báo độ hiếm; màn mở viên nang tách đôi rồi thẻ bay ra; xé gói bằng cách kéo ngang dọc mép trên (có nút và phím thay thế), 5 thẻ úp chia ra, thẻ từ Hiếm trở lên có viền vàng lấp lánh trước khi lật; hiệu ứng theo độ hiếm (tia sáng, sóng, sao; pháo giấy cho Siêu hiếm; chớp sáng một lần và viền cầu vồng cho Bí mật). Hoạt ảnh chạy cả khi bật giảm chuyển động, như nút đổi dạng của khung 3D. Trang chỉ làm mới số liệu sau khi hoạt ảnh xong để bộ sưu tập không lộ thẻ mới trước khi khách mở.

Hộp mù (thêm ngày 08/11/2026, chế độ thứ ba): mỗi khách một kệ 12 hộp chứa đủ 12 thẻ của series (mỗi thẻ một hộp, kể cả thẻ Bí mật), thứ tự do máy chủ xếp khi mở hộp đầu tiên và không gửi ra trình duyệt; mở hết kệ là chắc đủ bộ, kệ mới tự xếp. Mỗi hộp 250 xu (cả kệ 3.000 xu). Vì kệ bảo đảm đủ bộ nên hộp mù không kèm mã giảm giá và không tính vào bảo hiểm; thẻ trùng với bộ sưu tập vẫn thành mảnh ghép. Giao diện `BlindBoxShelf.tsx`: kệ 3 tầng, chọn hộp thì hộp phóng to, "Lắc thử" (không lộ gì), mở thì nắp bật tung và thẻ trồi lên. Giá và luật do Claude đề xuất, chủ dự án có thể đổi (`BOX_COST` trong `src/lib/gacha.ts`). Nút "Mua cả kệ" mua và mở một lúc mọi hộp còn niêm phong (giá theo số hộp còn lại, không giảm giá); kệ hiện dòng "Bạn đã có X/12 thẻ, các hộp còn niêm phong có Y thẻ bạn chưa có" (tính từ bộ sưu tập, không lộ hộp nào chứa thẻ gì) để khách hiểu vì sao phần lớn hộp ra thẻ trùng khi đã có gần đủ bộ.

Series 2: Đội Khủng Long (thêm ngày 08/11/2026 theo yêu cầu chủ dự án, thẻ cao nhất là robot hợp thể từ 5 khủng long): 10 thẻ, Thường: Slag, Sludge, Snarl, Swoop, Grimlock Dinobot, Waspinator; Hiếm: Optimus Primal, Megatron Beast Wars; Siêu hiếm: Grimlock Dinobot Leader; Bí mật: Volcanicus (5 Dinobot hợp thể). Cửa hàng không có đủ 12 robot khủng long nên series có 10 thẻ (kệ hộp mù 10 hộp). Mỗi series có bộ sưu tập, bảo hiểm, kệ hộp mù và thưởng đủ bộ riêng; xu, mảnh ghép và lượt miễn phí mỗi ngày dùng chung. Trang có thanh chọn series; thêm series mới chỉ cần thêm vào `SERIES_LIST` (`src/lib/gacha.ts`), mã thẻ có tiền tố mã series.

Không làm: lượt quay tặng theo đơn hàng (đơn hàng đã cho xu; tặng lượt quay may rủi theo giá trị đơn là khuyến mại may rủi phải đăng ký), đồng hồ đếm ngược mùa và "Series 2 sắp ra" (chưa có kế hoạch thật, ghi lên trang là sai sự thật).

## Giới hạn đã biết

- Bóc tách linh kiện tách theo từng khối lưới của file `.glb`. Nhiều file gộp gần hết thân vào một khối có khung xương, nên chỉ vài chi tiết nhỏ tách ra; muốn tách đẹp phải có file chia sẵn linh kiện.
- Xem trước màu sơn là phủ màu lên vật liệu, không thay được chi tiết in hay decal gốc trên texture.
- Xưởng tách thành trang riêng `/san-pham/[slug]/xuong` (08/11/2026, theo yêu cầu chủ dự án): mọi tuỳ biến có hình hiện trên mô hình 3D (độ bóng, đế, đèn LED, decal, hộp quà), có Phòng tối để xem đèn. Vị trí đèn mắt, ngực và decal là ước tính theo hình khối mô hình (tia chiếu vào mặt trước), chỉ để minh hoạ; lắp ráp hộ là dịch vụ nên không đổi hình.
- Xưởng không có tồn riêng; nếu sau này bán phụ kiện thật (đế, LED) theo số lượng thì cần thêm thành biến thể hoặc sản phẩm riêng.
