// Nội dung chữ của trang Giới thiệu (/gioi-thieu), viết cho người xem đồ án: website làm được gì, chạy bằng gì,
// demo theo thứ tự nào. Phép tính ở src/lib/landing.ts. Liên kết phải trỏ tới trang có thật (test/landing.test.ts).

// Liên kết phụ thuộc mẫu đang trưng ở đầu trang: trang sản phẩm và Xưởng của mẫu đó (không có Xưởng thì là trang sản phẩm).
export type LandingLinks = { product: string; workshop: string };

export type LandingFeature = {
  key: "xem-3d" | "tim-bang-anh" | "xuong" | "gacha" | "cong-dong" | "mua-sam";
  title: string;
  body: string;
  points: string[];
  cta: string;
  href: (links: LandingLinks) => string;
};

export const FEATURES: LandingFeature[] = [
  {
    key: "xem-3d",
    title: "Xem 3D, biến hình, hợp thể",
    body: "Mỗi sản phẩm có mô hình 3D xoay, phóng to ngay trên trình duyệt, không cần cài thêm gì.",
    points: ["Mẫu Transformers đổi giữa dạng xe và dạng robot", "Năm Combaticons hợp thể thành Bruticus", "Chọn dáng có sẵn: đứng, thủ thế, chiến thắng"],
    cta: "Xem mẫu biến hình",
    href: () => "/san-pham?bien-hinh=1",
  },
  {
    key: "tim-bang-anh",
    title: "Tìm bằng ảnh (AI)",
    body: "Tải ảnh một mô hình chưa biết tên, website gợi ý những mẫu giống nhất đang bán.",
    points: ["Mô hình CLIP chạy ngay trong trình duyệt", "So với ảnh 12 góc dựng từ mô hình 3D của từng sản phẩm", "Ảnh của khách không gửi lên máy chủ"],
    cta: "Thử tìm bằng ảnh",
    href: () => "/tim-bang-anh",
  },
  {
    key: "xuong",
    title: "Xưởng tuỳ biến",
    body: "Đặt làm theo ý: mọi lựa chọn hiện ngay trên mô hình 3D trước khi thêm vào giỏ.",
    points: ["Sơn lại, đổi lớp hoàn thiện nhám, bóng, ánh kim", "Đế lục giác có đèn LED, đèn mắt và ngực, decal, hộp quà", "Cấu hình đi theo dòng đơn hàng tới tận kho"],
    cta: "Mở Xưởng",
    href: (links) => links.workshop,
  },
  {
    key: "gacha",
    title: "Gacha, nhiệm vụ, xu",
    body: "Làm nhiệm vụ nhận xu, dùng xu chơi gacha sưu tập thẻ robot. Chỉ trả bằng xu, tỷ lệ công khai.",
    points: ["Máy viên nang, gói 5 thẻ, kệ hộp mù", "Bảo hiểm, thẻ trùng thành mảnh ghép", "Đủ bộ thì nhận mã giảm giá"],
    cta: "Vào Gacha",
    href: () => "/gacha",
  },
  {
    key: "cong-dong",
    title: "Trưng bày và cộng đồng",
    body: "Không chỉ bán hàng: nơi người sưu tầm xem, khoe và đọc về robot.",
    points: ["Bảng xếp hạng từ đơn hàng, lượt yêu thích, đánh giá", "Khách đăng ảnh kệ trưng bày, nhân viên duyệt", "Truyện tranh và tin tức"],
    cta: "Xem Trưng bày",
    href: () => "/trung-bay",
  },
  {
    key: "mua-sam",
    title: "Mua sắm trọn vòng",
    body: "Đủ nghiệp vụ của một cửa hàng thật, từ lúc chọn hàng tới khi đổi trả.",
    points: ["Flash sale, combo, mã giảm giá, đặt trước có cọc", "VNPay (sandbox), chuyển khoản VietQR, tiền mặt khi nhận hàng", "Theo dõi đơn, trả hàng, hoá đơn VAT, chat với cửa hàng"],
    cta: "Xem hàng sắp về",
    href: () => "/hang-sap-ve",
  },
];

