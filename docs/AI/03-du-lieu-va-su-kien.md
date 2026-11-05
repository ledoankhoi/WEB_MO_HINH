# 03. Dữ liệu và sự kiện cần ghi

Mô hình không học được giá trị của tín hiệu 3D nếu website chỉ ghi lượt xem và đơn hàng. Đây là phần quan trọng nhất và phải làm **sớm nhất**, vì dữ liệu hành vi không bù lại được.

Bảng `events` đã được thiết kế ở [docs/chuan/03-co-so-du-lieu.md](../chuan/03-co-so-du-lieu.md), nhưng mới có một loại sự kiện 3D (`viewer_interact`, chỉ lưu số mili giây). Đề xuất dưới đây mở rộng thiết kế đó. Theo quy tắc của `docs/`, phải sửa `docs/chuan/03` trước rồi mới viết code.

## 1. Bộ sự kiện

| Sự kiện | Khi nào ghi | Dữ liệu |
| --- | --- | --- |
| `product_impression` | Thẻ sản phẩm lọt vào màn hình (danh sách, trang chủ, gợi ý) | Sản phẩm, trang nguồn, vị trí trong danh sách, mô hình gợi ý nào đưa ra (nếu có) |
| `view_product` | Mở trang sản phẩm | Sản phẩm, nguồn tới (tìm kiếm, gợi ý, danh mục) |
| `model_3d_loaded` | Mô hình tải xong hoặc lỗi | Thành công hay không, thời gian tải (ms) |
| `viewer_session` | Rời trang sản phẩm, ẩn tab, hoặc sau 60 giây không thao tác | Bản tổng hợp một phiên xem 3D, xem mục 2 |
| `search` | Tìm kiếm | Từ khoá, số kết quả |
| `add_to_cart`, `remove_from_cart` | Thao tác giỏ | Sản phẩm, **biến thể**, số lượng |
| `wishlist_add`, `wishlist_remove` | Bấm trái tim yêu thích (tính năng đã có, `/api/wishlist`) | Sản phẩm |
| `purchase` | Đặt hàng thành công | Mỗi dòng đơn một sự kiện, kèm số lượng |
| `order_cancelled`, `order_returned` | Đơn bị huỷ, hàng hoàn về | Để hiệu chỉnh nhãn mua |

Hai sự kiện cuối không cần ghi từ trình duyệt: lấy từ bảng `orders` và `order_events` (lịch sử trạng thái đơn, đã có). Tương tự, **đánh giá sao** của khách đã mua (bảng `reviews`, đã có) là nhãn tường minh sẵn có, dùng làm nhãn phụ khi đánh giá mô hình; danh sách yêu thích hiện có (bảng `wishlist_items`) dùng được ngay làm hành vi phụ, kể cả trước khi có bảng `events`.

## 2. Tổng hợp phiên xem 3D ngay tại trình duyệt

Không gửi từng chuyển động chuột: tốn băng thông, ghi nhiều dòng vô ích và lộ nhiều dữ liệu hơn mức cần thiết. Trình duyệt gom lại và gửi **một** sự kiện `viewer_session` cho mỗi lần xem, có trường `detail` (JSON) như sau:

```json
{
  "active_ms": 41250,
  "load_ms": 1830,
  "coverage_cells": 9,
  "zoom_max": 0.62,
  "zoom_actions": 4,
  "rotate_drags": 7,
  "auto_rotate_on": false,
  "reset_view": 1,
  "form_toggles": 2,
  "poses": ["Thủ thế", "Tấn công"],
  "device": "touch",
  "viewport": "390x844"
}
```

Các điểm móc trong mã hiện có, tại `src/components/three/RobotViewer.tsx`:

| Đại lượng | Lấy ở đâu |
| --- | --- |
| Đang thao tác | `onStart`/`onEnd` của `OrbitControls`, các nút phóng to, thu nhỏ, đổi dạng, chọn dáng |
| Khung có trong màn hình | `IntersectionObserver` đã có sẵn (biến `inView`) |
| Tab đang hiện | `document.visibilityState` |
| Góc nhìn | Góc phương vị và góc cực của `OrbitControls` khi kết thúc mỗi lần kéo |
| Mức phóng | Khoảng cách camera sau `dolly`, chuẩn hoá theo `MIN_DISTANCE`, `MAX_DISTANCE` |
| Đổi dạng, chọn dáng | `toggleForm`, `choosePose` |

### Quy tắc tính thời gian hoạt động `active_ms`

Một khoảng thời gian chỉ được cộng vào `active_ms` khi thoả cả bốn điều kiện:

1. Mô hình đã tải xong.
2. Khung 3D nằm trong màn hình (`inView`).
3. Tab đang hiện.
4. Có thao tác trong vòng 5 giây gần nhất. Riêng khi đang phát clip biến hình do người dùng bấm, khoảng phát được tính là hoạt động.

