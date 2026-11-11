# Kế hoạch: thanh toán online và giao hàng thật (mục 5, 6)

Lập ngày 08/11/2026.

> **Quyết định 08/11/2026 (sau khi lập kế hoạch):** chủ dự án đổi ý, **chỉ làm sandbox**, chọn cách nhanh và miễn phí. Thứ tự: VNPay sandbox (bước C, đăng ký miễn phí) → giao hàng bằng môi trường thử GHN + bảng phí dự phòng (bước E, F). MoMo, GHTK và chạy thật (bước H, mục 3) để sau. Phần dưới giữ nguyên làm kế hoạch đầy đủ khi chạy thật.
>
> **Tiến độ:** C1–C4 xong 08/11/2026 (ký/kiểm chữ ký, đặt đơn chuyển tới VNPay, IPN, trang trả về tra cứu `querydr`, nút thanh toán lại; migration `sale_03_vnpay`; `test/vnpay.test.ts` 11 test). C6–C7 phần lõi xong 11/11/2026: `src/server/payments/vnpay-ops.ts` (hoàn tiền qua API chia theo lượt đã trả, đối soát lượt treo), route `/api/thanh-toan/vnpay/doi-soat` (khoá `CRON_SECRET`) gọi bởi `netlify/functions/vnpay-doi-soat.mts` 15 phút một lần; `test/vnpay-ops.test.ts`. Còn: chạy thử bằng khoá sandbox thật (chờ chủ dự án đăng ký); nối nút "Hoàn qua VNPay" vào L14 và bước hoàn tiền của trả hàng (sửa file dùng chung `repo/orders.ts`, `repo/returns.ts`, trang quản trị đơn, đang có phiên khác sửa); tự huỷ đơn chưa trả (C5).

Chủ dự án yêu cầu: hai mục này **phải chạy thật bằng tài khoản thật**, không dừng ở sandbox. Sandbox chỉ là bước kiểm thử trước khi bật thật.

## 0. Tóm tắt

| | Thanh toán online (mục 5) | Giao hàng (mục 6) |
| --- | --- | --- |
| Đối tác | VNPay (thẻ ATM, QR ngân hàng, thẻ quốc tế), MoMo (ví) | GHN trước, GHTK sau |
| Khách thấy | Chọn "VNPay" hoặc "MoMo" ở trang thanh toán → trả tiền → về trang đơn, đơn tự chuyển "Đã thanh toán" | Nhập phường/xã → phí ship tính theo địa chỉ và cân nặng → theo dõi hành trình ở trang đơn |
| Cửa hàng được | Không phải đối soát chuyển khoản bằng tay; hoàn tiền bằng một nút | Bấm "Tạo vận đơn" thay vì gõ mã tay; trạng thái giao tự cập nhật; in nhãn |
| Cần trước khi chạy thật | Đăng ký kinh doanh, tài khoản ngân hàng đứng tên hộ kinh doanh/công ty, hợp đồng với VNPay, MoMo | Tài khoản GHN (và GHTK), địa chỉ lấy hàng, **cân nặng + kích thước của 81 biến thể** |
| Ước lượng | 4–6 ngày làm mã + thời gian VNPay/MoMo duyệt hồ sơ (thường 1–3 tuần) | 4–5 ngày làm mã + 1 ngày nhập cân nặng |

Thứ tự đề xuất: **A (chuẩn bị, chủ dự án làm song song) → B (nền chung) → C (VNPay) → D (MoMo) → E (địa chỉ phường/xã) → F (GHN) → G (GHTK) → H (chạy thật)**.

## 1. Hiện trạng (đã kiểm tra mã và CSDL thật)

