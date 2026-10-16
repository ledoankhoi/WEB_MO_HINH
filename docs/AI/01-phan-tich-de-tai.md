# 01. Phân tích đề tài

Nội dung gốc do chủ dự án cung cấp ngày 16/10/2026, được biên tập lại thành tài liệu. Các trích dẫn được thay bằng mã nguồn ở [06-nguon-tham-khao.md](06-nguon-tham-khao.md). Các điểm đã sửa so với bản gốc ghi ở mục 6 của file đó.

## 1. Ba việc cần phân biệt

1. **Làm một tính năng AI hữu ích:** thu thập tương tác 3D và dùng nó để gợi ý sản phẩm.
2. **Làm một nghiên cứu có bằng chứng:** chứng minh tín hiệu 3D thực sự cải thiện chất lượng gợi ý, bằng các thí nghiệm được thiết kế tốt.
3. **Tạo đóng góp thuật toán mới:** xây phương pháp khác biệt rõ ràng so với các nghiên cứu gợi ý đa hành vi, và chứng minh khác biệt đó bằng tổng quan tài liệu.

Ý tưởng hiện tại đã có hướng nghiên cứu hợp lý. Phần "đóng góp mới" vẫn là **giả thuyết cần kiểm chứng**.

## 2. Đề tài thực chất chứa ba câu hỏi khoa học

| # | Câu hỏi | Bản chất | Cách kiểm chứng |
| --- | --- | --- | --- |
| Q1 | Người xoay, phóng, khám phá 3D có khả năng mua cao hơn người chỉ xem trang không? | Phân tích tín hiệu hành vi | So sánh khả năng dự đoán mua sau khi kiểm soát các yếu tố liên quan |
| Q2 | Bổ sung tín hiệu 3D có làm hệ gợi ý tốt hơn không? | Nghiên cứu hệ gợi ý | Thử nghiệm các mô hình có và không có tín hiệu 3D |
| Q3 | Cung cấp trải nghiệm 3D có khiến khách mua nhiều hơn không? | Tác động nhân quả | Thử nghiệm A/B giữa các trải nghiệm giao diện |

**Quyết định:** Q2 là trọng tâm. Q1 dùng làm cơ sở giải thích. Q3 là hướng phát triển sau này.

**Lý do:** người tương tác 3D nhiều có thể vốn đã rất thích sản phẩm. Hành vi đó giúp *dự đoán* việc mua, nhưng không chứng minh chính tính năng 3D *khiến* họ muốn mua. Tách ba câu hỏi giúp tránh kết luận quá mức.

## 3. Giả thuyết: tương tác 3D có phải tín hiệu quan tâm mạnh không?

### 3.1. Không mặc định thứ tự hành vi

Giả định ban đầu là `Mua > Thêm giỏ > Tương tác 3D sâu > Xem trang`. Đây là điểm khởi đầu hợp lý, nhưng không phải sự thật cố định.

| Hành vi | Vai trò | Vì sao không chắc chắn |
| --- | --- | --- |
| Xem trang sản phẩm | Tín hiệu cơ bản | Có thể chỉ vì sản phẩm hiện ở trang chủ hay kết quả tìm kiếm; chịu ảnh hưởng của vị trí hiển thị |
| Xoay, phóng mô hình 3D | Tín hiệu cần kiểm chứng | Có thể là xem kỹ khớp nối, phụ kiện; cũng có thể là tìm thông tin khó thấy, thử chức năng, hoặc gặp khó với giao diện |
| Thêm vào giỏ | Ý định mua tiềm năng | Khách vẫn có thể bỏ giỏ, so giá, chờ giảm giá |
| Mua thành công | Nhãn mục tiêu | Phải tách đơn thành công với đơn huỷ hoặc hoàn trả |

Nghiên cứu gợi ý đa hành vi đã xét các tổ hợp như xem, yêu thích, thêm giỏ, mua [R4, R5, R6]. Các hành vi mang thông tin bổ sung nhưng khác nhau về phân phối, mức nhiễu và độ liên hệ với việc mua. Đặt trước trọng số cố định cho từng hành vi không phải lựa chọn duy nhất.

### 3.2. Các tín hiệu 3D có giá trị khác nhau

Không gộp mọi sự kiện 3D thành một con số kiểu tổng số lần xoay.