Chế độ tự xoay chạy một mình **không** tính là hoạt động.

## 3. Định danh và gửi dữ liệu

- `visitor_id`: mã ngẫu nhiên lưu ở trình duyệt, nối hành vi trước và sau khi đăng nhập (đã có trong thiết kế).
- `user_id`: nếu đã đăng nhập; máy chủ tự lấy từ phiên, không tin giá trị trình duyệt gửi lên.
- Gửi qua `navigator.sendBeacon` tới Route Handler `/api/events`. Máy chủ kiểm tra loại sự kiện, độ dài trường, và giới hạn tần suất theo `visitor_id` (dùng bảng `rate_limits` sẵn có).
- Ghi sự kiện thất bại không được làm hỏng thao tác của khách (YC-HV-03).

## 4. Ba yếu tố dễ làm sai kết quả

1. **Không phải sản phẩm nào cũng có cùng loại tương tác.** Mọi sản phẩm mẫu đều có `.glb`, nhưng chỉ một số có clip biến hình, hợp thể, chọn dáng. Phải ghi nhận mức sẵn có như một biến riêng và phân tích theo nhóm.
2. **Thiết bị ảnh hưởng tới tương tác.** Điện thoại, máy yếu, mạng chậm cho ít thao tác hơn. Vì vậy phải lưu `device`, `viewport`, `load_ms` để mô hình phân biệt "không muốn" với "không thể".
3. **Phải ghi nhận sản phẩm đã thực sự được hiển thị** (`product_impression`). Thiếu dữ liệu này thì không phân biệt được "không quan tâm" với "chưa từng thấy", và việc chọn mẫu âm bị thiên lệch.

## 5. Quyền riêng tư

Thu thập hành vi cá nhân thuộc phạm vi Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.

- Thông báo rõ trên trang: thu dữ liệu gì, dùng làm gì (gợi ý sản phẩm và nghiên cứu luận văn), lưu bao lâu.
- Có lựa chọn từ chối. Khi khách từ chối, chỉ ghi các sự kiện cần cho vận hành (đơn hàng), không ghi sự kiện 3D.
- Chỉ thu dữ liệu tổng hợp ở mức cần cho nghiên cứu; không ghi toạ độ chuột thô, không ghi địa chỉ IP vào bảng `events`.
- Thời hạn lưu đề xuất là 12 tháng. Khi xuất dữ liệu cho thực nghiệm, thay `user_id`, `visitor_id` bằng mã băm có muối riêng của lần xuất.

## 6. Không làm website nặng thêm

Số đo ngày 16/10/2026 cho thấy phần 3D là thứ nặng nhất của trang:

| Thành phần | Dung lượng |
| --- | --- |
| Một mô hình `.glb` đã nén (39 file, tổng 28 MB) | Trung bình khoảng 0,7 MB, lớn nhất 2,2 MB |
| Mã JavaScript của Three.js và khung xem 3D (chưa nén gzip) | Khoảng 1,2 MB |
| **Mã ghi sự kiện (ngân sách)** | **Tối đa 3 KB sau gzip** |
| **Một lần gửi `viewer_session`** | **Khoảng 0,3 KB** |

Như vậy phần ghi sự kiện chỉ bằng khoảng 1/200 đến 1/700 dung lượng của **một** mô hình 3D. Để giữ đúng như vậy khi cài đặt, có các quy tắc bắt buộc sau:

1. **Không thêm thư viện** phân tích (Google Analytics, Segment...). Tự viết, dùng API sẵn có của trình duyệt.
2. **Không làm gì trong vòng lặp vẽ** (`useFrame`). Chỉ cập nhật bộ đếm khi có sự kiện: bắt đầu kéo, kết thúc kéo, bấm nút. Góc camera chỉ đọc một lần khi kết thúc mỗi lần kéo.
3. **Gửi ít lần:**
   - Mỗi lần xem chỉ gửi một `viewer_session`, khi rời trang hoặc ẩn tab, qua `navigator.sendBeacon`. Trình duyệt tự gửi ngầm, không chặn việc chuyển trang.
   - `product_impression` gom theo lô, gửi một lần mỗi 10 giây hoặc khi rời trang.
4. **Không tranh tài nguyên tải mô hình:** chỉ bắt đầu đếm sau khi mô hình tải xong; không gửi gì trong lúc đang tải.
5. **Máy chủ trả lời ngay:** Route Handler `/api/events` kiểm tra đầu vào rồi trả `204`; việc ghi vào CSDL chạy sau khi đã trả lời, bằng hàm `after()` của Next.js.
6. **Mã ghi sự kiện chỉ nằm trong phần khung 3D** (đã tải lười bằng `next/dynamic`) và một component nhỏ dùng chung. Trang không có 3D không phải tải thêm gì.

