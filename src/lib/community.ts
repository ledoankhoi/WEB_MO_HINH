// Cộng đồng (/cong-dong): dùng chung cho máy chủ và trình duyệt.

export const COMMUNITY_TOPICS = {
  "chia-se": "Chia sẻ",
  "hoi-dap": "Hỏi đáp",
  "trung-bay": "Góc trưng bày",
  "cua-hang": "Góp ý cửa hàng",
} as const;
export type CommunityTopic = keyof typeof COMMUNITY_TOPICS;
export const isCommunityTopic = (value: string): value is CommunityTopic => value in COMMUNITY_TOPICS;

export const POST_MIN = 10;
export const POST_MAX = 2000;
export const COMMENT_MAX = 500;
export const MAX_POST_IMAGES = 4;
export const MAX_POST_IMAGE_BYTES = 3 * 1024 * 1024;

export const REPORT_REASONS = {
  spam: "Quảng cáo, spam",
  "xuc-pham": "Xúc phạm, quấy rối",
  "sai-su-that": "Thông tin sai, lừa đảo",
  khac: "Lý do khác",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const isReportReason = (value: string): value is ReportReason => value in REPORT_REASONS;

export type CommunityPost = {
  id: string;
  topic: CommunityTopic;
  body: string;
  status: "pending" | "approved" | "hidden";
  moderationNote: string;
  createdAt: number;
  author: { id: string; name: string };
  images: string[];
  product: { slug: string; name: string; image: string | null; price: number } | null;
  likes: number;
  comments: number;
  likedByViewer: boolean;
};

export type CommunityComment = { id: string; body: string; createdAt: number; author: { id: string; name: string }; status: "visible" | "hidden" };
