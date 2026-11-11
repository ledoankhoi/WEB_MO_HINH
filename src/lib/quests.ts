// Xu và nhiệm vụ (/nhiem-vu). Xu chỉ kiếm được từ nhiệm vụ và mua hàng, không nạp bằng tiền; dùng để quay gacha.

// Điểm danh mỗi ngày (theo giờ Việt Nam) và thưởng thêm khi điểm danh đủ 7 ngày liền.
export const CHECKIN_REWARD = 10;
export const STREAK_DAYS = 7;
export const STREAK_BONUS = 50;

// Mua hàng: mỗi đơn hoàn tất nhận 1 xu cho mỗi ORDER_COIN_STEP đồng (sau giảm giá, gồm phí giao).
export const ORDER_COIN_STEP = 10_000;
export const orderCoins = (total: number) => Math.floor(Math.max(total, 0) / ORDER_COIN_STEP);

// Nhiệm vụ làm một lần. `target` là mốc tiến độ; tiến độ do máy chủ tính từ dữ liệu thật (repo/quests.ts).
export const ONCE_QUESTS = [
  { key: "ho-so", title: "Hoàn thiện hồ sơ", description: "Có số điện thoại và ít nhất một địa chỉ trong sổ địa chỉ.", reward: 20, target: 2, href: "/tai-khoan/cai-dat" },
  { key: "yeu-thich", title: "Nhà sưu tầm tương lai", description: "Thêm 3 mẫu vào danh sách yêu thích.", reward: 15, target: 3, href: "/san-pham" },
  { key: "don-dau-tien", title: "Mô hình đầu tiên về nhà", description: "Có một đơn hàng hoàn tất.", reward: 100, target: 1, href: "/san-pham" },
  { key: "danh-gia", title: "Lời nhận xét đầu tiên", description: "Viết một đánh giá cho sản phẩm đã mua.", reward: 50, target: 1, href: "/tai-khoan" },
  { key: "cong-dong", title: "Lên sóng cộng đồng", description: "Có một bài đăng được duyệt ở trang Cộng đồng.", reward: 30, target: 1, href: "/cong-dong" },
  { key: "gacha", title: "Viên nang đầu tiên", description: "Quay gacha một lượt.", reward: 10, target: 1, href: "/gacha" },
] as const;
export type OnceQuestKey = (typeof ONCE_QUESTS)[number]["key"];

// Đọc hết một chương truyện tranh: mỗi chương thưởng một lần.
export const COMIC_READ_REWARD = 20;

// Nhãn lý do trong lịch sử xu.
export const COIN_REASONS: Record<string, string> = {
  checkin: "Điểm danh",
  "checkin-bonus": `Điểm danh ${STREAK_DAYS} ngày liền`,
  quest: "Nhiệm vụ",
  comic: "Đọc truyện tranh",
  order: "Mua hàng",
  gacha: "Quay gacha",
  "gacha-duplicate": "Thẻ trùng đổi xu",
  "gacha-set": "Hoàn thành bộ sưu tập",
};