| Tín hiệu | Có thể phản ánh | Cần xử lý |
| --- | --- | --- |
| Thời gian tương tác 3D | Mức độ khám phá | Có thể gồm cả lúc người dùng rời màn hình |
| Số lần xoay | Mức độ thao tác | Xoay liên tục không có nghĩa là thích hơn |
| Góc nhìn đã khám phá | Mức bao quát mô hình | Mô hình dễ nhìn có thể không cần nhiều thao tác |
| Mức phóng | Nhu cầu xem chi tiết | Có thể là khó nhìn, hoặc đang kiểm tra lỗi |
| Bấm điểm thông tin trên mô hình | Quan tâm chi tiết cụ thể | Chỉ có khi giao diện có điểm thông tin |
| Tương tác trước khi thêm giỏ | Liên hệ với ý định mua | Không chứng minh tương tác 3D *gây ra* việc thêm giỏ |
| **Xem biến hình, hợp thể, chọn dáng** (riêng ROBOTICA) | Quan tâm tới chức năng đặc trưng của mô hình | Chỉ có ở mô hình có clip; phải xét riêng nhóm có và không có |

Dùng **thời gian hoạt động thực tế** thay cho thời gian trang mở: chỉ tính khi trang đang hiển thị và người dùng còn thao tác; loại thời gian chờ tải mô hình và các khoảng không hoạt động dài. Cách chuẩn hoá thời gian lưu lại (dwell time) theo thiết bị và ngữ cảnh đã được nghiên cứu cho gợi ý nội dung [R7].

Nghiên cứu của Wodehouse và Abba [R8] xét trải nghiệm 3D, cảm giác hiện diện và đặc điểm cá nhân trong mua sắm trực tuyến. Kết quả về trải nghiệm 3D không tự động chứng minh tương tác 3D cải thiện độ chính xác của hệ gợi ý; đó là hai câu hỏi khác nhau.

**Kết luận phần giả thuyết:** điều cần chứng minh không phải là "người tương tác 3D chắc chắn thích hơn". Điều cần chứng minh là "tín hiệu 3D cung cấp thông tin bổ sung có ích để dự đoán sở thích hoặc hành vi mua trong tương lai".

## 4. Mức độ mới của đề tài

### 4.1. Những gì đã có nền tảng

- **Phản hồi ngầm:** Hu, Koren, Volinsky [R1] mô hình hoá độ tin cậy của phản hồi ngầm. Nghiên cứu này không coi dữ liệu không quan sát được là không thích.
- **BPR:** Rendle và cộng sự [R2] đề xuất học thứ hạng từ phản hồi ngầm. Áp dụng BPR là nền tảng phương pháp, không phải đóng góp mới.
- **Gợi ý đa hành vi:** đã có nhiều công trình như MBGCN [R4] và Multi-Behavior Alignment [R5]. Khảo sát năm 2025 [R6] cho thấy số bài bình duyệt tăng từ 37 (2019–2020) lên 164 (2023–2024).
- **3D trong thương mại điện tử:** đã có nghiên cứu về hành vi người tiêu dùng với mô hình 3D [R8], nên không thể nói khía cạnh 3D hoàn toàn chưa được nghiên cứu.

### 4.2. Đóng góp có thể nằm ở đâu

| Mức | Nội dung | Đánh giá |
| --- | --- | --- |
| Ứng dụng | Thêm sự kiện xoay, phóng vào BPR có sẵn | Có giá trị thực tiễn, đóng góp thuật toán hạn chế |
| Thực nghiệm có hệ thống | Định lượng giá trị gia tăng của 3D so với xem trang và hành vi mua sắm thông thường | Có thể là đóng góp nghiên cứu ứng dụng tốt |
| Phương pháp | Mô hình hoá chất lượng khám phá 3D, rồi học cách tín hiệu này hỗ trợ dự đoán mua | Đáng đầu tư hơn, nhưng phải so với các phương pháp liên quan |

### 4.3. Tình trạng kiểm chứng tính mới

Một lần tra cứu mở rộng ngày 16/10/2026 với cụm "recommender system implicit feedback 3D product viewer interaction rotate zoom" **không tìm thấy** công trình học thuật nào dùng tương tác trình xem 3D làm phản hồi ngầm cho hệ gợi ý. Kết quả chỉ là trang của nhà cung cấp trình xem 3D và một nhóm bằng sáng chế về phản hồi ngầm cho tờ rơi điện tử [R12].

Kết quả này **ủng hộ** giả thuyết có khoảng trống nghiên cứu, nhưng **chưa đủ** để khẳng định. Tổng quan tài liệu tuần 1 (xem [05-ke-hoach.md](05-ke-hoach.md)) phải tra trên Google Scholar, ACM DL, IEEE Xplore, Scopus với các từ khoá ở mục 5 của [06-nguon-tham-khao.md](06-nguon-tham-khao.md). Nếu tìm thấy phương pháp tương tự, phải chỉ ra khác biệt cụ thể thay vì chỉ đổi tên thuật toán.