// Website quản trị (tên miền riêng): nhóm chức năng chính.
export const ADMIN_MODULES: { title: string; body: string }[] = [
  { title: "Đơn hàng", body: "Ba trạng thái tách riêng: đơn, thanh toán, giao hàng. Luật chuyển trạng thái khai báo một chỗ, kèm trả hàng và hoàn tiền." },
  { title: "Kho", body: "Mọi thay đổi tồn đi qua sổ kho trong cùng giao dịch. Phiếu kho, thẻ kho, vị trí, lấy hàng, hàng cách ly, đối soát chênh lệch." },
  { title: "Sản phẩm và nội dung", body: "Sản phẩm có biến thể và mô hình 3D. Banner, menu, trang, tin tức, flash sale, combo, mã giảm giá." },
  { title: "Báo cáo", body: "Doanh thu theo ngày, đơn theo trạng thái, hàng bán chạy, được yêu thích, xuất CSV." },
  { title: "Phân quyền", body: "Vai trò nhân viên và ma trận quyền, nhật ký thao tác, phiên quản trị tách khỏi phiên của khách." },
  { title: "Chăm sóc khách", body: "Thông báo việc đang chờ, chat, hỏi đáp, duyệt đánh giá và bài cộng đồng, hộp thư email." },
];

// Sơ đồ kiến trúc: ba tầng, mỗi tầng vài thành phần.
export const ARCHITECTURE: { tier: string; items: string[] }[] = [
  { tier: "Trình duyệt", items: ["Giao diện React", "Khung 3D Three.js", "CLIP (ONNX) trong Web Worker"] },
  { tier: "Máy chủ Next.js 16", items: ["Server Components có cache", "Server Actions tự kiểm tra quyền", "API: thanh toán, cron, tìm bằng ảnh"] },
  { tier: "Dữ liệu và dịch vụ", items: ["PostgreSQL (Supabase)", "Supabase Storage: mô hình .glb, ảnh", "VNPay sandbox, SMTP"] },
];

// Nhãn trên mũi tên nối hai tầng liền nhau của sơ đồ.
export const ARCHITECTURE_LINKS = ["HTML dựng sẵn, Server Actions", "SQL qua pg, HTTPS"];

// Tìm bằng ảnh chạy ở đâu (docs/chuan/08-tich-hop-ai.md).
export const AI_STEPS: { title: string; body: string }[] = [
  { title: "Lập chỉ mục", body: "Ở trang quản trị, trình duyệt dựng 12 góc nhìn từ mô hình 3D của mỗi sản phẩm, CLIP biến mỗi góc thành một vector, lưu vào CSDL." },
  { title: "Khách tải ảnh", body: "CLIP chạy trong Web Worker ngay trên máy khách, biến ảnh thành một vector đặc trưng. Ảnh không rời trình duyệt." },
  { title: "So khớp", body: "Máy chủ chỉ nhận vector, so với chỉ mục, gộp các góc của từng sản phẩm, xếp hạng và chỉ nhận kết quả đủ giống theo ngưỡng đã hiệu chỉnh." },
];

export const TECH: { group: string; items: string[] }[] = [
  { group: "Giao diện", items: ["Next.js 16 (App Router)", "React 19", "TypeScript", "Tailwind CSS 4", "Motion, Animate UI"] },
  { group: "3D", items: ["Three.js", "React Three Fiber", "drei", "glTF nén meshopt, texture WebP"] },
  { group: "Dữ liệu", items: ["PostgreSQL trên Supabase", "SQL viết tay qua pg", "Supabase Storage"] },
  { group: "AI", items: ["CLIP", "ONNX Runtime Web", "Web Worker"] },
  { group: "Thanh toán, thư", items: ["VNPay (sandbox)", "VietQR", "SMTP"] },
  { group: "Kiểm thử", items: ["Vitest", "PGlite (PostgreSQL trong bộ nhớ)", "Smoke test mọi trang"] },
];

export type DemoStep = { title: string; body: string } & ({ href: (links: LandingLinks) => string } | { admin: true });

// Lộ trình demo gợi ý, đi theo một vòng mua hàng rồi sang quản trị.
export const DEMO_STEPS: DemoStep[] = [
  { title: "Xoay và biến hình", body: "Mở trang sản phẩm, kéo để xoay, bấm nút đổi dạng và chọn dáng.", href: (links) => links.product },
  { title: "Tìm bằng ảnh", body: "Tải ảnh chụp một mô hình, xem website gợi ý mẫu giống nhất.", href: () => "/tim-bang-anh" },
  { title: "Tuỳ biến ở Xưởng", body: "Chọn sơn, đế LED, đèn mắt, rồi thêm cấu hình vào giỏ.", href: (links) => links.workshop },
  { title: "Đặt hàng", body: "Đặt đơn từ giỏ hàng, rồi tra cứu đơn bằng mã và số điện thoại.", href: () => "/gio-hang" },
  { title: "Xử lý ở quản trị", body: "Đăng nhập trang quản trị, xác nhận đơn, xem sổ kho thay đổi theo đơn.", admin: true },
  { title: "Nhiệm vụ và gacha", body: "Đăng ký tài khoản, nhận xu từ nhiệm vụ, quay thử máy viên nang.", href: () => "/nhiem-vu" },
];
