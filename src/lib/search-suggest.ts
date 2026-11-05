import { foldText } from "./format";
import type { ProductSummary } from "./types";

// Dữ liệu /api/goi-y trả về cho ô tìm kiếm ở đầu trang.
export type SearchSuggestions = {
  terms: string[];
  products: Pick<ProductSummary, "slug" | "name" | "category" | "price" | "image" | "stock" | "modelUrl">[];
  total: number;
};

// Cụm từ gợi ý khi khách đang gõ ô tìm kiếm, lấy từ tên các sản phẩm khớp: tại chỗ các từ khoá đứng liền nhau trong
// tên (từ cuối chỉ cần khớp phần đầu vì khách đang gõ dở), lấy từ đó tới hết 0–2 từ phía sau. Cụm có trong nhiều tên
// hơn đứng trước; bằng nhau thì cụm gặp trước đứng trước. So khớp không phân biệt dấu và hoa thường.
// Ví dụ "optimus" với ba tên Optimus Prime... cho "optimus prime", "optimus prime g1", "optimus prime rise".
export function suggestTerms(query: string, names: readonly string[], limit = 3): string[] {
  const terms = foldText(query).split(" ").filter(Boolean).slice(0, 6);
  if (terms.length === 0) return [];
  const typed = terms.join(" ");
  const found = new Map<string, { count: number; order: number }>();

  for (const name of names) {
    const words = name
      .toLowerCase()
      .replace(/[()[\]{},.:;!?"“”]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const folded = words.map(foldText);
    const start = folded.findIndex((_, index) =>
      terms.every((term, offset) => {
        const word = folded[index + offset];
        if (word === undefined) return false;
        return offset === terms.length - 1 ? word.startsWith(term) : word === term;
      }),
    );
    if (start < 0) continue;

    const seen = new Set<string>();
    for (let extra = 0; extra <= 2; extra++) {
      const end = start + terms.length + extra;
      if (end > words.length) break;
      const phrase = words.slice(start, end).join(" ");
      // Cụm trùng đúng từ khoá đã gõ thì không cần gợi ý.
      if (foldText(phrase) === typed || seen.has(phrase)) continue;
      seen.add(phrase);
      const current = found.get(phrase);
      if (current) current.count += 1;
      else found.set(phrase, { count: 1, order: found.size });
    }
  }

  return [...found.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map(([phrase]) => phrase);
}
