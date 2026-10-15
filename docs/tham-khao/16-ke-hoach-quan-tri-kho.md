> Bản chữ trích tự động từ `word/Ke_hoach_quan_ly_kho_va_quan_tri_website_robot_collectibles.docx` (15/10/2026). Đây là tài liệu đầu vào của chủ dự án; các quyết định đã chốt và phần đã điều chỉnh nằm ở [../chuan/10-quan-tri-va-kho.md](../chuan/10-quan-tri-va-kho.md).

BẢN KẾ HOẠCH PHÂN TÍCH NGHIỆP VỤ
QUẢN LÝ KHO &QUẢN TRỊ WEBSITE
## Thương mại điện tử mô hình robot sưu tầm
Định hướng sản phẩm: Transformers • Super Sentai • Gundam • mô hình lắp ráp và robot collectible
| Mục tiêu thiết kế  Xây dựng một MVP đủ tin cậy để vận hành một kho hàng thực tế, đồng thời quản trị đầy đủ sản phẩm trưng bày, nội dung giao diện và thông tin khách hàng của website. Kiến trúc phải mở rộng được sang nhiều kho, mua bán nội địa và quy trình xuất nhập khẩu quốc tế mà không phải viết lại lõi dữ liệu. |

Phiên bản: 1.0  |  Ngày lập: 15/10/2026  |  Phạm vi: phân tích nghiệp vụ, MVP, lộ trình mở rộng và tiêu chí nghiệm thu
Tài liệu định hướng để thiết kế và triển khai. Các quy định pháp lý, thuế, hải quan và điều kiện kinh doanh phải được kiểm tra lại với nguồn chính thức/chuyên gia tại thời điểm vận hành thật.
# MỤC LỤC
1. Tóm tắt điều hành và nguyên tắc thiết kế
2. Phạm vi sản phẩm và ranh giới hai phân hệ
3. Vai trò người dùng và ma trận quyền
4. Phân hệ A — Quản lý kho: nghiệp vụ MVP
5. Quy trình kho từ đầu đến cuối
6. Phân hệ B — Quản trị website và bề mặt cửa hàng
7. Quản lý khách hàng và trải nghiệm mua sắm
8. Quy trình đơn hàng và điểm kết nối giữa hai phân hệ
9. Dữ liệu lõi và quy tắc nhất quán
10. Cấu trúc menu quản trị và các màn hình
11. Yêu cầu phi chức năng, bảo mật và vận hành
12. Báo cáo và chỉ số đo lường
13. Phân kỳ MVP và các giai đoạn mở rộng
14. Lộ trình triển khai 80 ngày
15. Tiêu chí nghiệm thu và kịch bản kiểm thử
16. Rủi ro, quyết định cần chốt và khuyến nghị
Phụ lục A. Danh sách trường dữ liệu đề xuất
Phụ lục B. Nguồn tham khảo và lưu ý tuân thủ
Cách đọc: ưu tiên chương 2–5 để chốt kho MVP; chương 6–8 để chốt quản trị website; chương 13–15 để xác định thứ tự triển khai và điều kiện nghiệm thu.
# 1. Tóm tắt điều hành và nguyên tắc thiết kế
Đề tài là website bán mô hình robot sưu tầm, không phải sàn nhiều người bán. Hệ thống cần tách rõ nghiệp vụ tồn kho vật lý khỏi cách sản phẩm được giới thiệu trên website. Một sản phẩm có thể có nhiều phiên bản/SKU, nhiều hình ảnh hoặc mô hình 3D; một SKU có tồn thực tế nhưng chưa chắc được phép bán online vì có thể bị khóa, giữ cho đơn khác, lỗi hộp hoặc đang kiểm kê.
## 1.1 Hai phân hệ chính
| Phân hệ | Trách nhiệm chính | Nguồn dữ liệu có thẩm quyền |
| Quản lý kho (Inventory/Warehouse) | Nhập hàng, xuất hàng, vị trí kệ, tồn thực tế, giữ hàng cho đơn, xử lý chênh lệch, kiểm kê, hàng lỗi/hoàn. | Sổ giao dịch tồn kho (inventory ledger); số dư tồn là số liệu tổng hợp từ các giao dịch đã xác nhận. |
| Quản trị website (E-commerce Admin/CMS) | Sản phẩm được trưng bày, danh mục, nội dung, giá bán, khuyến mãi, khách hàng, đánh giá, banner, menu, trang thông tin và cấu hình bề mặt cửa hàng. | Cơ sở dữ liệu sản phẩm/nội dung/khách hàng; trạng thái bán và giá công bố. |
| Lớp đơn hàng (Order orchestration) | Chuyển nhu cầu mua thành đơn, giữ hàng, giao việc lấy/đóng gói, gửi hàng, hủy và đổi trả. | Đơn hàng và các bản ghi giữ hàng/giao hàng liên kết đến kho và website. |

## 1.2 Nguyên tắc thiết kế bắt buộc
Một SKU phải có định danh duy nhất; không dùng tên sản phẩm làm khóa vì tên có thể thay đổi hoặc trùng.
Không sửa trực tiếp số tồn bằng cách gõ đè. Mọi biến động phải tạo chứng từ/giao dịch, có người thực hiện, thời điểm, lý do và tham chiếu.
Không trộn “sản phẩm” với “phiên bản bán được”. Ví dụ một mẫu robot có thể có bản thường, bản giới hạn, bản màu khác hoặc tình trạng hộp khác.
Phân biệt tồn thực tế, tồn đã giữ cho đơn, tồn khả dụng để bán, hàng lỗi/cách ly và hàng đang trên đường.
Trạng thái bản nháp/đã xuất bản của nội dung website tách biệt với tình trạng hàng còn hay hết.
Các thao tác quan trọng phải có lịch sử kiểm toán (audit log), kiểm soát quyền và xác nhận trước khi ghi sổ.
Ưu tiên luồng hoạt động rõ ràng, ổn định cho MVP; chỉ thêm tự động hóa/AI sau khi dữ liệu nền đáng tin cậy.
| Quyết định phạm vi nền tảng  MVP chỉ cần một kho vật lý nhưng mô hình dữ liệu nên có warehouse_id và location_id ngay từ đầu. Nhờ đó giai đoạn nhiều kho không phải thiết kế lại toàn bộ tồn kho. |

# 2. Phạm vi sản phẩm và ranh giới hai phân hệ
## 2.1 Mục tiêu MVP
Quản lý một kho thực: có sơ đồ vị trí kệ cơ bản, danh mục SKU, phiếu nhập, phiếu xuất, tồn kho, điều chỉnh có lý do, kiểm kê và xử lý hàng hoàn.
Trưng bày và bán sản phẩm trên website: quản lý thông tin, bộ ảnh/video/3D, giá, tồn khả dụng, danh mục, tìm kiếm/lọc, giỏ hàng và luồng đơn hàng cơ bản.
Quản lý thông tin khách hàng, địa chỉ, lịch sử mua, yêu thích, đánh giá và yêu cầu hỗ trợ ở mức vừa đủ.
Có dashboard và báo cáo cần thiết để chủ shop thấy tồn thấp, đơn chờ xử lý, sản phẩm bán chạy và hiệu quả nội dung.
Có cơ chế phân quyền, audit log, sao lưu, kiểm thử và hướng dẫn để nhân viên có thể vận hành mà không phải sửa dữ liệu trực tiếp trong cơ sở dữ liệu.
## 2.2 Không đưa vào MVP
Nhiều kho thực tế, tự động tối ưu vị trí lưu trữ, định tuyến chuyển kho hoặc quản lý kho bên thứ ba.
Tích hợp hải quan, hãng vận chuyển quốc tế, tự tính thuế/thuế nhập khẩu, chứng từ điện tử quốc tế hoặc khai báo tự động.
AI cá nhân hóa nâng cao, dự báo nhu cầu ML, định giá động và chatbot tự xử lý khiếu nại.
Sàn nhiều nhà bán, tài khoản người bán bên ngoài, đấu giá/đặt trước phức tạp hoặc mô hình ký gửi.
Ứng dụng di động riêng. Giao diện web responsive và khả năng quét mã vạch bằng thiết bị phù hợp là đủ cho MVP.
## 2.3 Ranh giới tránh chồng chéo
| Chủ đề | Nơi quản lý chính | Quy tắc |
| Tên, mô tả, ảnh, video, 3D, SEO | Quản trị website | Có thể lưu bản nháp và lên lịch xuất bản; không tự thay đổi tồn kho. |
| SKU, barcode, đơn vị, giá vốn, vị trí và trạng thái tồn | Quản lý kho/sản phẩm nền | SKU liên kết với sản phẩm trưng bày nhưng không phụ thuộc ảnh/banner. |
| Giá bán và chương trình giảm giá | Quản trị website | Giá vốn bị giới hạn theo quyền; lịch sử thay đổi giá được ghi lại. |
| Số lượng vật lý và khả dụng | Quản lý kho | Website đọc số khả dụng qua dịch vụ/API, không tự nhập số tồn. |
| Đơn hàng, thanh toán và vận chuyển | Lớp đơn hàng tích hợp | Đơn tạo giữ hàng; kho xuất khi đóng gói/gửi theo chính sách đã chốt. |
| Thông tin liên hệ, địa chỉ, đồng ý nhận tin | CRM/khách hàng | Chỉ thu thông tin cần thiết; ghi nhận trạng thái đồng ý và quyền truy cập. |
| Banner, trang chủ, menu, footer, chính sách | CMS/bề mặt website | Có xem trước và xuất bản; thay đổi cần quyền biên tập. |

