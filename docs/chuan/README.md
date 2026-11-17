# Bộ tài liệu chuẩn

Nguồn đúng duy nhất cho dự án ROBOTICA (luận văn, đồng thời là nền cho một thương hiệu cá nhân). Viết bằng tiếng Việt; tên bảng, trạng thái và API giữ nguyên như trong mã nguồn.

## Danh sách tài liệu

| File | Nội dung | Tình trạng |
| --- | --- | --- |
| [00-quyet-dinh-nen-tang.md](00-quyet-dinh-nen-tang.md) | Mục tiêu, các quyết định đã chốt và thứ tự ưu tiên | Đã chốt |
| [01-dac-ta-yeu-cau.md](01-dac-ta-yeu-cau.md) | Phạm vi, tác nhân, yêu cầu chức năng và phi chức năng, quy tắc nghiệp vụ | Đã chốt; đối chiếu lại 17/11/2026: 45/50 yêu cầu có, 1 khác, 4 chưa (ghi nhận hành vi) |
| [02-use-case.md](02-use-case.md) | Sơ đồ use case, đặc tả từng use case, sơ đồ hoạt động và tuần tự | Đã viết 17/11/2026 (33 use case, sơ đồ use case, hoạt động, tuần tự) |
| [03-co-so-du-lieu.md](03-co-so-du-lieu.md) | ERD, mô tả bảng, khoá, ràng buộc | Đã cài đặt; mục 14 bổ sung 23 migration sau 016 (17/11/2026) |
| [04-trang-thai.md](04-trang-thai.md) | Trạng thái đơn hàng, thanh toán, vận chuyển, tồn kho và luật chuyển | Đã chốt, đã cài đặt |
| [05-kien-truc.md](05-kien-truc.md) | Kiến trúc hệ thống, công nghệ, phân quyền, bảo mật | Đã viết 16/10/2026, bổ sung 17/11/2026 (thanh toán, email, việc định kỳ, nhận dạng robot) |
| [06-api.md](06-api.md) | Danh sách Server Action và Route Handler | Đã viết 16/10/2026, bổ sung 17/11/2026 (mục 2b) |
| [07-kiem-thu.md](07-kiem-thu.md) | Kế hoạch và kết quả kiểm thử | Kết quả toàn dự án 17/11/2026: 404 test, build, 105 trang |
| [08-tich-hop-ai.md](08-tich-hop-ai.md) | Tính năng AI: **nhận dạng robot từ ảnh bằng học có giám sát** (đóng góp chính của luận văn, từ 07/11/2026); phụ lục A là cách tìm bằng ảnh cũ (CLIP đóng băng, 12 góc dựng từ 3D) | Viết lại 15/11/2026; mô hình đang bật trên web từ 15/11/2026 |
| [09-mo-hinh-3d.md](09-mo-hinh-3d.md) | Nguồn, xử lý, lưu trữ và hiển thị mô hình 3D | Đã làm |
| [10-quan-tri-va-kho.md](10-quan-tri-va-kho.md) | Quản trị website và quản lý kho: phạm vi, quyết định, quyền, yêu cầu, nghiệm thu | Đã chốt 15/10/2026, đã cài đặt 16/10/2026 (T00–T25) |

## Quy ước

- Mỗi yêu cầu có mã (ví dụ `YC-DH-03`) để tài liệu khác và test tham chiếu.
- Phạm vi chia ba bước: (1) thương mại điện tử cốt lõi, (2) tích hợp AI, (3) nghiệp vụ mở rộng.
- Thay đổi quyết định thì sửa `00-quyet-dinh-nen-tang.md` trước và ghi ngày.