- Thanh toán: chỉ có **COD** và **chuyển khoản VietQR** (`src/server/payment.ts`). Kế toán bấm "Ghi nhận đã thu tiền" (L2) bằng tay. CSDL thật: 4 đơn, đều COD.
- Cột `orders.payment_method` và `payments.method` có ràng buộc `CHECK (... IN ('cod', 'bank'))`, nên phải sửa ràng buộc để thêm phương thức mới.
- Luồng đơn L2–L14 (`src/lib/order-flow.ts`): L3 "Xác nhận đơn" đòi COD hoặc đã thu tiền, nên đơn trả online chỉ xác nhận được sau khi tiền về. Luật này giữ nguyên.
- Phí ship: cố định 30.000đ, miễn phí từ 1.000.000đ (`src/lib/pricing.ts`, `site.shipping`).
- Địa chỉ: chỉ có ô địa chỉ tự do + **tỉnh** (34 tỉnh mới). **Chưa có phường/xã**, trong khi GHN và GHTK đều bắt buộc phường/xã.
- Vận chuyển: L6 "Bàn giao vận chuyển" bắt nhân viên **gõ tay** hãng và mã vận đơn. L7 (đã giao), L9 (giao thất bại) bấm tay.
- Biến thể đã có cột `weight_grams`, `length_mm`, `width_mm`, `height_mm`, nhưng **cả 81 biến thể đang bán đều trống**.
- Website chạy trên Netlify (HTTPS), nên nhận được IPN và webhook. Chưa có tác vụ định kỳ (cron).

## 2. Thông tin đối tác (đã đọc tài liệu chính thức ngày 08/11/2026)

### VNPay (sandbox.vnpayment.vn/apis)
- Phiên bản API 2.1.0. Thanh toán: chuyển trình duyệt tới `.../paymentv2/vpcpay.html` (GET) với các tham số `vnp_*`, chữ ký **HMAC-SHA512** bằng `vnp_HashSecret`. Chuỗi ký là các tham số sắp xếp theo tên, mã hoá URL, nối bằng `&`. `vnp_Amount` = số tiền × 100. `vnp_ExpireDate` là hạn thanh toán (mẫu dùng 15 phút). `vnp_TxnRef` phải duy nhất trong ngày.
- Có hai kết quả: **Return URL** (trình duyệt quay về, chỉ để hiển thị) và **IPN URL** (máy chủ VNPay gọi máy chủ mình, có SSL, **đăng ký với VNPay**, không gửi trong yêu cầu). Chỉ IPN được phép đổi trạng thái đơn.
- IPN trả JSON `{RspCode, Message}`: `00` xác nhận, `02` đã xác nhận trước đó, `01` không thấy đơn, `04` sai số tiền, `97` sai chữ ký, `99` lỗi khác. Với 01/04/97/99 hoặc quá thời gian, VNPay gọi lại tối đa 10 lần, cách 5 phút.
- Tra cứu (`querydr`) và **hoàn tiền** (`refund`, `vnp_TransactionType` 02 toàn phần, 03 một phần) qua `POST .../merchant_webapi/api/transaction` (JSON), chuỗi ký nối bằng `|`.
- Sandbox: đăng ký ở `pay.vnpaytest.vn/dev-registration`, nhận `vnp_TmnCode` và `vnp_HashSecret` qua email. URL production gửi kèm hợp đồng.

### MoMo (developers.momo.vn; trang chặn đọc tự động, các chi tiết dưới đây lấy qua tìm kiếm, **cần đối chiếu lại khi làm**)
- Tạo giao dịch: `POST /v2/gateway/api/create`, `requestType = captureWallet`, chữ ký **HMAC-SHA256** trên chuỗi `accessKey=…&amount=…&extraData=…&ipnUrl=…&orderId=…&orderInfo=…&partnerCode=…&redirectUrl=…&requestId=…&requestType=…`.
- Có `redirectUrl` (trình duyệt, có thể bị lỡ khi khách tắt app) và `ipnUrl` (máy chủ gọi máy chủ, gửi trong yêu cầu). Kết quả cuối lấy theo IPN.
- Số tiền mỗi giao dịch 1.000đ – 50.000.000đ. Có API tra cứu và hoàn tiền.
- Môi trường thử `test-payment.momo.vn`, thật `payment.momo.vn`.