# 3. Vai trò người dùng và ma trận quyền
MVP nên có phân quyền theo vai trò (RBAC), không dùng một tài khoản quản trị chung. Một người có thể có nhiều vai trò nếu cần; quyền đọc, tạo, sửa, xác nhận và hủy phải tách nhau đối với nghiệp vụ nhạy cảm.
| Vai trò | Quyền chính | Không nên được phép |
| Chủ hệ thống / Super Admin | Quản lý cấu hình, tài khoản, vai trò, báo cáo toàn hệ thống và xử lý ngoại lệ. | Không xóa dấu vết giao dịch đã ghi sổ; sửa sai phải bằng giao dịch đảo/điều chỉnh. |
| Quản lý kho | Tạo và xác nhận phiếu nhập/xuất, điều chuyển/kiểm kê trong phạm vi kho, xử lý chênh lệch theo hạn mức. | Sửa nội dung marketing hoặc thay quyền tài khoản. |
| Nhân viên kho | Quét mã, nhận hàng, lấy hàng, đóng gói, đề xuất số lượng thực đếm. | Tự xác nhận chênh lệch lớn hoặc tự duyệt giao dịch do chính mình tạo nếu yêu cầu kiểm soát kép. |
| Quản trị sản phẩm/merchandiser | Tạo sản phẩm/SKU, mô tả, media, danh mục, giá bán, chương trình và xuất bản sản phẩm. | Thay tồn kho vật lý hoặc xem giá vốn nếu không được cấp quyền. |
| Biên tập nội dung | Sửa banner, menu, trang CMS, FAQ, bài giới thiệu; xem trước và gửi duyệt. | Tự xuất bản nội dung nhạy cảm khi không có quyền duyệt. |
| Chăm sóc khách hàng | Tra cứu khách/đơn, cập nhật yêu cầu hỗ trợ, tạo đề xuất đổi trả theo chính sách. | Xem dữ liệu nhạy cảm không cần thiết, thay giá vốn hoặc sửa ledger. |
| Kế toán/đối soát (tùy MVP) | Đọc giá vốn, tổng giá trị nhập/xuất, chứng từ tham chiếu, đối soát thanh toán/giao hàng. | Ghi nhận biến động kho nếu không có vai trò kho. |
| Chỉ xem / giảng viên / kiểm thử | Đọc dữ liệu đã được cấp phép, xem báo cáo demo. | Thay đổi dữ liệu sản xuất. |

## 3.1 Kiểm soát tối thiểu
Bắt buộc xác thực tài khoản; mật khẩu băm an toàn; hỗ trợ đăng xuất và thu hồi phiên.
Ghi audit log cho đăng nhập quản trị, thay giá, xuất bản nội dung, xác nhận phiếu, điều chỉnh tồn, hoàn tiền/hủy đơn và thay quyền.
Với điều chỉnh tồn, hủy phiếu đã ghi sổ hoặc thay đổi giá hàng loạt: yêu cầu lý do; có thể yêu cầu người thứ hai duyệt.
Không hiển thị thông tin cá nhân/giá vốn trong danh sách mà người dùng không có quyền xem.
# 4. Phân hệ A — Quản lý kho: nghiệp vụ MVP
## 4.1 Danh mục nền cần có
| Đối tượng | Trường dữ liệu MVP | Ghi chú nghiệp vụ |
| Sản phẩm / SKU | product_id, sku_code, barcode, tên chuẩn, thương hiệu/series, model/edition, tình trạng mới/cũ, đơn vị, trọng lượng/kích thước nếu có, trạng thái kinh doanh. | Một sản phẩm có thể có nhiều SKU. Không tái sử dụng mã SKU đã ngừng dùng cho một món khác. |
| Kho | warehouse_id, tên kho, địa chỉ, trạng thái. | MVP có 1 kho; vẫn giữ khóa warehouse_id trong giao dịch. |
| Vị trí lưu trữ | location_id, mã khu/kệ/tầng/ô, loại vị trí, sức chứa tùy chọn, trạng thái. | Ví dụ A-01-02-03; hỗ trợ xác định chính xác nơi cất/lấy. |
| Nhà cung cấp | supplier_id, tên, liên hệ, địa chỉ, thông tin thanh toán tham chiếu, trạng thái. | Chỉ lưu trường cần thiết cho nghiệp vụ; dữ liệu thuế/pháp lý có thể bổ sung sau. |
| Lý do nhập/xuất/điều chỉnh | reason_code, tên, bắt buộc ghi chú?, cần duyệt? | Ví dụ nhập mua, hàng trả về, xuất đơn, hư hỏng, mất mát, hàng mẫu, kiểm kê. |
| Lô/serial (có điều kiện) | lot_id/serial_no, ngày nhận, nhà cung cấp, giá vốn, tình trạng/phiên bản. | Không bắt buộc quét serial từng món trong MVP; nên thiết kế để bật cho bản giới hạn/giá trị cao. |

## 4.2 Quy tắc tính tồn
| Công thức khuyến nghị  Tồn khả dụng = Tồn thực tế có thể bán − Số lượng đang giữ cho đơn − Số lượng bị cách ly/không bán. Hàng đang trên đường không được cộng vào tồn thực tế; có thể hiển thị riêng là “dự kiến nhận”. |

| Chỉ số | Ý nghĩa | Dùng cho |
| On-hand / Tồn thực tế | Số lượng đã nhận và chưa xuất khỏi kho, kể cả nếu một phần đang chờ kiểm định. | Đối soát với kiểm kê vật lý. |
| Reserved / Đã giữ | Số lượng được giữ để phục vụ đơn chưa xuất kho. | Ngăn hai khách mua cùng một món cuối cùng. |
| Available / Khả dụng | Số lượng có thể cam kết bán tiếp. | Website hiển thị còn hàng/cho phép đặt mua. |
| Quarantine / Cách ly | Hàng hỏng, nghi vấn, thiếu phụ kiện hoặc chờ kiểm định. | Không cho bán cho tới khi có quyết định. |
| Inbound / Dự kiến nhận | Hàng đã đặt/mua hoặc gửi về nhưng chưa hoàn tất nhận kho. | Dự báo vận hành; không hiển thị như hàng sẵn có. |

Cần chốt chính sách chính xác: thời điểm giữ hàng khi đơn được tạo, thanh toán thành công hay xác nhận COD. Khuyến nghị giữ khi đơn được xác nhận theo phương thức thanh toán; hủy/timeout thì giải phóng; chỉ ghi xuất kho vật lý khi đã xác nhận bàn giao cho đơn vị vận chuyển hoặc mốc xuất kho nội bộ được quy định.
## 4.3 Phiếu nhập kho
Mục tiêu: ghi lại hàng thực tế đi vào kho, có nguồn và chứng từ tham chiếu; không cho phiếu nháp ảnh hưởng số tồn.
| Bước | Hành động | Kiểm soát / trạng thái |
| 1. Tạo phiếu | Chọn loại nhập: mua từ nhà cung cấp, hàng khách trả, nhập điều chỉnh, hàng chuyển từ kho khác (giai đoạn sau). Nhập nhà cung cấp/đơn tham chiếu/ngày dự kiến. | Trạng thái Draft; chưa tác động tồn. |
| 2. Thêm dòng SKU | Quét/tìm SKU, vị trí nhận, số lượng dự kiến, giá vốn hoặc giá nhận, ghi chú tình trạng. | Kiểm tra SKU hợp lệ, đơn vị, số lượng dương. |
| 3. Nhận và đếm | Nhập số thực nhận theo từng dòng; có thể ghi thiếu/thừa/hư hỏng; đính kèm ảnh/chứng từ. | Không tự ghi nhận đúng bằng số dự kiến nếu thực tế khác. |
| 4. Kiểm tra | Đối chiếu tổng số, tình trạng bao bì, nhãn, phụ kiện; đưa hàng nghi vấn vào vị trí cách ly. | Có thể cần quản lý kho duyệt khi chênh lệch vượt ngưỡng. |
| 5. Xác nhận nhập | Người có quyền xác nhận; hệ thống tạo ledger transaction cho số thực nhận được chấp nhận. | Tạo số tham chiếu duy nhất; ghi người và thời điểm; chống xác nhận lặp. |
| 6. Hoàn tất | In/xuất phiếu; cập nhật số tồn; ghi nhận dòng chênh lệch để xử lý với nhà cung cấp. | Phiếu đã ghi sổ không được sửa xóa trực tiếp; sửa sai bằng phiếu đảo/điều chỉnh. |

