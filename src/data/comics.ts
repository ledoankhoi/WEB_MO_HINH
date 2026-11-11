// Truyện tranh của cửa hàng (/truyen-tranh): "Đêm ở kệ ROBOTICA", truyện ngắn tự viết về các mô hình trên kệ của cửa hàng
// thức dậy khi cửa hàng đóng cửa. Khung truyện dùng ảnh dựng 3D của sản phẩm (products.image) nên không cần vẽ tay;
// mỗi chương gắn các sản phẩm xuất hiện để khách bấm mua. Đọc hết một chương được tính cho nhiệm vụ (src/lib/quests.ts).

export type ComicBubble = { text: string; speaker?: string; side?: "left" | "right" };
export type ComicPanel = {
  // Bố cục trong lưới 6 cột: wide = cả hàng, half = nửa hàng, third = một phần ba.
  size: "wide" | "half" | "third";
  // Slug sản phẩm làm hình chính của khung; null là khung chỉ có chữ (lời dẫn).
  product: string | null;
  narration?: string;
  bubbles?: ComicBubble[];
  sfx?: string;
  background?: "burst" | "dots" | "ink";
  flip?: boolean;
};
export type ComicChapter = { slug: string; number: number; title: string; summary: string; panels: ComicPanel[] };

export const COMIC_TITLE = "Đêm ở kệ ROBOTICA";

export const COMIC_CHAPTERS: ComicChapter[] = [
  {
    slug: "chuong-1-ke-moi",
    number: 1,
    title: "Kệ mới",
    summary: "22 giờ, cửa hàng tắt đèn. Một chiếc hộp mới được đặt lên kệ, và cả dãy kệ bắt đầu cựa quậy.",
    panels: [
      { size: "wide", product: null, background: "ink", narration: "22:00. Cửa cuốn ROBOTICA kéo xuống. Ánh đèn cuối cùng tắt..." },
      { size: "half", product: "ironhide", background: "burst", sfx: "CẠCH!", bubbles: [{ speaker: "Ironhide", text: "Hộp này chật quá. Đây là đâu vậy?" }] },
      { size: "half", product: "jazz", background: "dots", flip: true, bubbles: [{ speaker: "Jazz", text: "Chào mừng tới kệ số 3, anh bạn. Ở đây đêm nào cũng có biến.", side: "right" }] },
      { size: "third", product: "hound", background: "dots", bubbles: [{ speaker: "Hound", text: "Suỵt! Có tiếng động ở kệ đối diện." }] },
      { size: "third", product: "alliance-megatron", background: "burst", sfx: "RẦM!", bubbles: [{ speaker: "Megatron", text: "Kệ số 3... cuối cùng cũng có đối thủ xứng tầm." }] },
      { size: "third", product: "ironhide", background: "dots", flip: true, bubbles: [{ speaker: "Ironhide", text: "Đối thủ à? Ta vừa mới mở hộp thôi mà!", side: "right" }] },
      { size: "wide", product: "alliance-optimus-prime", background: "burst", narration: "Ánh đèn trưng bày bật sáng.", bubbles: [{ speaker: "Optimus Prime", text: "Đủ rồi. Ở cửa hàng này không ai đánh nhau, chúng ta cùng chờ người sưu tầm của mình." }] },
    ],
  },
  {
    slug: "chuong-2-hop-the",
    number: 2,
    title: "Năm hộp, một gã khổng lồ",
    summary: "Năm chiếc hộp Combaticon xếp cạnh nhau. Giữa đêm, chúng tìm cách ghép thành Bruticus.",
    panels: [
      { size: "wide", product: null, background: "ink", narration: "Kệ hàng hợp thể, 01:30 sáng." },
      { size: "third", product: "onslaught", background: "dots", bubbles: [{ speaker: "Onslaught", text: "Đội hình! Brawl, Swindle, Vortex, Blast Off, vào vị trí!" }] },
      { size: "third", product: "brawl", background: "burst", sfx: "KÉT!", bubbles: [{ speaker: "Brawl", text: "Bánh xích của tôi kẹt vào giá đỡ rồi!" }] },
      { size: "third", product: "swindle", background: "dots", flip: true, bubbles: [{ speaker: "Swindle", text: "Ghép xong nhớ trả phí lắp ráp nhé.", side: "right" }] },
      { size: "half", product: "vortex", background: "dots", bubbles: [{ speaker: "Vortex", text: "Cánh quạt sẵn sàng!" }] },
      { size: "half", product: "blast-off", background: "burst", flip: true, sfx: "VÚT!", bubbles: [{ speaker: "Blast Off", text: "Mở đường cho tàu con thoi!", side: "right" }] },
      { size: "wide", product: "bruticus", background: "burst", sfx: "HỢP THỂ!", bubbles: [{ speaker: "Bruticus", text: "BRUTICUS... CAO BA MƯƠI CENTIMET!" }] },
      { size: "wide", product: "ironhide", background: "dots", bubbles: [{ speaker: "Ironhide", text: "Ừ, cao thật. Nhưng anh vừa làm đổ cả dãy hộp kia kìa." }] },
    ],
  },
  {
    slug: "chuong-3-nguoi-suu-tam",
    number: 3,
    title: "Người sưu tầm",
    summary: "Sáng ra cửa hàng mở cửa. Một vị khách dừng lại trước kệ số 3, và các robot phải giữ im lặng tuyệt đối.",
    panels: [
      { size: "wide", product: null, background: "ink", narration: "08:00. Cửa cuốn kéo lên. Mọi người vào vị trí, không ai được cử động!" },
      { size: "half", product: "alliance-bumblebee", background: "dots", bubbles: [{ speaker: "Bumblebee", text: "Có khách! Ai đứng thẳng lưng lên nào." }] },
      { size: "half", product: "alliance-starscream", background: "burst", flip: true, bubbles: [{ speaker: "Starscream", text: "Chắc chắn họ sẽ chọn ta. Ta bóng loáng nhất kệ.", side: "right" }] },
      { size: "third", product: "jazz", background: "dots", bubbles: [{ speaker: "Jazz", text: "Họ đang xoay xem 3D từng người kìa..." }] },
      { size: "third", product: "wheeljack", background: "burst", sfx: "TÍCH!", bubbles: [{ speaker: "Wheeljack", text: "Họ bấm \"Biến thành robot\" rồi!" }] },
      { size: "third", product: "ironhide", background: "dots", flip: true, bubbles: [{ speaker: "Ironhide", text: "...Họ thêm ta vào giỏ.", side: "right" }] },
      { size: "wide", product: "alliance-optimus-prime", background: "burst", narration: "Tối hôm đó, kệ số 3 có một khoảng trống.", bubbles: [{ speaker: "Optimus Prime", text: "Chúc may mắn, Ironhide. Hãy làm chủ nhân mới tự hào. Hết chương 3, còn tiếp..." }] },
    ],
  },
];

export function getComicChapter(slug: string): ComicChapter | null {
  return COMIC_CHAPTERS.find((chapter) => chapter.slug === slug) ?? null;
}

// Slug mọi sản phẩm xuất hiện trong một chương, theo thứ tự xuất hiện.
export function chapterProducts(chapter: ComicChapter): string[] {
  return [...new Set(chapter.panels.map((panel) => panel.product).filter((slug): slug is string => slug !== null))];
}