### GHN (developer.ghn.vn)
- Thật `online-gateway.ghn.vn`, thử `dev-online-gateway.ghn.vn`. Header `Token`, `ShopId`. Tài khoản thật và thử tách riêng (thử: `5sao.ghn.dev`).
- **Đã hỗ trợ địa chỉ mới 2 cấp** khi tạo đơn: cờ `is_new_to_address: true`, gửi `to_ward_name` + `to_province_name`, không cần quận/huyện. Danh mục phường/xã mới: `GET /shiip/public-api/v3/master-data/ward/all-by-province-id`.
- **Chưa rõ:** API tính phí (`/v2/shipping-order/fee`) trong tài liệu vẫn ghi `to_district_id` + `to_ward_code`. Phải thử trên môi trường thử xem có tính được theo địa chỉ mới không. Nếu không, dùng bảng phí dự phòng (mục 5.3).
- Tạo đơn `/v2/shipping-order/create`: `client_order_code` duy nhất (gửi lại thì trả về đơn cũ, an toàn khi thử lại), `cod_amount` ≤ 50 triệu, `insurance_value` ≤ 5 triệu, `weight` ≤ 50 kg, `required_note` (cho xem hàng hay không).
- Webhook: cấu hình trên cổng GHN (tab Order), POST JSON, có **header tuỳ chỉnh** (dùng làm khoá bí mật), thử lại khi lỗi 5xx. Không có chữ ký, nên phải kiểm header và đọc lại trạng thái từ API.

### GHTK (api.ghtk.vn)
- Thật `services.giaohangtietkiem.vn`, thử `services-staging.ghtklab.com`. Header `Token`, `X-Client-Source`.
- Tính phí `GET /services/shipment/fee` (tỉnh + **phường/xã bắt buộc**, quận/huyện không bắt buộc, cân nặng gram). Tạo đơn `POST /services/shipment/order`, huỷ, in nhãn PDF.
- Webhook POST form gồm `label_id`, `partner_id`, `status_id` (-1 huỷ, 1–6, 7–13, 20–21), `fee`. Xác thực chỉ bằng tham số `hash` trên URL do mình đặt. Tài liệu **chưa nói** về địa chỉ mới, nên phải hỏi GHTK.

## 3. Việc chủ dự án cần làm (bắt đầu ngay, song song với lúc làm mã)

| # | Việc | Ghi chú |
| --- | --- | --- |
| A1 | **Đăng ký hộ kinh doanh** (hoặc công ty) nếu chưa có | VNPay, MoMo chỉ ký hợp đồng cổng thanh toán với đơn vị kinh doanh |
| A2 | **Tài khoản ngân hàng đứng tên hộ kinh doanh/công ty** | Từ 01/03/2026, tài khoản dùng cho kinh doanh phải đúng tên trên giấy chứng nhận (Thông tư 25/2025/TT-NHNN) |
| A3 | **Tên miền riêng** (ví dụ robotica.vn) trỏ về Netlify | Cổng thanh toán duyệt theo website; IPN cần địa chỉ ổn định |
| A4 | **Thông báo website thương mại điện tử với Bộ Công Thương** (online.gov.vn) | Thường được cổng thanh toán hỏi khi duyệt hồ sơ; cần xác nhận với VNPay/MoMo |
| A5 | Thay **thông tin liên hệ, chính sách đổi trả, bảo mật, vận chuyển** đang là nội dung mẫu (`src/config/site.ts`, trang nội dung) bằng thông tin thật | Cổng thanh toán kiểm tra các trang này |
| A6 | Đăng ký **sandbox VNPay** (`pay.vnpaytest.vn/dev-registration`) và **MoMo Business** (môi trường thử) | Mình dùng khoá thử để làm và kiểm thử |
| A7 | Nộp hồ sơ **VNPay** và **MoMo** bản thật (hotline VNPay \*3388) | Mất 1–3 tuần; hỏi rõ phí giao dịch, thời gian tiền về, cách đăng ký IPN URL |
| A8 | Tạo tài khoản **GHN** (thật + thử) và **GHTK**; khai báo địa chỉ lấy hàng | Hỏi GHTK cách gửi địa chỉ mới 2 cấp và cách cấu hình webhook |
| A9 | **Cân và đo 81 biến thể** (gram, mm, kích thước hộp) | Mình làm sẵn ô nhập hàng loạt ở quản trị. Thiếu số thì phí ship sai |
| A10 | Chốt chính sách: ai trả phí ship khi đơn từ 1 triệu (cửa hàng chịu?), có cho xem hàng khi nhận không, có bảo hiểm hàng không | Ảnh hưởng tiền thật mỗi đơn |