## 4.4 Phiếu xuất kho
| Bước | Hành động | Kiểm soát / trạng thái |
| 1. Chọn nguồn xuất | Ưu tiên xuất theo đơn hàng đã được xác nhận; loại khác: hàng mẫu, hư hỏng, nội bộ, trả nhà cung cấp. | Mọi xuất phải có reason_code; xuất bán liên kết order_id. |
| 2. Tạo nhiệm vụ lấy hàng | Danh sách SKU, số lượng, vị trí, thứ tự lấy; nhân viên quét SKU/vị trí nếu thiết bị cho phép. | Không lấy vượt số lượng yêu cầu; cảnh báo sai SKU hoặc sai vị trí. |
| 3. Xác nhận lấy hàng | Ghi lượng đã lấy, thiếu hàng, sai vị trí hoặc tình trạng khác thực tế. | Thiếu hàng đưa đơn vào xử lý ngoại lệ; không âm tồn. |
| 4. Đóng gói | Xác nhận số lượng thực đóng, tình trạng hộp, phụ kiện; ghi mã kiện/khối lượng nếu có. | Hàng giới hạn/giá trị cao có thể yêu cầu ảnh bằng chứng. |
| 5. Ghi xuất/bàn giao | Khi đạt mốc xuất kho đã quy định, ghi ledger xuất kho và liên kết shipment/tracking nếu có. | Chỉ ghi một lần; retry API không được xuất trùng. |
| 6. Đối soát | Theo dõi đơn đã xuất nhưng chưa bàn giao, thất lạc, hoàn về hoặc giao thất bại. | Phân biệt “xuất kho” với “đã giao cho khách”. |

## 4.5 Điều chỉnh và kiểm kê
Điều chỉnh tồn phải có loại lý do, số lượng tăng/giảm, vị trí, bằng chứng hoặc ghi chú, người tạo và người duyệt nếu vượt hạn mức.
Kiểm kê MVP: tạo phiên kiểm kê toàn kho hoặc một số vị trí; hệ thống lưu số kỳ vọng nhưng nhân viên nhập số thực đếm; người kiểm kê không nên bị sửa số kỳ vọng trong lúc đếm.
Khi chênh lệch được duyệt, hệ thống tạo giao dịch điều chỉnh cho phần chênh; lưu số trước/sau và lý do.
Không dùng thao tác “xóa dòng tồn kho” để chữa sai. Mọi sửa chữa phải truy vết được đến giao dịch gốc và giao dịch đảo/điều chỉnh.
Hàng đổi trả về kho phải qua trạng thái kiểm tra: bán lại được, cần vệ sinh/đóng gói, thiếu phụ kiện, hư hỏng hoặc cách ly.
## 4.6 Báo cáo kho MVP
| Báo cáo | Nội dung | Ưu tiên |
| Tồn hiện tại | SKU, kho, vị trí, tồn thực tế, đã giữ, khả dụng, cách ly. | P0 |
| Thẻ kho / nhật ký biến động | Từng giao dịch nhập/xuất/điều chỉnh theo thời gian, người thực hiện, chứng từ. | P0 |
| Phiếu chờ xử lý | Phiếu nháp, chờ duyệt, nhận thiếu, đơn chờ lấy/đóng gói/bàn giao. | P0 |
| Cảnh báo sắp hết | SKU khả dụng dưới ngưỡng cấu hình; top sản phẩm đã hết hàng nhưng đang hiển thị. | P1 |
| Tuổi tồn kho | Số ngày từ lần nhập gần nhất/đợt nhập; hàng lâu không bán. | P1 |
| Giá trị tồn kho | Số lượng × giá vốn được chọn theo chính sách kế toán; xem bởi vai trò được cấp. | P1; cần chốt phương pháp tính giá vốn với kế toán. |

# 5. Quy trình kho từ đầu đến cuối
## 5.1 Nhập hàng mua trong nước
1. Tạo nhà cung cấp và tham chiếu đơn mua/phiếu giao hàng.
2. Tạo phiếu nhập nháp; thêm SKU, số lượng dự kiến và vị trí nhận.
3. Đếm thực tế; phân loại hàng nguyên vẹn, hỏng hoặc sai phiên bản.
4. Quản lý duyệt chênh lệch (nếu có), xác nhận phiếu nhập.
5. Hệ thống ghi sổ tồn, cập nhật khả dụng, cập nhật giá vốn theo quy tắc đã định, lưu chứng từ.
6. Nếu hàng mới chưa có trang sản phẩm, tồn kho vẫn được lưu nhưng chưa được bán online.
## 5.2 Bán online → giữ hàng → lấy/đóng gói → xuất kho
1. Khách đặt hàng; hệ thống kiểm tra khả dụng và tạo đơn.
2. Theo chính sách thanh toán, hệ thống tạo reservation cho từng dòng SKU trong một giao dịch nguyên tử hoặc cơ chế khóa phù hợp.
3. Đơn được xác nhận, tạo danh sách lấy hàng; nhân viên lấy đúng SKU/vị trí, ghi nhận ngoại lệ.
4. Nhân viên đóng gói, xác nhận hàng đúng và chuyển trạng thái tới mốc “sẵn sàng bàn giao”.
5. Hệ thống ghi xuất kho một lần; cập nhật tồn thực tế và giải phóng reservation tương ứng.
6. Tracking/đơn vị vận chuyển được ghi nhận; trạng thái “đã giao” chỉ khi có xác nhận giao hàng, không phải lúc xuất kho.
7. Nếu hủy trước xuất kho: giải phóng reservation. Nếu hủy sau xuất kho: xử lý như hoàn/thu hồi, không tự cộng lại tồn ngay.
## 5.3 Hàng khách trả
1. Tiếp nhận yêu cầu trả/đổi gắn với order_id và dòng order_item.
2. Ghi số lượng nhận về; kho chưa được cộng vào khả dụng ngay.
3. Kiểm tra seal, hộp, phụ kiện, tình trạng mô hình và đối chiếu mã SKU/serial nếu có.
4. Ra quyết định: nhập lại hàng bán được; nhập cách ly; đưa vào hàng lỗi; hoặc từ chối nhập kho nếu chưa thực nhận.
5. Xử lý hoàn tiền/đổi mới ở lớp đơn hàng; kho và tài chính phải liên kết cùng mã yêu cầu trả.
## 5.4 Xử lý ngoại lệ cần có ngay trong MVP
| Tình huống | Hành vi hệ thống mong muốn |
| Đơn đồng thời mua món cuối cùng | Chỉ số lượng hợp lệ được giữ; đơn còn lại báo hết hàng hoặc yêu cầu xác nhận lại. |
| Nhân viên nhận thiếu so với chứng từ | Lưu số thực nhận; tạo chênh lệch cần xử lý; không tự ghi số dự kiến. |
| Quét nhầm SKU khi lấy hàng | Chặn xác nhận hoặc yêu cầu đổi đúng SKU; ghi log sự kiện. |
| Phiếu nhập/xuất gửi xác nhận hai lần | Idempotency/request key hoặc trạng thái giao dịch ngăn tạo ledger trùng. |
| Khách hủy đơn | Nếu chưa xuất: giải phóng reservation; nếu đã xuất: luồng hoàn/thu hồi. |
| Mất kết nối khi quét kho | Cho phép lưu nháp cục bộ chỉ khi được thiết kế rõ; tuyệt đối không báo đã ghi sổ nếu máy chủ chưa xác nhận. |
| Hàng lỗi sau khi đã nhập | Di chuyển trạng thái/khoảng tồn sang cách ly qua giao dịch; không xóa lịch sử nhập ban đầu. |

# 6. Phân hệ B — Quản trị website và bề mặt cửa hàng
## 6.1 Quản lý sản phẩm trưng bày
Nên tách “hồ sơ sản phẩm” (Product) khỏi “phiên bản bán được” (SKU/Variant). Ví dụ hồ sơ “Robot Series X” có các phiên bản standard, limited edition, màu khác hoặc bản có phụ kiện khác. Từng phiên bản có SKU, barcode, giá bán, trạng thái hàng và có thể có bộ ảnh/video riêng.
| Nhóm thông tin | Trường / năng lực cần có | Yêu cầu MVP |
| Thông tin cơ bản | Tên hiển thị, slug URL, SKU/variant liên kết, thương hiệu, series/franchise, dòng sản phẩm, nhà sản xuất, mã model. | Có tên, slug duy nhất, SKU, trạng thái bản nháp/đã xuất bản. |
| Thuộc tính collectible | Loại: figure/model kit/transforming robot; scale/kích thước; chất liệu; độ tuổi theo nhãn nhà sản xuất; edition; ngày phát hành; tình trạng sealed/open-box/pre-owned nếu kinh doanh. | Các trường tùy chọn; chỉ hiển thị trường có dữ liệu, tránh nhãn “không rõ” trên storefront. |
| Mô tả | Mô tả ngắn, mô tả chi tiết, thông số, nội dung hộp, phụ kiện đi kèm, lưu ý lắp ráp/bảo quản. | Editor an toàn; xem trước trên desktop/mobile. |
| Media | Ảnh bìa, thư viện ảnh, video, ảnh chi tiết hộp, mô hình 3D GLB/GLTF nếu có. | Ảnh nhiều góc là P0; video/3D có thể P1 nhưng phải có fallback ảnh. |
| Giá và khuyến mãi | Giá bán, giá so sánh, khoảng thời gian khuyến mãi, mã giảm giá đủ điều kiện. | MVP có giá cơ bản; lưu lịch sử thay đổi và người sửa. |
| Trạng thái bán | Draft, review, published, hidden/archived; còn hàng/hết hàng/đặt trước (nếu bật). | Không tự xuất bản khi kho vừa nhập; cần thao tác xuất bản riêng. |
| SEO và chia sẻ | Meta title/description, ảnh chia sẻ, canonical tùy nhu cầu, slug, alt text ảnh. | P1; slug nên ổn định và có cơ chế chuyển hướng khi đổi. |
| Phân loại và gợi ý | Danh mục, thương hiệu, series, tags, liên quan/cùng series/bộ sưu tập. | Danh mục + bộ lọc nền là P0/P1; quan hệ nâng cao sau. |

