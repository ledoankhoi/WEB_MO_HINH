import type { CategorySlug, ProductSpec, RobotColors, RobotModelKey } from "@/lib/catalog";

export type SeedProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategorySlug;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  model: RobotModelKey;
  colors: RobotColors;
  specs: ProductSpec[];
  featured: boolean;
};

// Danh mục MẪU để cửa hàng có sẵn dữ liệu khi chạy lần đầu. Sửa hoặc xoá trong trang quản trị.
// Ảnh đại diện tương ứng nằm ở public/products/<slug>.webp.
export const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: "aegis-x1",
    name: "Aegis X1",
    tagline: "Robot hình người cỡ lớn, 32 khớp cử động",
    description:
      "Aegis X1 là mẫu humanoid chủ lực của RoboStore với thân giáp bo tròn, lõi năng lượng phát sáng ở ngực và kính che mắt dạng dải.\n\nKhung xương hợp kim cho phép tạo dáng vững ở hầu hết tư thế, từ đứng nghiêm đến quỳ một gối. Bộ sản phẩm kèm đế trưng bày và hai cặp bàn tay thay thế.",
    category: "mecha-anime",
    price: 2_490_000,
    compareAtPrice: null,
    stock: 12,
    model: "humanoid",
    colors: { primary: "#cbd5e1", secondary: "#334155", accent: "#38bdf8" },
    specs: [
      { label: "Tỉ lệ", value: "1/12" },
      { label: "Chiều cao", value: "28 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, khung hợp kim kẽm" },
      { label: "Khớp cử động", value: "32 khớp" },
      { label: "Đèn LED", value: "Mắt và lõi ngực (pin LR44)" },
      { label: "Phụ kiện", value: "Đế trưng bày, 2 cặp bàn tay" },
      { label: "Độ tuổi", value: "Từ 14 tuổi" },
    ],
    featured: true,
  },
  {
    slug: "orion-s",
    name: "Orion S",
    tagline: "Phiên bản sưu tầm sơn chàm phối vàng kim",
    description:
      "Orion S dùng chung bộ khung với Aegis X1 nhưng được sơn thủ công nhiều lớp màu chàm, các khớp và chi tiết mạ vàng kim.\n\nMỗi mô hình có số thứ tự khắc dưới đế và đi kèm hộp trưng bày mica chống bụi. Số lượng mỗi đợt sản xuất có giới hạn.",
    category: "figure",
    price: 3_290_000,
    compareAtPrice: null,
    stock: 3,
    model: "humanoid",
    colors: { primary: "#3b3fa8", secondary: "#c9a227", accent: "#fde68a" },
    specs: [
      { label: "Tỉ lệ", value: "1/12" },
      { label: "Chiều cao", value: "28 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, hợp kim, chi tiết mạ" },
      { label: "Khớp cử động", value: "32 khớp" },
      { label: "Hoàn thiện", value: "Sơn thủ công nhiều lớp" },
      { label: "Phụ kiện", value: "Hộp mica, đế khắc số thứ tự" },
      { label: "Độ tuổi", value: "Từ 14 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "titan-mk2",
    name: "Titan MK-II",
    tagline: "Mecha hạng nặng với buồng lái và pháo vai",
    description:
      "Titan MK-II là cỗ máy hai chân khớp ngược với buồng lái kính, hai cụm tên lửa trên vai và pháo chính gắn tay phải.\n\nPhần thân trên xoay 360 độ, chân có giảm chấn lò xo thật nên mô hình đứng rất chắc dù nặng gần một ký. Đèn buồng lái và ống xả đổi màu theo công tắc sau lưng.",
    category: "robot-hop-the",
    price: 4_590_000,
    compareAtPrice: null,
    stock: 4,
    model: "mech",
    colors: { primary: "#5f6f3c", secondary: "#2b2f36", accent: "#fb923c" },
    specs: [
      { label: "Tỉ lệ", value: "1/35" },
      { label: "Chiều cao", value: "31 cm" },
      { label: "Khối lượng", value: "960 g" },
      { label: "Chất liệu", value: "Nhựa ABS, khung đúc hợp kim" },
      { label: "Khớp cử động", value: "24 khớp, chân có giảm chấn" },
      { label: "Đèn LED", value: "Buồng lái và ống xả (3 pin AAA)" },
      { label: "Độ tuổi", value: "Từ 15 tuổi" },
    ],
    featured: true,
  },
  {
    slug: "nova-mini",
    name: "Nova Mini",
    tagline: "Robot để bàn nhỏ gọn với đôi mắt biết chớp",
    description:
      "Nova Mini là người bạn nhỏ cho bàn làm việc: thân tròn, đầu to và màn hình mặt hiển thị đôi mắt phát sáng.\n\nHai tay và đầu xoay được, ăng-ten có đèn báo. Đế từ tính giúp mô hình trông như đang lơ lửng trên vòng sáng.",
    category: "figure",
    price: 990_000,
    compareAtPrice: null,
    stock: 30,
    model: "companion",
    colors: { primary: "#f8fafc", secondary: "#f97316", accent: "#22d3ee" },
    specs: [
      { label: "Chiều cao", value: "12 cm" },
      { label: "Chất liệu", value: "Nhựa ABS phủ nhám" },
      { label: "Khớp cử động", value: "Đầu và hai tay" },
      { label: "Đèn LED", value: "Mắt, ăng-ten, vòng đế (sạc USB-C)" },
      { label: "Phụ kiện", value: "Đế từ tính, cáp sạc" },
      { label: "Độ tuổi", value: "Từ 8 tuổi" },
    ],
    featured: true,
  },
  {
    slug: "pico-mint",
    name: "Pico Mint",
    tagline: "Phiên bản bạc hà phối hồng của dòng Nova",
    description:
      "Pico Mint mang dáng tròn trịa của Nova Mini với tông bạc hà dịu mắt, chi tiết hồng san hô và đôi mắt vàng ấm.\n\nLớp sơn nhám mịn không bám vân tay, hợp để trang trí kệ sách hoặc làm quà tặng.",
    category: "figure",
    price: 1_090_000,
    compareAtPrice: null,
    stock: 18,
    model: "companion",
    colors: { primary: "#99f6e4", secondary: "#fb7185", accent: "#fde047" },
    specs: [
      { label: "Chiều cao", value: "12 cm" },
      { label: "Chất liệu", value: "Nhựa ABS phủ nhám" },
      { label: "Khớp cử động", value: "Đầu và hai tay" },
      { label: "Đèn LED", value: "Mắt, ăng-ten, vòng đế (sạc USB-C)" },
      { label: "Phụ kiện", value: "Đế từ tính, cáp sạc, hộp quà" },
      { label: "Độ tuổi", value: "Từ 8 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "skyline-q4",
    name: "Skyline Q4",
    tagline: "Drone bốn cánh với gimbal camera xoay được",
    description:
      "Skyline Q4 tái hiện một chiếc drone trinh sát: thân vỏ trắng nhám, bốn cánh quạt có vòng bảo vệ và cụm camera treo dưới mũi.\n\nCánh quạt quay tự do, càng đáp gập được. Trụ trưng bày trong suốt cho phép chỉnh góc nghiêng như đang bay.",
    category: "transformers",
    price: 1_890_000,
    compareAtPrice: null,
    stock: 9,
    model: "drone",
    colors: { primary: "#e2e8f0", secondary: "#64748b", accent: "#22d3ee" },
    specs: [
      { label: "Tỉ lệ", value: "1/6" },
      { label: "Sải cánh", value: "26 cm" },
      { label: "Chất liệu", value: "Nhựa ABS phủ nhám" },
      { label: "Chi tiết động", value: "4 cánh quạt, gimbal, càng đáp" },
      { label: "Đèn LED", value: "Đèn định vị trước và sau" },
      { label: "Phụ kiện", value: "Trụ trưng bày chỉnh góc" },
      { label: "Độ tuổi", value: "Từ 12 tuổi" },
    ],
    featured: true,
  },
  {
    slug: "orbit-sentinel",
    name: "Orbit Sentinel",
    tagline: "Cầu canh gác với hai vòng con quay",
    description:
      "Orbit Sentinel là khối cầu tuần tra với một mắt cảm biến lớn và hai vòng con quay xoay độc lập quanh thân.\n\nĐế nam châm nâng mô hình lơ lửng cách mặt bàn vài milimét; chạm nhẹ là cả khối cầu xoay chậm rất lâu.",
    category: "super-sentai",
    price: 1_290_000,
    compareAtPrice: null,
    stock: 20,
    model: "orb",
    colors: { primary: "#f1f5f9", secondary: "#2563eb", accent: "#60a5fa" },
    specs: [
      { label: "Đường kính", value: "11 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, vòng nhôm anod" },
      { label: "Chi tiết động", value: "2 vòng con quay xoay tự do" },
      { label: "Đèn LED", value: "Mắt cảm biến (sạc USB-C)" },
      { label: "Phụ kiện", value: "Đế nâng từ tính" },
      { label: "Độ tuổi", value: "Từ 10 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "arachne-h6",
    name: "Arachne H6",
    tagline: "Nhện máy sáu chân, mỗi chân ba khớp",
    description:
      "Arachne H6 có thân thấp, sáu chân ba khớp và cụm mắt cảm biến đỏ phía trước.\n\nCác khớp dùng bánh cóc nên giữ dáng rất tốt, dù bạn tạo thế bò sát đất hay vươn cao hai chân trước. Mũi chân bọc cao su chống trượt.",
    category: "mecha-anime",
    price: 2_790_000,
    compareAtPrice: null,
    stock: 6,
    model: "spider",
    colors: { primary: "#18181b", secondary: "#b91c1c", accent: "#ef4444" },
    specs: [
      { label: "Sải chân", value: "34 cm" },
      { label: "Chiều cao", value: "14 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, khớp POM" },
      { label: "Khớp cử động", value: "18 khớp bánh cóc" },
      { label: "Đèn LED", value: "Cụm mắt (pin LR44)" },
      { label: "Độ tuổi", value: "Từ 14 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "bolt-k9",
    name: "Bolt K9",
    tagline: "Chó robot bốn chân, dáng thể thao",
    description:
      "Bolt K9 lấy cảm hứng từ các mẫu robot bốn chân: thân dài, chân gập ngược và đầu cảm biến với dải đèn phía trước.\n\nMỗi chân có ba khớp nên mô hình có thể ngồi, nằm hoặc đứng chồm. Đuôi ăng-ten làm bằng thép đàn hồi.",
    category: "transformers",
    price: 2_390_000,
    compareAtPrice: null,
    stock: 10,
    model: "hound",
    colors: { primary: "#facc15", secondary: "#1f2937", accent: "#60a5fa" },
    specs: [
      { label: "Tỉ lệ", value: "1/8" },
      { label: "Chiều dài", value: "24 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, khung hợp kim" },
      { label: "Khớp cử động", value: "14 khớp" },
      { label: "Đèn LED", value: "Dải đèn đầu (pin LR44)" },
      { label: "Phụ kiện", value: "Đế trưng bày" },
      { label: "Độ tuổi", value: "Từ 12 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "terra-r6",
    name: "Terra R6",
    tagline: "Xe thám hiểm sáu bánh với cần camera",
    description:
      "Terra R6 mô phỏng một xe tự hành thám hiểm: sáu bánh treo độc lập, tấm pin mặt trời trên lưng và cần camera xoay.\n\nHệ treo hoạt động thật nên xe bám đều trên bề mặt gồ ghề. Cánh tay lấy mẫu phía trước có ba khớp và kẹp gắp.",
    category: "transformers",
    price: 2_190_000,
    compareAtPrice: null,
    stock: 7,
    model: "rover",
    colors: { primary: "#e7dcc3", secondary: "#57534e", accent: "#f59e0b" },
    specs: [
      { label: "Tỉ lệ", value: "1/10" },
      { label: "Chiều dài", value: "25 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, bánh cao su" },
      { label: "Chi tiết động", value: "Hệ treo 6 bánh, cần camera, tay gắp" },
      { label: "Phụ kiện", value: "Đế địa hình giả lập" },
      { label: "Độ tuổi", value: "Từ 12 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "axis-a6",
    name: "Axis A6",
    tagline: "Cánh tay robot công nghiệp sáu trục",
    description:
      "Axis A6 là mô hình cánh tay robot sáu trục màu cam quen thuộc trong nhà máy, thu nhỏ để đặt trên bàn.\n\nTất cả các trục đều xoay được và giữ vị trí bằng ma sát. Kẹp gắp đầu tay mở rộng tới 3 cm, đủ để giữ bút hoặc danh thiếp.",
    category: "model-kits",
    price: 1_590_000,
    compareAtPrice: null,
    stock: 14,
    model: "arm",
    colors: { primary: "#f97316", secondary: "#27272a", accent: "#a3e635" },
    specs: [
      { label: "Tỉ lệ", value: "1/10" },
      { label: "Tầm với", value: "30 cm" },
      { label: "Chất liệu", value: "Nhựa ABS, đế kim loại" },
      { label: "Số trục", value: "6 trục và kẹp gắp" },
      { label: "Đèn LED", value: "Đèn trạng thái ở đế" },
      { label: "Độ tuổi", value: "Từ 12 tuổi" },
    ],
    featured: false,
  },
  {
    slug: "retro-tin-58",
    name: "Retro Tin 58",
    tagline: "Robot thiếc cổ điển với chìa khoá dây cót",
    description:
      "Retro Tin 58 gợi lại những chú robot đồ chơi bằng thiếc giữa thế kỷ trước: thân hộp vuông, mắt tròn, tay ống xếp và chìa khoá dây cót sau lưng.\n\nVặn dây cót, robot sẽ lắc lư tiến về phía trước. Lớp sơn men bóng được làm giả cổ nhẹ ở các cạnh.",
    category: "model-kits",
    price: 790_000,
    compareAtPrice: null,
    stock: 25,
    model: "retro",
    colors: { primary: "#dc2626", secondary: "#0f766e", accent: "#fde047" },
    specs: [
      { label: "Chiều cao", value: "18 cm" },
      { label: "Chất liệu", value: "Thép lá mạ thiếc, sơn men" },
      { label: "Cơ cấu", value: "Dây cót, tự bước đi" },
      { label: "Hoàn thiện", value: "Giả cổ nhẹ ở các cạnh" },
      { label: "Độ tuổi", value: "Từ 8 tuổi" },
    ],
    featured: false,
  },
];