Mọi khoá bí mật (`VNPAY_*`, `MOMO_*`, `GHN_*`, `GHTK_*`) chỉ đặt trong `.env.local` và biến môi trường Netlify, không đưa vào git hay chat.

## 4. Mục 5: Thanh toán online

### 4.1. Thiết kế

```
Khách bấm "Đặt hàng" (VNPay/MoMo)
  → tạo đơn: pending, unpaid, giữ hàng như hiện nay
  → tạo lượt thanh toán (payment_attempts) → chuyển tới cổng
Cổng → IPN (máy chủ ↔ máy chủ): kiểm chữ ký, số tiền, đơn còn chờ
  → L2 tự động: payment_status = paid, ghi payments (charge), gửi thư
Cổng → Return URL (trình duyệt): chỉ hiển thị "đang xác nhận" / kết quả, đọc từ CSDL
Hết hạn 15 phút chưa trả: khách bấm "Thanh toán lại" (lượt mới) hoặc đơn tự huỷ sau 24 giờ (trả hàng giữ)
Hoàn tiền (L14 và trả hàng mục 4): gọi API refund của cổng, ghi payments (refund)
```

**Lớp trung gian** `src/server/payments/`: một kiểu `PaymentGateway` chung (`createPayment`, `verifyCallback`, `query`, `refund`), hai bản cài đặt `vnpay.ts`, `momo.ts`. Phần ký và kiểm chữ ký là **hàm thuần** trong `src/lib/` để test bằng ví dụ mẫu của tài liệu.

**Nguyên tắc an toàn:**
- Chỉ IPN đổi trạng thái. Return URL không bao giờ ghi "đã trả" (người dùng sửa được tham số trên URL).
- Kiểm theo thứ tự: chữ ký → lượt thanh toán có thật → **số tiền khớp** → lượt còn chờ. Ghi trong một giao dịch có khoá dòng; IPN gọi lặp thì trả "đã xác nhận" (idempotent).
- Mỗi lượt thanh toán một mã riêng (`vnp_TxnRef` / `orderId` của MoMo), không dùng lại mã đơn, vì khách có thể trả lại sau khi lượt đầu hết hạn.
- **Tiền về sau khi đơn đã huỷ** (khách trả lúc hết hạn): ghi nhận tiền, đánh dấu đơn "đã huỷ, đã thu tiền" để rơi vào danh sách chờ hoàn tiền (L14) và báo kế toán. Không tự bỏ qua.
- Lưu nguyên văn mọi callback (bảng nhật ký) để đối soát và tra lỗi. Không lưu số thẻ (cổng không gửi).
- Khoá bí mật chỉ ở máy chủ. Trình duyệt không bao giờ thấy `HashSecret` / `secretKey`.

### 4.2. CSDL (migration `sale_03_thanh_toan_online`)

Trước khi làm: kiểm tra lại trên CSDL thật rằng tên bảng chưa có (đã kiểm ngày 08/11: chỉ có `payments`).