## 6.2 Danh mục, thương hiệu và bộ sưu tập
Danh mục điều hướng theo loại: robot biến hình, mô hình lắp ráp, figure, phụ kiện; có thể kết hợp theo series/thương hiệu như Transformers, Super Sentai, Gundam.
Không thiết kế cây danh mục cứng chỉ có một đường đi. Sản phẩm có thể được gắn vào danh mục, thương hiệu, series, bộ sưu tập, tag và landing page khác nhau.
Bộ lọc có thể gồm giá, thương hiệu, series, loại sản phẩm, scale/kích thước, tình trạng hộp, còn hàng, phiên bản giới hạn và ngày phát hành.
Quản trị viên phải xem trước kết quả danh mục trước khi công bố; tránh trang danh mục rỗng do bộ lọc hoặc mapping sai.
## 6.3 Bề mặt website / CMS
| Khu vực storefront | Cấu hình được trong Admin | Yêu cầu an toàn/vận hành |
| Trang chủ | Hero/banner, headline, CTA, sản phẩm nổi bật, series nổi bật, hàng mới về, bộ sưu tập, nội dung biên tập. | Kéo-thả đơn giản hoặc chọn vị trí có sẵn; giới hạn kích thước media; xem trước trước khi xuất bản. |
| Header và điều hướng | Logo, menu chính, danh mục, liên kết series, thanh thông báo, tìm kiếm. | Không để liên kết trỏ tới trang chưa tồn tại; cho phép bật/tắt mục. |
| Trang danh mục / series | Ảnh bìa, mô tả, thứ tự sản phẩm, bộ lọc, nội dung SEO. | Sắp xếp thủ công hoặc theo mới nhất/giá/phổ biến; luôn có trạng thái rỗng hữu ích. |
| Trang chi tiết sản phẩm | Thứ tự ảnh, nội dung chi tiết, bảng thông số, nội dung hộp, hàng liên quan, 3D viewer. | Giá/tồn lấy từ dữ liệu chuẩn; 3D không được chặn nút mua hoặc làm trang không tải được. |
| Banner và chiến dịch | Ảnh desktop/mobile, thời gian bắt đầu/kết thúc, URL đích, trạng thái. | Tự ẩn khi hết hạn; chặn lịch kết thúc trước ngày bắt đầu; xác thực link. |
| Trang thông tin | Giới thiệu, liên hệ, FAQ, vận chuyển, đổi trả/bảo hành, chính sách bảo mật và điều khoản. | Có phiên bản, ngày hiệu lực, người xuất bản; nội dung pháp lý cần người có thẩm quyền duyệt. |
| Footer | Liên kết hỗ trợ, thông tin liên hệ, social, đăng ký nhận tin nếu triển khai. | Không thu email/đồng ý tiếp thị theo mặc định; ghi nhận consent. |
| Thông báo website | Thanh thông báo vận chuyển, lịch nghỉ, cảnh báo đặt trước/hết hàng. | Có giới hạn hiển thị, thời gian hiệu lực và xem trước. |

## 6.4 Tìm kiếm, lọc và sắp xếp
Tìm theo tên, SKU, series, thương hiệu và từ đồng nghĩa thông dụng; MVP có thể dùng tìm kiếm full-text của hệ quản trị cơ sở dữ liệu.
Bộ lọc phải phản ánh thuộc tính thật có dữ liệu; không đưa tùy chọn lọc mà không có sản phẩm phù hợp.
Sắp xếp tối thiểu: liên quan/mặc định, mới nhất, giá tăng/giảm. “Phổ biến” chỉ dùng khi định nghĩa rõ theo đơn/số lượng bán và khoảng thời gian.
Có trang kết quả rỗng, gợi ý xóa bộ lọc hoặc xem danh mục gần nhất; không coi mọi tìm kiếm không có kết quả là lỗi hệ thống.
## 6.5 Khuyến mãi và merchandising
| Chức năng | MVP | Mở rộng |
| Giảm giá trực tiếp | Giá bán hiện hành, thời gian hiệu lực nếu cần. | Lịch giá, tự lên lịch nhiều đợt, duyệt hai bước. |
| Mã giảm giá | Mã theo giá trị cố định hoặc phần trăm; ngày hiệu lực; số lần dùng; đơn tối thiểu; phạm vi SKU/danh mục. | Phân khúc khách, giới hạn theo khách, phối hợp nhiều ưu đãi, quy tắc chống lạm dụng. |
| Sản phẩm nổi bật | Chọn thủ công sản phẩm cho homepage/landing page. | Tự chọn dựa trên dữ liệu, A/B testing, tối ưu chuyển đổi. |
| Hàng sắp về / đặt trước | Chỉ bật khi có chính sách rõ, ETA và giới hạn số lượng. | Đặt cọc, giới hạn theo khách, đồng bộ nhà cung cấp và thông báo tự động. |

# 7. Quản lý khách hàng và trải nghiệm mua sắm
## 7.1 Hồ sơ khách hàng
| Nhóm | Thông tin / thao tác | Giới hạn dữ liệu |
| Định danh | customer_id, tên hiển thị, email/số điện thoại nếu khách cung cấp, trạng thái tài khoản, ngày tạo. | Không bắt buộc tạo tài khoản để duyệt sản phẩm; khách vãng lai vẫn có thể được lưu hồ sơ đơn tối thiểu. |
| Địa chỉ | Nhiều địa chỉ giao hàng, người nhận, số điện thoại, tỉnh/thành, địa chỉ chi tiết, nhãn nhà/đơn vị. | Chỉ nhân sự xử lý đơn được xem địa chỉ đầy đủ khi cần. |
| Lịch sử mua | Đơn, trạng thái, SKU, tổng tiền, thanh toán, giao hàng và yêu cầu trả. | Chỉ hiển thị đúng phạm vi quyền; thông tin thanh toán nhạy cảm không lưu nếu không cần. |
| Sở thích | Danh sách yêu thích, series quan tâm, sản phẩm xem gần đây nếu có cơ sở hợp lệ. | Nêu rõ mục đích; cho khách xóa/điều chỉnh sở thích khi phù hợp. |
| Liên hệ hỗ trợ | Yêu cầu hỗ trợ, mã ticket, nội dung, trạng thái, người xử lý, lịch sử trao đổi. | Không lưu thông tin nhạy cảm không liên quan; giới hạn quyền xem. |
| Consent / marketing | Đồng ý nhận email/thông báo, nguồn và thời điểm đồng ý, rút lại đồng ý. | Không mặc định opt-in; lưu bằng chứng và tôn trọng yêu cầu ngừng nhận tin. |
| Đánh giá | Rating, nội dung, ảnh nếu hỗ trợ, SKU/đơn đã mua nếu xác minh, trạng thái duyệt. | Có kiểm duyệt spam/ngôn từ không phù hợp; không tự xóa đánh giá tiêu cực chỉ vì tiêu cực. |

## 7.2 Tính năng khách hàng trên website
Tài khoản/đăng nhập và khôi phục quyền truy cập theo luồng bảo mật; cho phép mua như khách nếu phù hợp mô hình kinh doanh.
Giỏ hàng giữ qua lần truy cập trong giới hạn hợp lý; giá và tồn phải được xác minh lại khi checkout.
Yêu thích/wishlist để lưu model/series cần sưu tầm; có thể là tính năng P1 nếu MVP cần tối giản.
Lịch sử đơn và theo dõi trạng thái; thông báo thay đổi đơn phải phù hợp đồng ý và kênh liên lạc.
Đánh giá sản phẩm có cơ chế báo cáo, duyệt và chống spam cơ bản.
Form liên hệ/yêu cầu hỗ trợ có mã yêu cầu, trạng thái xử lý và phản hồi; không nên chỉ gửi email rồi không có lịch sử.
Khi hết hàng: cho khách lưu sản phẩm hoặc đăng ký báo khi có hàng nếu đã xin phép nhận thông báo; không hứa ETA khi chưa có dữ liệu chắc chắn.
## 7.3 Chân dung khách hàng phục vụ thiết kế
| Nhóm người mua | Điều họ cần thấy | Tác động đến chức năng |
| Người sưu tầm theo series | Series, phiên bản, độ hiếm/edition, tình trạng hộp, phụ kiện, hàng chính hãng theo bằng chứng có sẵn. | Bộ lọc series, thông số rõ, media thật và chính sách hàng hóa minh bạch. |
| Người mới bắt đầu | Mô tả dễ hiểu, kích thước, loại sản phẩm, độ khó lắp ráp, nội dung hộp. | FAQ, nhãn cấp độ/loại sản phẩm chỉ dựa trên thông tin xác thực. |
| Người so sánh giá | Giá hiện tại, phí vận chuyển, chương trình đang áp dụng, tồn khả dụng. | Giá hiển thị rõ, khuyến mãi minh bạch, không che phí quan trọng tới sát bước cuối. |
| Khách mua làm quà | Tình trạng hộp, thời gian giao dự kiến, gói quà nếu có, chính sách trả hàng. | Thông tin đóng gói/dự kiến giao là cấu hình riêng, tránh cam kết vượt năng lực. |
| Khách hàng quay lại | Đơn cũ, wishlist, series mới ra, sản phẩm liên quan. | Lịch sử mua, yêu thích; cá nhân hóa nâng cao để giai đoạn sau. |