## 5. Rủi ro khoa học

| # | Rủi ro | Cách xử lý |
| --- | --- | --- |
| R-1 | Tín hiệu 3D chủ yếu phản ánh sự tò mò | Lấy việc mua trong tương lai làm mục tiêu chính; kiểm tra 3D có cải thiện xếp hạng *sau khi* đã có các hành vi truyền thống không |
| R-2 | Cải thiện đến từ sản phẩm nổi tiếng, không phải từ 3D | Kiểm soát độ phổ biến, giá, vị trí hiển thị; phân tích riêng theo nhóm |
| R-3 | Không đủ giao dịch để huấn luyện | Dựng bộ mô phỏng và đường cơ sở trước, thu dữ liệu dùng thử sau; dữ liệu nhỏ thì trình bày là nghiên cứu thăm dò |
| R-4 | Chỉ một nhóm sản phẩm có mô hình 3D, hoặc có clip biến hình | Ghi nhận mức sẵn có của 3D như một yếu tố riêng; thiếu tương tác 3D không coi là phản hồi tiêu cực |
| R-5 | Kết quả ngoại tuyến không phản ánh hiệu quả thực tế | Chia tập theo thời gian, báo cáo khoảng tin cậy; chỉ chạy A/B khi đủ lưu lượng |
| R-6 | Bộ mô phỏng được thiết kế ưu ái phương pháp đề xuất | Có kịch bản 3D không mang thông tin (γ = 0), xem [04-thuc-nghiem.md](04-thuc-nghiem.md) mục 6 |

Mô hình dự đoán đúng hơn chưa chắc làm số đơn tăng. Muốn chứng minh tác động kinh doanh phải có thử nghiệm trực tuyến, không suy ra trực tiếp từ HR@K hay NDCG@K.

Riêng R-4: hiện **mọi** sản phẩm mẫu đều có file `.glb` (cột `model_url`), nên nhiễu do "có hay không có 3D" nhỏ. Nhưng chỉ một số mô hình có clip biến hình, hợp thể hay chọn dáng (`src/lib/model-features.ts`). Tín hiệu biến hình phải xét riêng theo nhóm này.

## 6. Phiên bản đề tài đã chốt

- **Tên:** Mô hình hoá tín hiệu tương tác 3D trong hệ thống gợi ý sản phẩm thương mại điện tử dựa trên phản hồi ngầm.
- **Câu hỏi chính:** bổ sung tín hiệu khám phá mô hình 3D vào hệ gợi ý đa hành vi có cải thiện khả năng xếp hạng sản phẩm người dùng sẽ mua trong tương lai không?
- **Đóng góp dự kiến:** một cách biểu diễn mức khám phá 3D có điều chỉnh theo chất lượng tương tác; so sánh tín hiệu 3D thô, tín hiệu 3D đã chuẩn hoá, và cơ chế học trọng số với các đường cơ sở truyền thống.
- **Phạm vi đánh giá:** dữ liệu mô phỏng và dữ liệu thật thu được khi triển khai; HR@10, NDCG@10, thí nghiệm bỏ thành phần, kiểm định thống kê phù hợp; nêu rõ giới hạn khi dữ liệu mua còn thưa.

## 7. Đánh giá tổng thể

| Tiêu chí | Nhận định |
| --- | --- |
| Gắn với website robot 3D | Rất tốt |
| Câu hỏi nghiên cứu kiểm chứng được | Tốt |
| Khả năng làm trong 1 tháng nghiên cứu | Khá, nếu giữ đúng phạm vi (xem [05-ke-hoach.md](05-ke-hoach.md)) |
| Khả năng có kết quả ý nghĩa từ dữ liệu nhỏ | Rủi ro cao |
| Tính mới của hướng ứng dụng | Có tiềm năng; một lần tra cứu chưa thấy công trình trùng, cần tổng quan đầy đủ |
| Tính mới của thuật toán | Chưa được chứng minh |

**Kết luận:** tiếp tục với đề tài, nhưng đổi trọng tâm từ "thêm hành vi 3D vào BPR" sang **đo giá trị dự đoán gia tăng của tín hiệu 3D** và **xây cách biểu diễn tín hiệu đó có cơ sở**.

Nếu kết quả cho thấy 3D không cải thiện trong mọi điều kiện, đó vẫn có thể là phát hiện có giá trị, ví dụ tín hiệu chỉ có ích với một số loại sản phẩm hay nhóm người dùng. Nghiên cứu tốt không cần giả định phương pháp đề xuất luôn thắng. Nó cần chỉ ra khi nào phương pháp hữu ích, cải thiện bao nhiêu, và giới hạn ở đâu.