- Sửa ràng buộc: `orders.payment_method` và `payments.method` thêm `'vnpay'`, `'momo'` (bỏ CHECK cũ, tạo CHECK mới rộng hơn; dữ liệu cũ vẫn hợp lệ).
- Bảng `payment_attempts`: `id`, `order_id`, `gateway`, `ref` (mã gửi cổng, duy nhất), `amount`, `status` (pending, paid, failed, expired), `gateway_txn` (mã giao dịch phía cổng), `pay_url`, `expires_at`, `paid_at`, `created_at`.
- Bảng `payment_callbacks`: `id`, `gateway`, `kind` (ipn, return, refund, query), `ref`, `payload` (JSON nguyên văn), `signature_ok`, `result`, `created_at`.
- `payments`: thêm cột `gateway_txn` (`IF NOT EXISTS`) để đối chiếu với sao kê của cổng.
- Lưu ý: `payments` chỉ cho một dòng `refund` mỗi đơn. Với cổng có hoàn tiền một phần (VNPay 03), giữ quy tắc này (khớp với mục 4).

### 4.3. Các bước

| Bước | Nội dung | Kiểm tra |
| --- | --- | --- |
| C1 | Hàm thuần ký/kiểm chữ ký VNPay (SHA512, chuỗi sắp xếp, mã hoá URL), dựng URL thanh toán, đọc mã kết quả | Test với ví dụ trong tài liệu VNPay và các trường hợp sai chữ ký, sai số tiền |
| C2 | Trang thanh toán: lựa chọn "VNPay" (hiện khi có biến `VNPAY_*`); đặt đơn xong chuyển tới cổng | Test luồng đặt đơn |
| C3 | `GET /api/thanh-toan/vnpay/ipn`: kiểm và ghi, trả `RspCode` đúng chuẩn | Test: IPN đúng, lặp, sai chữ ký, sai số tiền, đơn đã huỷ |
| C4 | `GET /thanh-toan/ket-qua`: trang khách sau khi trả, đọc trạng thái từ CSDL, tự làm mới tới khi IPN về | Mở trang thật |
| C5 | Thanh toán lại / hết hạn; tự huỷ đơn chưa trả sau 24 giờ (Netlify Scheduled Function chạy 15 phút một lần, gọi route có khoá bí mật) | Test hàm huỷ; chạy thử trên Netlify |
| C6 | Hoàn tiền qua API: L14 và bước hoàn tiền của trả hàng có nút "Hoàn qua VNPay" (toàn phần 02 / một phần 03); vẫn giữ "ghi nhận đã hoàn tay" cho trường hợp đặc biệt | Test với sandbox |
| C7 | Đối soát: trang quản trị liệt kê lượt thanh toán, nút "Tra cứu lại" (querydr) cho lượt treo; tác vụ định kỳ tra cứu lượt pending quá 30 phút (phòng IPN bị lỡ) | Test hàm, chạy sandbox |
| D1–D7 | Như C1–C7 cho MoMo (`captureWallet`, HMAC-SHA256, IPN POST JSON) | Như trên |
| C8 | Kiểm thử đầu-cuối trên **sandbox** với thẻ thử của VNPay và app MoMo thử: thành công, khách huỷ, hết hạn, IPN đến trước/sau khi khách quay về, hoàn tiền | Ghi kết quả vào báo cáo |

## 5. Mục 6: Phí giao hàng và đơn vị vận chuyển

### 5.1. Địa chỉ phường/xã (bước E, làm trước GHN/GHTK)

- Thêm **Phường/Xã** vào trang thanh toán, sổ địa chỉ (`customer_addresses`) và đơn hàng (`orders.shipping_ward`, `IF NOT EXISTS`). Ô chọn phụ thuộc tỉnh.
- Danh mục: bảng `wards` riêng của mình (khoảng 3.300 phường/xã theo Nghị quyết 202/2025/QH15), nạp một lần từ danh mục GHN (API v3 ở trên), có kèm mã GHN. Tên bảng sẽ kiểm tra trên CSDL thật (bảng `addresses` của nơi khác không được dùng). GHTK nhận tên phường/xã nên dùng chung danh mục.
- Đơn cũ (chỉ có tỉnh) vẫn hiển thị bình thường; chỉ đơn mới bắt buộc phường/xã.

### 5.2. Lớp trung gian vận chuyển