# 8. Quy trình đơn hàng và điểm kết nối hai phân hệ
Dù yêu cầu tập trung vào kho và quản trị website, MVP vẫn cần một lớp đơn hàng đủ rõ để liên kết chúng. Nếu không, tồn kho dễ bị trừ sai, đơn bị trùng hoặc nhân viên không biết hàng nào cần lấy.
## 8.1 Trạng thái đơn hàng đề xuất
| Trạng thái | Ý nghĩa | Tác động tồn kho |
| Draft / Cart | Khách đang mua, chưa đặt thành đơn. | Chưa giữ hàng dài hạn; checkout phải kiểm tra lại. |
| Placed / Chờ xác nhận | Đơn đã được tạo nhưng còn kiểm tra thanh toán/thông tin. | Theo chính sách, chưa giữ hoặc giữ tạm có TTL rõ. |
| Confirmed / Đã xác nhận | Đơn hợp lệ theo phương thức thanh toán. | Tạo reservation; số khả dụng giảm nhưng tồn vật lý chưa giảm. |
| Picking / Đang lấy hàng | Kho chuẩn bị hàng. | Reservation tiếp tục có hiệu lực. |
| Packed / Đã đóng gói | Đã xác minh hàng và kiện. | Chưa ghi xuất nếu quy trình chưa bàn giao. |
| Shipped / Đã xuất/bàn giao | Kho đã giao cho vận chuyển hoặc mốc chính thức được định nghĩa. | Ghi xuất kho; giảm tồn thực tế và giải phóng reservation tương ứng. |
| Delivered / Đã giao | Có xác nhận giao tới khách. | Không tác động tồn thêm. |
| Cancelled / Đã hủy | Đơn bị hủy trước khi giao hoàn tất. | Giải phóng reservation nếu chưa xuất; nếu đã xuất phải theo luồng thu hồi/hoàn. |
| Return requested / Đang trả | Khách gửi yêu cầu trả hàng. | Không cộng lại tồn vì mới chỉ yêu cầu. |
| Returned / Đã nhận hàng trả | Kho đã nhận và kiểm định. | Chỉ cộng khả dụng khi hàng được xác nhận bán lại được; loại khác vào cách ly. |

## 8.2 Quy tắc tích hợp kỹ thuật
Website không được tự quyết định tồn còn dựa trên cache cũ ở thời điểm xác nhận đơn; cần kiểm tra phía dịch vụ tồn/reservation.
Mỗi đơn có order_id ổn định; mỗi dòng có order_item_id và sku_id; giao dịch kho tham chiếu mã đơn/dòng đơn.
Các lệnh xác nhận thanh toán, hủy, xuất kho và webhook từ hãng vận chuyển phải idempotent để gửi lại không tạo giao dịch trùng.
Khi dịch vụ kho tạm thời lỗi, checkout phải báo thử lại/đang kiểm tra; tuyệt đối không báo đặt hàng thành công nếu chưa có kết quả nhất quán theo thiết kế.
Có tác vụ đối soát định kỳ: đơn đã xác nhận nhưng chưa giữ, đơn đã xuất nhưng chưa cập nhật vận chuyển, reservation quá hạn, SKU âm hoặc số tồn khác nhau giữa ledger và số dư tổng hợp.
# 9. Dữ liệu lõi và quy tắc nhất quán
## 9.1 Thực thể dữ liệu đề xuất
| Thực thể | Trường/quan hệ quan trọng | Vai trò |
| Product | product_id, name, slug, brand_id, series_id, category links, description, publication_status. | Hồ sơ nội dung/câu chuyện sản phẩm. |
| SKU / ProductVariant | sku_id, product_id, sku_code, barcode, attributes_json, status, price reference, condition. | Đơn vị bán và quản lý tồn. |
| MediaAsset | asset_id, type, URL/storage key, alt, sort order, file size, processing status. | Ảnh/video/3D liên kết Product hoặc SKU. |
| Warehouse / Location | warehouse_id, location_id, code, type, status. | Kho và vị trí lưu hàng. |
| InventoryLedger | transaction_id, sku_id, warehouse_id, location_id, qty_delta, transaction_type, reference_type/id, actor, timestamp. | Sổ ghi nhận bất biến mọi biến động. |
| InventoryBalance | sku_id, warehouse_id, location_id, on_hand, reserved, quarantined, version. | Bản tổng hợp/cache; phải đối soát được với ledger/reservations. |
| InventoryDocument / Line | doc_id, doc_type, status, supplier/reference, lines, totals, approval fields. | Phiếu nhập, xuất, điều chỉnh, kiểm kê. |
| Customer / Address / Consent | customer_id, contacts, address list, consent records. | Thông tin người mua và tùy chọn liên lạc. |
| Cart / CartLine | cart_id, customer_id/guest token, sku_id, qty, latest price view. | Giỏ hàng; phải xác minh lại khi checkout. |
| Order / OrderLine | order_id, status, amounts, customer snapshot, sku, qty, unit_price, discounts. | Bản ghi giao dịch mua. |
| Reservation | reservation_id, order_id, sku_id, qty, status, expires_at. | Giữ tồn cho đơn; giải phóng/tiêu thụ rõ ràng. |
| Shipment / Return | shipment_id, order_id, carrier, tracking, status; return_id, order_item_id, qty, inspection result. | Theo dõi giao hàng và hàng hoàn. |
| Promotion / Coupon | rule, start/end, eligibility, limits, usage. | Tính giá bán/khuyến mãi. |
| CMSPage / Banner / Navigation | content, position, dates, publication status, target URL. | Quản trị bề mặt cửa hàng. |
| AuditLog | actor, action, entity, before/after summary, timestamp, request_id. | Truy vết thao tác quản trị. |

## 9.2 Quy tắc dữ liệu quan trọng
Khóa ngoại: order line phải tham chiếu SKU; inventory transaction phải tham chiếu SKU và kho; hàng hoàn phải tham chiếu đơn/dòng đơn khi có nguồn từ bán hàng.
Giá đơn hàng phải là snapshot tại thời điểm đặt hàng; khi giá sản phẩm đổi về sau, không được làm thay đổi đơn cũ.
Tồn kho phải dùng số nguyên hoặc đơn vị đo được quy định; tránh số thập phân ngoài trường hợp sản phẩm bán theo đơn vị đo đặc thù.
Đơn vị tiền tệ phải lưu rõ mã tiền tệ khi mở rộng quốc tế; không dùng số tiền không kèm currency code.
Ngày giờ lưu theo chuẩn thống nhất và hiển thị theo múi giờ cấu hình; lưu created_at, confirmed_at, posted_at và actor cần thiết.
Ẩn/ngừng kinh doanh sản phẩm không được làm mất lịch sử SKU trong đơn hàng cũ.
Đính kèm ảnh/chứng từ nên lưu bằng storage object riêng, trong database chỉ lưu metadata và đường dẫn có kiểm soát quyền.
# 10. Cấu trúc menu quản trị và các màn hình
## 10.1 Menu quản trị đề xuất
| Menu cấp 1 | Màn hình cấp 2 | Chỉ số/CTA trọng tâm |
| Tổng quan | Dashboard kho; Dashboard cửa hàng | Đơn cần xử lý, phiếu chờ duyệt, hàng sắp hết, lỗi đồng bộ, hiệu quả bán. |
| Kho | Tồn kho; Vị trí kho; Phiếu nhập; Phiếu xuất; Kiểm kê; Điều chỉnh; Thẻ kho; Hàng cách ly | Tạo phiếu, quét mã, xác nhận, tra cứu lịch sử. |
| Danh mục hàng | Sản phẩm; SKU/phiên bản; Thương hiệu; Series; Danh mục; Nhà cung cấp | Tạo SKU, liên kết product, trạng thái bán. |
| Cửa hàng trực tuyến | Trang chủ; Banner; Menu; Landing page; CMS pages; Footer; SEO | Xem trước, lên lịch, xuất bản. |
| Bán hàng | Đơn hàng; Thanh toán; Giao hàng; Trả/đổi; Mã giảm giá | Xác nhận đơn, lấy hàng, theo dõi, xử lý ngoại lệ. |
| Khách hàng | Danh sách khách; Hồ sơ khách; Wishlist; Đánh giá; Yêu cầu hỗ trợ; Consent | Tra cứu an toàn, trả lời và theo dõi ticket. |
| Báo cáo | Bán hàng; Tồn kho; Hiệu quả sản phẩm; Hoạt động admin | Lọc ngày, xuất CSV/XLSX theo quyền. |
| Cài đặt | Người dùng và vai trò; Cấu hình kho; Vận chuyển; Thanh toán; Thông báo; Audit log | Cấu hình có kiểm soát, xác nhận thao tác nhạy cảm. |

