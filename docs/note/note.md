Sau này muốn thêm mô hình: thêm vào sketchfab-models.json, chạy npm run models rồi nhờ tôi chụp ảnh và chạy npm run media.

Tôi chưa chạy npm run build sau đợt sửa này. Hai mô hình Sazabi và Mazinger Z Jet Scrander vẫn màu trắng, vì file gốc không có màu.

Giới hạn nên tự nêu trước:
WebP chỉ làm file tải về nhẹ hơn. Trên card đồ hoạ, texture vẫn chiếm bộ nhớ như ảnh chưa nén; muốn giảm cả phần này thì phải dùng định dạng KTX2.
Việc giải nén chạy trên luồng chính, nhưng chỉ khoảng 5 ms mỗi file nên người dùng không nhận ra.