`src/server/shipping/`: kiểu `Carrier` chung (`quote`, `createShipment`, `cancel`, `label`, `parseWebhook`), bản cài đặt `ghn.ts`, `ghtk.ts`, và `fallback.ts` (bảng phí).

### 5.3. Tính phí ở trang thanh toán

- Cân nặng tính phí = tổng `max(cân nặng thật, cân quy đổi theo thể tích)` của các món. Thiếu số đo thì dùng giá trị mặc định theo danh mục và báo cho quản trị.
- Gọi API tính phí của hãng được chọn, **cache** theo (phường, mốc cân nặng) vài giờ để trang không chậm. Hãng lỗi hoặc quá 3 giây thì dùng **bảng phí dự phòng** (nội tỉnh / cùng miền / khác miền × mốc cân nặng, sửa ở quản trị).
- Máy chủ **tính lại phí lúc đặt đơn** (không tin số trình duyệt gửi), lưu kèm hãng, dịch vụ và phí ước tính vào đơn.
- Giữ chính sách miễn phí từ ngưỡng (theo A10): khách thấy "Miễn phí", cửa hàng vẫn lưu phí thật phải trả hãng để báo cáo lãi.

### 5.4. Tạo vận đơn và theo dõi

- L6 "Bàn giao vận chuyển": thay ô gõ mã bằng nút **"Tạo vận đơn GHN/GHTK"**. Gửi người nhận, phường/xã, món hàng, cân nặng, COD (= tổng đơn nếu COD, 0 nếu đã trả online), giá trị khai báo; nhận mã vận đơn và phí thật. Dùng `client_order_code` / `order.id` = mã đơn để bấm lặp không tạo hai vận đơn. Vẫn giữ cách gõ tay cho hãng khác.
- In nhãn PDF từ trang lấy hàng; huỷ vận đơn khi huỷ đơn (trước khi hãng lấy hàng).
- **Webhook** `POST /api/van-chuyen/ghn`, `/api/van-chuyen/ghtk`: kiểm khoá bí mật (header với GHN, tham số trên URL với GHTK), ghi nguyên văn vào bảng nhật ký, **đọc lại trạng thái từ API hãng** trước khi tin, rồi ánh xạ:

| Hãng báo | Đơn |
| --- | --- |
| Đã lấy hàng, đang giao | giữ `in_transit`, hiện ở lịch sử đơn cho khách |
| Đã giao (GHN `delivered`, GHTK 5) | L7 tự động (rồi L8 nếu đã thu tiền) |
| Giao thất bại (GHN `delivery_fail`, GHTK 9) | L9 tự động, báo nhân viên |
| Đang hoàn / đã hoàn (GHN `return`/`returned`, GHTK 20/21) | báo nhân viên. **L11 (nhận hàng hoàn vào kho) vẫn bấm tay** sau khi kho kiểm hàng thật |
| Đã đối soát COD (GHTK 6, GHN `cod`) | đánh dấu tiền COD đã về; L2 tự động cho đơn COD |

- Bảng mới (migration `sale_04_van_chuyen`, tên kiểm trên CSDL thật): `wards`, `shipments` (đơn, hãng, mã vận đơn, phí ước tính/thực, COD, trạng thái hãng, nhãn), `shipment_events` (nhật ký webhook nguyên văn), `shipping_rates` (bảng phí dự phòng).
- Trang đơn của khách: dòng thời gian hành trình từ `shipment_events`, link tra cứu trên trang hãng.

### 5.5. Các bước

| Bước | Nội dung |
| --- | --- |
| E1 | Danh mục phường/xã, ô chọn ở thanh toán và sổ địa chỉ, cột `shipping_ward` |
| E2 | Nhập cân nặng/kích thước hàng loạt ở quản trị sản phẩm; cảnh báo biến thể còn thiếu |
| F1 | GHN: tính phí trên môi trường thử, **xác minh địa chỉ mới với API tính phí** (mục 2); bảng phí dự phòng |
| F2 | GHN: tạo vận đơn, in nhãn, huỷ |
| F3 | GHN: webhook + ánh xạ trạng thái + dòng thời gian cho khách |
| G1–G3 | Như F1–F3 cho GHTK; quản trị chọn hãng mặc định và hãng cho từng đơn |
| F4 | Đối soát phí: so phí ước tính với phí thật trong báo cáo bán hàng |

