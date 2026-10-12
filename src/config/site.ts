// Cấu hình chung của cửa hàng.
// Thông tin liên hệ và chính sách bên dưới là NỘI DUNG MẪU: hãy thay bằng thông tin thật trước khi mở bán.
export const site = {
  name: "ROBOTICA",
  slogan: "Mô hình robot sưu tầm",
  description:
    "Cửa hàng mô hình robot sưu tầm. Xem và xoay từng mô hình 3D ngay trên trình duyệt trước khi đặt mua.",
  // Dùng cho sitemap, thẻ Open Graph và liên kết tuyệt đối.
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  contact: {
    phone: "0900 000 000",
    email: "cskh@robostore.example",
    address: "Số 1 Đường Mẫu, Phường Mẫu, TP. Hồ Chí Minh",
    hours: "8:00 – 21:00, tất cả các ngày trong tuần",
  },
  shipping: {
    flatFee: 30_000,
    freeFrom: 1_000_000,
  },
  policy: {
    returnDays: 7,
    warrantyMonths: 12,
  },
  // Số lượng tối đa của một sản phẩm trong một đơn hàng.
  maxQtyPerItem: 10,
  // Số sản phẩm mỗi trang ở trang danh mục.
  pageSize: 12,
} as const;
