import type { ReactNode } from "react";

// Khối giao diện dùng chung của các trang cửa hàng ("Hộp mô hình": viền đen dày, bóng đổ khối, chữ hẹp đậm viết hoa).
// Trang chủ, Trưng bày và các trang mở rộng (docs/ke-hoach/mo-rong-cua-hang.md) dùng chung để cùng một phong cách.

export const BOX = "border-3 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)]";
export const BOX_LG = "border-3 border-ink shadow-[10px_10px_0_var(--color-ink)]";

// Tiêu đề mục: chữ nghiêng cỡ lớn, vạch màu bên dưới.
export function SectionHeading({ id, children, bar = "bg-brand" }: { id: string; children: ReactNode; bar?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 id={id} className="font-condensed text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-black uppercase italic">
        {children}
      </h2>
      <span aria-hidden className={`h-2.5 w-28 ${bar}`} />
    </div>
  );
}

// Nhãn dán xoay nghiêng (trên nền màu).
export function Sticker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`-rotate-3 self-start border-3 border-ink bg-surface px-3.5 py-1 font-condensed text-lg font-extrabold tracking-[0.04em] text-ink uppercase ${className}`}>
      {children}
    </p>
  );
}

const TONES = { cobalt: "bg-cobalt text-white", brand: "bg-brand text-white", ink: "bg-ink text-white" } as const;

// Khối mở đầu của một trang kiểu "bìa hộp": nhãn dán, tiêu đề nghiêng cỡ lớn, đoạn giới thiệu; `aside` nằm bên phải.
export function PageHero({
  sticker,
  title,
  intro,
  tone = "cobalt",
  aside,
}: {
  sticker: string;
  title: ReactNode;
  intro: ReactNode;
  tone?: keyof typeof TONES;
  aside?: ReactNode;
}) {
  return (
    <section className={`grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-12 ${BOX_LG} ${TONES[tone]}`}>
      <div className="flex flex-col gap-5">
        <Sticker>{sticker}</Sticker>
        <h1 className="pt-1 font-condensed text-[clamp(3rem,7vw,5.25rem)] leading-[0.95] font-black uppercase italic">{title}</h1>
        <div className="max-w-[52ch] text-lg leading-relaxed font-medium text-white/90">{intro}</div>
      </div>
      {aside}
    </section>
  );
}