## 6. Chạy thật (bước H)

1. Đặt biến môi trường production trên Netlify; đăng ký IPN URL với VNPay, webhook URL trên cổng GHN/GHTK (theo tên miền thật).
2. Bật từng phương thức bằng cờ trong quản trị (mặc định tắt), để tắt ngay được nếu có sự cố.
3. **Giao dịch thật nhỏ:** đặt một đơn 10.000đ bằng VNPay, một bằng MoMo; kiểm tiền về tài khoản; hoàn tiền một đơn; đối chiếu với trang quản lý của cổng.
4. **Vận đơn thật:** gửi một gói thật tới địa chỉ người quen bằng GHN (và GHTK), theo dõi webhook tới khi giao xong; thử một đơn COD.
5. Theo dõi 2 tuần đầu: nhật ký callback lỗi, lượt thanh toán treo, chênh lệch phí ship. Sau đó mới bỏ chuyển khoản VietQR tay (hoặc giữ song song).

## 7. Kiểm thử

- Vitest: ký/kiểm chữ ký (ví dụ của tài liệu), IPN đúng/lặp/sai chữ ký/sai số tiền/đơn đã huỷ, hết hạn và tự huỷ, hoàn tiền; tính cân nặng quy đổi, bảng phí dự phòng, ánh xạ trạng thái webhook, webhook lặp và sai khoá; tạo vận đơn bấm lặp.
- Gọi API đối tác trong test bằng máy chủ giả (không gọi mạng thật); kiểm thử với sandbox thật làm bằng tay, ghi kết quả.
- `npm run smoke` thêm các trang mới. Không ghi khoá thật vào test.

## 8. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Hồ sơ VNPay/MoMo bị từ chối hoặc chậm | Làm A1–A5 sớm; giữ COD và VietQR làm phương án chính tới khi có hợp đồng |
| IPN bị lỡ (mạng, Netlify lỗi) | Cổng tự gọi lại; tác vụ tra cứu lượt treo; nút "Tra cứu lại" ở quản trị |
| Giả mạo callback / sửa URL trả về | Chỉ IPN có chữ ký đúng mới đổi trạng thái; kiểm số tiền; webhook vận chuyển phải đọc lại trạng thái từ API hãng |
| API tính phí GHN chưa nhận địa chỉ mới | Bảng phí dự phòng; hỏi GHN; dùng GHTK nếu GHTK hỗ trợ |
| Cân nặng thiếu hoặc sai → thu thiếu phí ship | Bắt nhập trước khi bật tính phí thật; báo cáo chênh lệch phí ước tính và phí thật |
| Netlify Function bị giới hạn thời gian (khoảng 10–26 giây) | Mọi lời gọi đối tác có hạn 8 giây; việc nặng chạy ở tác vụ nền |
| CSDL dùng chung với nơi khác | Sửa CHECK theo hướng chỉ mở rộng; bảng mới kiểm tên trước; `IF NOT EXISTS` |

## 9. Cần chủ dự án quyết định

1. Dùng **VNPay + MoMo** như danh sách, hay chỉ VNPay trước (VNPay đã gồm QR của hầu hết ngân hàng và ví)?
2. Hãng giao hàng: **GHN trước, GHTK sau**, hay chỉ một hãng?
3. Đơn từ 1 triệu vẫn miễn phí ship (cửa hàng chịu phí thật)?
4. Đơn trả online chưa trả sau bao lâu thì tự huỷ (đề xuất 24 giờ)?
5. Giữ chuyển khoản VietQR tay song song hay bỏ khi đã có cổng?
6. Đã có hộ kinh doanh / công ty và tên miền chưa (quyết định thời điểm chạy thật)?
