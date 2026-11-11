import { Gift, Lightbulb, Paintbrush, Sparkles, Tag, Wrench, type LucideIcon } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { formatVnd } from "@/lib/format";
import { groupsFor, type WorkshopGroup } from "@/lib/workshop";

const ICONS: Record<WorkshopGroup["key"], LucideIcon> = {
  paint: Paintbrush,
  finish: Sparkles,
  stand: Tag,
  led: Lightbulb,
  assembly: Wrench,
  decal: Tag,
  gift: Gift,
};

// Thẻ giới thiệu Xưởng trong trang chi tiết sản phẩm: các tuỳ biến có sẵn, giá từ bao nhiêu, nút mở trang Xưởng riêng
// (/san-pham/[slug]/xuong). Thẻ a thường: trang Xưởng tải khung 3D riêng, không cần chuyển trang phía trình duyệt.
export function WorkshopTeaser({ slug, category, image }: { slug: string; category: string; image: string | null }) {
  const groups = groupsFor(category);
  return (
    <section aria-labelledby="xuong-title" className="grid overflow-hidden border-3 border-ink bg-surface shadow-[10px_10px_0_var(--color-ink)] md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-4 p-5 sm:p-6">
        <h2 id="xuong-title" className="flex items-center gap-2 font-condensed text-3xl font-black uppercase italic">
          <Wrench className="size-7" strokeWidth={2.4} aria-hidden /> Xưởng ROBOTICA
        </h2>
        <p className="max-w-2xl text-sm">
          Tuỳ biến làm theo đơn trên chính mô hình bạn mua. Mở Xưởng để chọn từng bước và xem trước trên mô hình 3D: màu sơn, độ bóng, đế trưng bày có đèn,
          đèn LED mắt và ngực, decal tên riêng, hộp quà.
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {groups.map((group) => {
            const Icon = ICONS[group.key];
            const from = Math.min(...group.choices.filter((choice) => choice.price > 0).map((choice) => choice.price));
            return (
              <li key={group.key} className="flex items-center gap-2 border-2 border-ink px-2.5 py-1.5">
                <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 flex-1 font-semibold">{group.label}</span>
                <span className="shrink-0 text-xs text-muted">từ {formatVnd(from)}</span>
              </li>
            );
          })}
        </ul>
        <a
          href={`/san-pham/${slug}/xuong`}
          className="inline-flex h-14 items-center justify-center gap-2 border-3 border-ink bg-brand px-8 font-condensed text-xl font-black text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)] transition hover:-translate-y-0.5"
        >
          Mở Xưởng tuỳ biến →
        </a>
      </div>
      <div className="halftone hidden border-l-3 border-ink md:block">
        <ProductImage src={image} alt="" className="size-full p-6" />
      </div>
    </section>
  );
}