**Tiêu chí nghiệm thu khi cài:**

- Dung lượng JavaScript của trang sản phẩm tăng không quá 3 KB sau gzip; so bằng bảng kết quả của `npm run build` trước và sau.
- Không có yêu cầu mạng nào trong lúc mô hình đang tải.
- Thời gian phản hồi của `/api/events` dưới 50 ms (không chờ ghi CSDL).

## 7. Tập dữ liệu dùng cho thực nghiệm

Một website mới của đồ án sẽ **không** có đủ khách thật để huấn luyện hệ gợi ý cộng tác. Vì vậy đề tài dùng nhiều nguồn, mỗi nguồn chứng minh một điều khác nhau, và **kết luận không được vượt quá điều mà nguồn đó chứng minh được**.

| Tập | Nguồn | Thật hay giả | Chứng minh được | Không chứng minh được |
| --- | --- | --- | --- | --- |
| D-pub | Retailrocket ([08-chuan-bi.md](08-chuan-bi.md)) | Thật, không có 3D | Mô hình đa hành vi và bộ đánh giá chạy đúng trên dữ liệu lớn | Bất cứ điều gì về 3D |
| D-semi | D-pub cộng với tín hiệu 3D **giả lập** gắn vào từng lượt xem thật, với mức thông tin $\gamma$ kiểm soát được | Bán tổng hợp | Phương pháp khai thác được tín hiệu 3D khi nó có thông tin, và không "bịa" ra cải thiện khi $\gamma = 0$, trên hành vi mua sắm thật | Tín hiệu 3D thật có thông tin hay không |
| D-sim | Bộ mô phỏng ([04-thuc-nghiem.md](04-thuc-nghiem.md) mục 6) | Tổng hợp | Như D-semi, trong môi trường kiểm soát hoàn toàn; dùng để phát triển và kiểm tra mã | Như D-semi |
| D-pilot | Buổi dùng thử có người tham gia, làm theo kịch bản mua sắm, **kèm phiếu xếp hạng sở thích** ở cuối buổi | **Thật**, quy mô nhỏ | Tín hiệu 3D thật có liên hệ với sở thích thật không (câu hỏi Q1); bằng chứng thăm dò cho H1 | Kết luận chắc chắn, vì mẫu nhỏ |
| D-live | Khách thật sau khi website chạy công khai | Thật | Kiểm chứng ngoài đời, A/B (hướng E7) | Phụ thuộc lưu lượng, có thể không kịp trong luận văn |

### 7.1. Phiếu xếp hạng sở thích trong D-pilot

Dữ liệu mua của 20 đến 40 người là quá thưa: mỗi người chỉ mua một, hai món. Cách khắc phục:

- Sau khi tự do xem hàng (có xoay 3D), mỗi người chấm điểm từ 1 đến 5 mức muốn sở hữu cho **toàn bộ** sản phẩm (danh mục chỉ khoảng 40 món), hoặc chọn 5 món muốn mua nhất.
- Phiếu này là **nhãn đánh giá độc lập** với hành vi trên web: kiểm tra mô hình có tín hiệu 3D có xếp hạng gần với sở thích người đó tự khai hơn không.
- Đây là thiết kế thường gặp trong nghiên cứu có người tham gia, và có giá trị học thuật cao hơn hẳn dữ liệu tự tạo.

### 7.2. Những nguồn không dùng làm bằng chứng

| Nguồn | Vì sao không dùng |
| --- | --- |
| Tác giả tự bấm, tự xoay để tạo dữ liệu | Người tạo dữ liệu biết giả thuyết, nên hành vi bị thiên lệch theo giả thuyết; không phải dữ liệu độc lập |
| Tác tử AI (mô hình ngôn ngữ lớn điều khiển trình duyệt) giả làm khách | Vẫn là dữ liệu tổng hợp, nhưng quy luật sinh dữ liệu bị giấu trong câu lệnh và mô hình, nên **khó kiểm soát hơn** bộ mô phỏng tự viết. Nghiên cứu cho thấy tác tử lệch khỏi sở thích thật của người dùng [R17] và dễ bị rò rỉ thông tin mục tiêu [R18]. Tác tử không thực sự "thích" một mô hình khi nhìn ảnh 3D. Ngoài ra tốn chi phí gọi API. Chỉ có thể dùng để thử tải hoặc thử giao diện, không dùng làm dữ liệu huấn luyện hay đánh giá |

Dữ liệu mô phỏng là phương pháp chính đáng nếu được **nêu rõ** và dùng đúng vai trò: kiểm tra một phương pháp trong điều kiện biết trước đáp án, như các nền tảng mô phỏng gợi ý [R16]. Nó không thay được dữ liệu thật để kết luận về khách hàng thật.