## 10.2 Wireframe mức chức năng
Dashboard kho: dải chỉ số Tồn khả dụng / Đơn chờ lấy / Phiếu nhập chờ xác nhận / SKU dưới ngưỡng; bên dưới là danh sách việc cần làm và giao dịch gần đây. Mỗi thẻ dẫn tới danh sách đã lọc, không chỉ là con số trang trí.
Màn hình danh sách tồn: ô tìm SKU/barcode, lọc kho/vị trí/brand/series/trạng thái, cột Tồn thực tế–Đã giữ–Khả dụng–Cách ly, hành động xem thẻ kho/điều chỉnh (nếu có quyền).
Màn hình sản phẩm: tab Thông tin cơ bản / Biến thể-SKU / Media / Giá / SEO / Xem trước. Nút Lưu nháp, Gửi duyệt/Đăng, Lưu và xem trước; cảnh báo khi thiếu trường bắt buộc hoặc media chưa sẵn sàng.
Dashboard website: số đơn hôm nay, doanh số theo trạng thái, tỷ lệ đơn bị hết hàng/hủy, sản phẩm bán chạy, sản phẩm có tồn thấp nhưng đang được quảng bá, banner sắp hết lịch.
# 11. Yêu cầu phi chức năng, bảo mật và vận hành
| Hạng mục | Yêu cầu tối thiểu đề xuất | Cách kiểm chứng |
| Tính đúng tồn kho | Không âm tồn do race condition; không ghi trùng khi request retry; đối soát ledger/balance. | Test đặt đồng thời, gửi lặp request, hủy và hoàn. |
| Phân quyền | Kiểm tra quyền tại backend/API, không chỉ ẩn nút giao diện. | Thử gọi trực tiếp API bằng vai trò không đủ quyền. |
| Audit trail | Ghi hành động nhạy cảm: ai, khi nào, đối tượng, thay đổi, lý do/request id. | Tạo phiếu/đổi giá/đăng banner rồi kiểm tra log. |
| Khôi phục dữ liệu | Sao lưu database theo lịch; có hướng dẫn khôi phục và xác minh backup. | Diễn tập khôi phục vào môi trường thử nghiệm. |
| Hiệu năng | Danh sách lớn phải phân trang, lọc phía server; ảnh/3D tải tối ưu. | Test 1.000+ SKU giả lập; kiểm tra thời gian tải trang theo ngưỡng dự án. |
| Khả năng truy cập | Bàn phím, nhãn form, tương phản, thông báo lỗi rõ; giao diện responsive. | Kiểm thử desktop, tablet/mobile và thao tác bàn phím. |
| Bảo mật media | Chặn file loại không hỗ trợ, giới hạn kích thước, scan/kiểm tra file; URL storage có quyền phù hợp. | Upload file sai định dạng/quá lớn và kiểm tra phản hồi. |
| Riêng tư dữ liệu | Chỉ thu dữ liệu cần thiết; giới hạn truy cập, retention và xóa/ẩn theo chính sách. | Rà soát form, quyền xem hồ sơ và luồng rút đồng ý. |
| Quan sát hệ thống | Log lỗi có request_id, dashboard lỗi API, cảnh báo đồng bộ reservation/stock. | Cố tình làm API phụ trợ lỗi và quan sát cảnh báo. |
| Tương thích trình duyệt | Tối thiểu thử nghiệm trên Chrome/Edge hiện hành và kích thước màn hình chính. | Checklist kiểm thử xuyên trình duyệt. |

## 11.1 Cấu trúc kỹ thuật gợi ý
Có thể triển khai bằng một ứng dụng backend phân module để phù hợp MVP, nhưng giữ ranh giới logic rõ ràng: Catalog/CMS, Inventory, Orders, Customers, Promotions, Auth/Audit. Không cần tách microservice sớm. Các module giao tiếp qua service/API nội bộ, cùng transaction database khi cần tính nhất quán; các tác vụ nền như email, ảnh/3D và đồng bộ vận chuyển có thể chạy qua job queue khi cần.
Một lựa chọn phổ biến: web frontend responsive; backend REST API; cơ sở dữ liệu quan hệ như PostgreSQL; object storage cho ảnh/video/3D; CDN/cache cho tài sản công khai. Đây là gợi ý kiến trúc, không phải yêu cầu bắt buộc. Chọn công nghệ cuối cùng dựa trên đội ngũ và khả năng vận hành.
# 12. Báo cáo và chỉ số đo lường
| Nhóm | KPI | Định nghĩa/diễn giải |
| Kho | Độ chính xác tồn | Tỷ lệ SKU-vị trí có số hệ thống khớp với số kiểm kê trong ngưỡng cho phép. |
| Kho | Thời gian xử lý phiếu nhập | Từ lúc tạo phiếu đến lúc ghi sổ; tách hàng tiêu chuẩn và phiếu có chênh lệch. |
| Kho | Tỷ lệ lấy hàng chính xác | Dòng hàng lấy đúng SKU/số lượng trên tổng dòng được lấy. |
| Kho | Tỷ lệ đơn chậm do kho | Đơn bị chậm do chưa lấy/đóng gói/xuất kho trên tổng đơn cần xử lý. |
| Kho | Tỷ lệ điều chỉnh tồn | Số dòng điều chỉnh / dòng giao dịch hoặc SKU; theo dõi nguyên nhân, không coi số thấp luôn là tốt nếu kiểm kê chưa đủ. |
| Website | Conversion rate | Đơn hợp lệ / phiên truy cập theo cách đo được định nghĩa rõ. |
| Website | Tỷ lệ lỗi hết hàng khi checkout | Lượt checkout thất bại do tồn thay đổi / tổng lượt checkout. |
| Website | Tỷ lệ sản phẩm thiếu dữ liệu | Sản phẩm xuất bản thiếu ảnh, mô tả, thuộc tính thiết yếu hoặc thông tin tình trạng. |
| Website | Hiệu quả tìm kiếm | Lượt tìm có click/thêm giỏ; theo dõi tìm kiếm không kết quả. |
| Khách hàng | Tỷ lệ quay lại | Khách có đơn lặp trong khoảng thời gian chọn; cần khoảng thời gian và loại đơn rõ. |
| Hệ thống | Tỷ lệ đồng bộ lỗi | Sự kiện order/reservation/stock/shipment không hoàn tất thành công trong thời hạn quy định. |

Giai đoạn đầu nên dùng KPI để phát hiện lỗi vận hành, không đặt chỉ tiêu kinh doanh tùy ý khi chưa có dữ liệu nền. Mọi dashboard phải ghi rõ phạm vi ngày, múi giờ, trạng thái được tính và nguồn dữ liệu.
# 13. Phân kỳ MVP và các giai đoạn mở rộng
## 13.1 Ma trận ưu tiên
| Mức | Năng lực | Lý do |
| P0 — Bắt buộc MVP | Auth/role; SKU/catalog nền; một kho + vị trí; nhập/xuất; ledger; tồn khả dụng/reservation; kiểm kê/điều chỉnh; sản phẩm và danh mục; media ảnh; CMS trang chủ/banner/menu; khách hàng cơ bản; giỏ/đơn; quy trình lấy-đóng gói-xuất; audit log; backup. | Không có thì khó vận hành kho thật hoặc bán hàng nhất quán. |
| P1 — Nên có sớm | Barcode scanner; cảnh báo hết hàng; hàng cách ly/hoàn; mã giảm giá; đánh giá; wishlist; thông báo đơn; báo cáo giá trị tồn; SEO cơ bản; viewer 3D ở sản phẩm chọn lọc. | Tăng chất lượng vận hành và khác biệt storefront. |
| P2 — Mở rộng nội địa | Nhiều kho; điều chuyển; nhà cung cấp + purchase order đầy đủ; đóng gói theo kiện; tích hợp hãng giao hàng nội địa; COD/đối soát; quy trình đổi trả nâng cao. | Phù hợp khi đơn và số kho tăng. |
| P3 — Mở rộng quốc tế | Mã tiền tệ, quốc gia/địa chỉ quốc tế, HS code/mã phân loại hàng theo quy tắc đã kiểm chứng, nước xuất xứ, gross/net weight, chứng từ thương mại, landed cost, broker/carrier integration, trạng thái thông quan, thuế/phí và theo dõi lô hàng. | Cần chuyên gia vận hành và tuân thủ; không nên làm trước khi dữ liệu nội địa ổn định. |
| P4 — Tự động hóa/AI | Dự báo nhu cầu, đề xuất mua hàng, tìm kiếm semantic, cá nhân hóa theo series, assistant hỏi đáp sản phẩm, gợi ý bộ sưu tập. | Chỉ có ý nghĩa khi có dữ liệu chất lượng và cách đánh giá rõ. |

## 13.2 Mở rộng nhập/xuất nội địa
Nhà cung cấp và đơn mua: đặt hàng, số lượng dự kiến, thời gian dự kiến, nhận một phần, ghi nhận thiếu/hư hỏng, đối soát hóa đơn/phiếu giao.
Nhiều kho: mỗi vị trí thuộc một kho; điều chuyển gồm bước xuất kho nguồn, đang vận chuyển, nhận kho đích; không tăng tồn đích trước khi nhận.
Tích hợp vận chuyển: tạo vận đơn, lưu mã tracking, trạng thái nhận/giao/thất bại/hoàn; đối soát khối lượng và phí.
Đối soát COD và hoàn tiền: phân biệt trạng thái giao hàng với trạng thái tiền; ghi nhận phí/khấu trừ theo từng lần đối soát.
Quản lý lô: theo nhà cung cấp/ngày nhập/giá vốn; xử lý thu hồi hoặc nghi vấn nguồn hàng theo lô nếu nghiệp vụ cần.
## 13.3 Mở rộng nhập/xuất quốc tế
Thông tin hàng hóa: nước xuất xứ, mã phân loại HS do người có trách nhiệm xác minh, mô tả thương mại, số lượng, trọng lượng tịnh/gộp, kích thước kiện và mã SKU nhất quán.
Hồ sơ lô hàng: nhà cung cấp/người mua, hóa đơn thương mại, packing list, vận đơn, chứng từ xuất xứ/giấy phép nếu áp dụng, hồ sơ bảo hiểm và biên nhận chi phí liên quan.
Trạng thái nghiệp vụ: dự kiến → đã đặt → đã xuất phát → đang vận chuyển → chờ thông quan → thông quan → nhận kho; với chiều xuất bán: tạo chứng từ → bàn giao hãng vận chuyển → xuất khẩu/thông quan theo luồng thực tế → giao quốc tế.
Chi phí thực nhận (landed cost): phân bổ chi phí mua, vận chuyển, bảo hiểm, thuế/phí và chi phí liên quan theo quy tắc được kế toán xác nhận; lưu currency và tỷ giá tham chiếu.
Tách rõ phần mềm quản lý chứng từ khỏi việc kết luận pháp lý/thuế. Không tự gán mã HS, thuế suất hay chứng từ bắt buộc bằng suy đoán; các nội dung này phải được xác nhận theo hàng hóa, nước đi/đến và quy định tại thời điểm giao dịch.
Kiểm tra quyền sử dụng nhãn hiệu/hình ảnh, nguồn hàng và hồ sơ tính xác thực khi kinh doanh đồ sưu tầm có thương hiệu; không tuyên bố “chính hãng” nếu chưa có căn cứ.
## 13.4 Quốc tế hóa storefront
Mã tiền tệ, định dạng tiền/ngày, ngôn ngữ, quốc gia nhận hàng và giới hạn vận chuyển.
Giá có/không bao gồm thuế, phí vận chuyển và cách hiển thị phải nhất quán với thị trường mục tiêu.
Địa chỉ quốc tế, số điện thoại theo mã quốc gia, trọng lượng/kích thước và tính khả dụng vận chuyển theo SKU.
Chính sách trả hàng quốc tế và thời gian dự kiến phải phản ánh năng lực nhà vận chuyển; không sao chép chính sách nội địa nếu không phù hợp.
# 14. Lộ trình triển khai 80 ngày
Lộ trình dưới đây giả định nhóm nhỏ và tập trung vào một website bán hàng của chính cửa hàng, một kho và dữ liệu demo/synthetic ban đầu. Nếu đội ngũ chưa quen stack hoặc cần nhập dữ liệu lớn, phải giảm phạm vi giao diện 3D/marketing trước, không được cắt quy tắc nhất quán tồn kho.
| Khoảng thời gian | Trọng tâm | Đầu ra cần kiểm chứng |
| Ngày 1–5 | Khảo sát nghiệp vụ, chốt thuật ngữ, vai trò, sơ đồ luồng nhập/xuất/đặt đơn/hoàn. | Bản mô tả nghiệp vụ; danh sách P0/P1; trạng thái phiếu/đơn; danh sách ngoại lệ. |
| Ngày 6–10 | Thiết kế sơ đồ dữ liệu và wireframe quản trị kho + CMS; định nghĩa SKU và tồn. | ERD, quy tắc tồn, mô hình quyền, wireframe desktop/mobile; checklist nghiệm thu. |
| Ngày 11–18 | Khởi tạo dự án, đăng nhập, RBAC, audit log, dữ liệu danh mục SKU/kho/vị trí. | Tài khoản theo vai trò; tạo SKU; seed data; test phân quyền. |
| Ngày 19–28 | Làm inventory ledger, số dư, phiếu nhập, xác nhận và lịch sử giao dịch. | Luồng nhập hoàn chỉnh; không cập nhật tồn bằng gõ đè; test nhận thiếu và chống ghi trùng. |
| Ngày 29–36 | Làm phiếu xuất, vị trí, tác vụ lấy hàng, điều chỉnh, kiểm kê và hàng cách ly. | Luồng xuất/kiểm kê; audit trail; báo cáo tồn và thẻ kho. |
| Ngày 37–45 | Làm Catalog/CMS: sản phẩm, SKU variants, danh mục, media, banner, homepage và menu. | Tạo bản nháp, preview, publish; storefront hiển thị sản phẩm đúng dữ liệu. |
| Ngày 46–54 | Làm customer, cart, checkout/order, reservation, cancellation và kết nối kho. | Đơn giữ hàng đúng; hai checkout cạnh tranh không bán vượt tồn; hủy giải phóng giữ hàng. |
| Ngày 55–61 | Làm picking/packing/shipment/return, trạng thái khách, thông báo cơ bản. | Đơn đi trọn vòng đời; hàng hoàn không vào available trước khi kiểm tra. |
| Ngày 62–68 | Dashboard, báo cáo, tìm kiếm/lọc, khuyến mãi cơ bản, responsive. | Báo cáo có định nghĩa KPI; filter/search hoạt động; giao diện trên kích thước chính. |
| Ngày 69–74 | Kiểm thử tích hợp, bảo mật, dữ liệu sai, đồng thời, retry, backup/restore. | Báo cáo test; lỗi nghiêm trọng được xử lý; kịch bản khôi phục được thử. |
| Ngày 75–78 | UAT với kịch bản vận hành; nhập dữ liệu mẫu; hướng dẫn người dùng. | Biên bản nghiệm thu; SOP nhập/xuất/kiểm kê/đơn; checklist vận hành ngày thường. |
| Ngày 79–80 | Đóng băng MVP, demo, tài liệu kỹ thuật/nghiệp vụ, danh sách giai đoạn 2. | Bản release, hướng dẫn triển khai, known issues, kế hoạch mở rộng nội địa/quốc tế. |

## 14.1 Quy tắc quản lý phạm vi trong 80 ngày
Không triển khai nhiều kho thật trong MVP; chỉ chuẩn bị schema hỗ trợ về sau.
Nếu trễ, ưu tiên: ledger và reservation → nhập/xuất → đơn hàng → catalog/CMS cơ bản → phân quyền/audit → báo cáo.
3D tương tác có thể triển khai cho một số SKU nổi bật sau khi luồng ảnh và trang sản phẩm ổn định; không để 3D làm trễ mua hàng/kho.
Mọi tuần phải có demo luồng đầu cuối, không chỉ demo từng màn hình riêng.
# 15. Tiêu chí nghiệm thu và kịch bản kiểm thử
## 15.1 Tiêu chí nghiệm thu kho MVP
Có thể tạo SKU, barcode, kho và vị trí; SKU có định danh duy nhất và truy ra hồ sơ sản phẩm.
Phiếu nhập nháp không tác động số tồn; xác nhận phiếu ghi nhận đúng số thực nhận và tạo lịch sử không thể sửa xóa trực tiếp.
Phiếu xuất có nguồn/lý do; không cho xuất vượt số khả dụng; giao dịch liên kết đơn/chứng từ và người thực hiện.
Số tồn khả dụng = tồn thực tế trừ lượng đã giữ và hàng không thể bán theo định nghĩa đã chốt.
Kiểm kê chênh lệch tạo điều chỉnh có duyệt/lý do; có thể truy lại số trước và sau.
Hủy đơn trước khi xuất giải phóng reservation; hủy sau xuất không tự cộng tồn mà đi qua luồng hoàn/thu hồi.
Có báo cáo tồn, phiếu chờ xử lý và thẻ kho; báo cáo truy ngược được tới giao dịch gốc.
Nhân viên không đủ quyền không thể gọi API để xác nhận phiếu hoặc điều chỉnh kho.
## 15.2 Tiêu chí nghiệm thu website MVP
Có thể tạo/sửa/lưu nháp/xem trước/xuất bản sản phẩm, danh mục, banner và trang chủ.
SKU có thể liên kết với Product; giá và tồn khả dụng trên storefront đến từ nguồn dữ liệu chuẩn.
Trang sản phẩm trình bày rõ hình ảnh, thông số, tình trạng/phiên bản, giá, trạng thái hàng và CTA mua.
Có tìm kiếm, lọc tối thiểu và trang kết quả không có sản phẩm; không hiện liên kết hỏng do nội dung chưa xuất bản.
Giỏ hàng/checkout xác minh lại tồn và giá; đơn có snapshot giá; reservation và đơn không trùng khi người dùng bấm lại.
Quản trị viên có thể tra cứu hồ sơ khách, địa chỉ, lịch sử đơn và consent theo quyền.
Có lịch sử thay đổi đối với giá và nội dung quan trọng; bản nháp không lộ công khai.
Form và chính sách cần thiết được hiển thị; kiểm tra tuân thủ được thực hiện trước khi mở bán thực tế.
## 15.3 Bộ kịch bản kiểm thử bắt buộc
| ID | Kịch bản | Kết quả mong muốn |
| WH-01 | Nhập 10 sản phẩm, thực nhận 8 | Ledger +8; phiếu ghi nhận thiếu 2; tồn hiển thị 8. |
| WH-02 | Xác nhận lại cùng phiếu hai lần | Chỉ một bộ giao dịch tồn được ghi. |
| WH-03 | Xuất 11 khi khả dụng 8 | Bị chặn hoặc có luồng ngoại lệ được phê duyệt rõ; không âm tồn. |
| WH-04 | Kiểm kê hệ thống 8, thực đếm 7 | Tạo chênh lệch -1 sau duyệt; truy được người và lý do. |
| WH-05 | Nhận hàng trả nhưng chưa kiểm định | Tăng hàng chờ kiểm định/cách ly, available không tăng. |
| EC-01 | SKU có tồn nhưng sản phẩm Draft | Sản phẩm không xuất hiện public. |
| EC-02 | Hết tồn trong lúc hai khách checkout | Reservation ngăn bán vượt số hàng khả dụng. |
| EC-03 | Giá sản phẩm đổi sau khi đơn được tạo | Đơn cũ giữ snapshot giá đã đặt. |
| EC-04 | Banner hết thời gian hiệu lực | Không tiếp tục hiển thị sau thời điểm kết thúc theo cấu hình. |
| SEC-01 | Nhân viên CMS gọi API điều chỉnh kho | API từ chối do không đủ quyền và ghi log thích hợp. |
| OPS-01 | Database backup/restore | Khôi phục được dữ liệu và xác minh các giao dịch cuối theo RPO/RTO đặt ra. |

# 16. Rủi ro, quyết định cần chốt và khuyến nghị
## 16.1 Rủi ro lớn
| Rủi ro | Tác động | Cách giảm thiểu |
| SKU và phiên bản không rõ | Sai hàng khi nhận/lấy/giao; khách hiểu sai edition. | Quy chuẩn SKU, thuộc tính bắt buộc, ảnh thật và kiểm thử tìm trùng. |
| Sửa thẳng số tồn | Không điều tra được thất thoát; dữ liệu mất tin cậy. | Ledger bất biến; điều chỉnh bằng phiếu có lý do và quyền duyệt. |
| Không xử lý đơn đồng thời | Oversell sản phẩm hiếm/limited. | Reservation nguyên tử, concurrency test, idempotency và đối soát. |
| CMS xuất bản nội dung sai | Giá, lịch khuyến mãi, sản phẩm hoặc chính sách hiển thị sai. | Preview, lịch hiệu lực, role-based publish, audit log và rollback nội dung. |
| Phạm vi quốc tế quá sớm | Tốn thời gian vào hải quan/thuế/tích hợp trước khi kho nội địa ổn định. | MVP một kho; xây dữ liệu sẵn mở rộng nhưng để quy trình quốc tế ở phase riêng. |
| Tuyên bố về hàng chính hãng không có bằng chứng | Rủi ro uy tín/tranh chấp và tuân thủ. | Lưu hồ sơ nguồn hàng, duyệt nội dung và chỉ sử dụng tuyên bố có căn cứ. |
| Thu thập quá nhiều dữ liệu khách | Tăng rủi ro riêng tư và chi phí quản lý. | Data minimization, quyền truy cập, consent và chính sách lưu/xóa dữ liệu. |

## 16.2 Các quyết định cần chốt trước khi coding
1. Kho chỉ có một địa điểm ban đầu hay cần nhiều khu vực/điểm nhận khác nhau ngay từ MVP? Khuyến nghị một kho, nhiều vị trí kệ.
2. Bán hàng mới nguyên seal hay có cả open-box/đã qua sử dụng? Nếu có, tình trạng phải là thuộc tính bán hàng và được kiểm tra khi nhập/hoàn.
3. Có cần theo dõi serial từng món ngay không? Khuyến nghị không bắt buộc cho mọi SKU; bật với sản phẩm giá trị cao/phiên bản giới hạn khi cần.
4. Thời điểm giữ hàng: khi tạo đơn, xác nhận đơn hay thanh toán? Phải chốt theo payment method và TTL.
5. Phương thức thanh toán/giao hàng MVP: demo nội bộ hay mở bán thật? Tích hợp thật làm tăng đáng kể công việc đối soát.
6. Giá vốn tính theo bình quân, FIFO hay một phương pháp khác? Đây là quyết định cần kế toán/giảng viên hướng dẫn xác nhận, không tự suy diễn.
7. Mức độ 3D: chỉ hiển thị file GLB/GLTF có sẵn hay cần cấu hình/preview mô hình từ CMS? Khuyến nghị viewer trên storefront trước, công cụ biên tập 3D chuyên dụng để sau.
8. Website chỉ bán hàng của chính shop hay sau này nhận người bán khác? Khuyến nghị khởi đầu là một nhà bán; mô hình marketplace làm phát sinh nhiều nghiệp vụ và nghĩa vụ riêng.
## 16.3 Khuyến nghị cuối cùng
| Thứ tự ưu tiên  Đầu tiên xây lõi tồn kho có ledger + reservation + phiếu nhập/xuất. Tiếp đó là catalog/SKU và trang sản phẩm. Sau đó kết nối giỏ hàng/đơn hàng, CMS và khách hàng. Cuối cùng làm dashboard, 3D nâng cao và mở rộng tích hợp. Không nên bắt đầu bằng giao diện bắt mắt nếu luồng hàng và đơn chưa đảm bảo đúng. |

# PHỤ LỤC A. Danh sách trường dữ liệu đề xuất
## A1. Tối thiểu cho SKU
| Trường | Bắt buộc? | Ví dụ / giải thích |
| sku_code | Có | Mã nội bộ duy nhất, ổn định. |
| product_id | Có | Liên kết hồ sơ sản phẩm công khai. |
| barcode | Tùy | EAN/UPC hoặc mã nội bộ; cần duy nhất nếu sử dụng quét mã. |
| variant_name | Có nếu có phiên bản | Standard, Limited Edition, màu/scale khác. |
| condition_code | Nếu bán nhiều tình trạng | Sealed/New, Open-box, Pre-owned; mô tả định nghĩa rõ. |
| brand_id / series_id | Nên có | Giúp lọc theo thương hiệu/series. |
| selling_status | Có | Active, hidden, discontinued. |
| weight / dimensions | P1 | Cần cho báo giá vận chuyển và quốc tế. |
| cost_price / currency | Nội bộ, theo quyền | Giá nhập và mã tiền tệ; không công bố ra storefront. |
| safety_stock / reorder_point | P1 | Ngưỡng cảnh báo; không đồng nghĩa với số lượng phải mua. |

## A2. Tối thiểu cho phiếu kho
| Nhóm | Trường gợi ý |
| Header | doc_id, doc_number, doc_type, warehouse_id, status, supplier/reference, created_by, approved_by, created_at, posted_at, reason_code, notes. |
| Line | line_id, sku_id, location_id, qty_expected, qty_actual, qty_accepted, qty_quarantined, unit_cost/currency nếu phù hợp, condition, notes. |
| Ledger | transaction_id, sku_id, warehouse_id, location_id, qty_delta, transaction_type, reference_type, reference_id, actor_id, timestamp, idempotency_key. |
| Audit | actor_id, action, entity_type/id, before/after summary, reason, timestamp, request_id, source IP/device khi phù hợp chính sách. |

## A3. Tối thiểu cho sản phẩm CMS
| Nhóm | Trường gợi ý |
| Nhận diện | product_id, name, slug, status, brand, series, categories, tags. |
| Nội dung | short_description, long_description, specifications, box_contents, condition notes, care/assembly notes. |
| Media | cover_image, image_gallery, video_url, model_3d_asset, alt_text, order, media_status. |
| Thương mại | sku_ids, selling_price, compare_at_price (nếu có), sale_window, stock-display policy, backorder/preorder flag nếu có. |
| SEO/CMS | meta_title, meta_description, share_image, canonical/redirect settings khi cần. |
| Xuất bản | publication_status, scheduled_at, published_at, published_by, last_edited_by, last_edited_at. |

# PHỤ LỤC B. Nguồn tham khảo và lưu ý tuân thủ
Phần chức năng trong tài liệu này là đề xuất phân tích hệ thống, không phải tư vấn pháp lý/thuế/hải quan. Trước khi vận hành thật tại Việt Nam, cần xác minh các thủ tục áp dụng đúng với mô hình website, chủ thể kinh doanh, hàng hóa và quốc gia liên quan.
Nguồn chính thức được kiểm tra khi lập bản kế hoạch:
Bộ Công Thương — thông tin công bố về Luật Thương mại điện tử số 122/2025/QH15 và Nghị định 248/2026/NĐ-CP, cùng nêu ngày hiệu lực 01/07/2026: https://moit.gov.vn/en/news/ministry-of-industry-and-trade-disseminates-the-law-on-e-commerce-and-government-decree-no.-248-2026-nd-cp.html
Cổng thông tin quản lý hoạt động thương mại điện tử — danh mục văn bản pháp luật và thông tin về hiệu lực văn bản: https://online.gov.vn/SCT_DN/van-ban-phap-luat
Cổng thông tin Chính phủ — Văn bản hợp nhất 41/VBHN-BCT về quản lý website thương mại điện tử, ban hành 04/06/2026: https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-41-vbhn-bct-469715/65739.htm
Checklist pháp lý cần giao cho người có chuyên môn xác minh trước go-live: nghĩa vụ thông báo/đăng ký phù hợp mô hình website; thông tin người bán và chính sách phải công bố; bảo vệ dữ liệu cá nhân; thuế và hóa đơn; quyền sở hữu trí tuệ/nguồn gốc hàng; chính sách giá/khuyến mãi; hàng hóa đặc thù; và nghĩa vụ liên quan khi xuất nhập khẩu. Mã HS, mức thuế, chứng từ và thủ tục phải xác định theo hàng hóa và luồng giao dịch cụ thể, không hard-code theo phỏng đoán.
