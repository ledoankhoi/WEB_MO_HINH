// Hộp mù: nắp sọc coban, thân đỏ có dấu "?" vàng, logo và số hộp. Mọi hộp giống hệt nhau (không lộ gì bên trong).
export function BoxArt({
  slot,
  label,
  small = false,
  lidOpen = false,
  faded = false,
}: {
  slot: number;
  // Tên ngắn của series in trên hộp.
  label: string;
  small?: boolean;
  lidOpen?: boolean;
  faded?: boolean;
}) {
  return (
    <div className={`gx-box relative mx-auto aspect-[4/5] ${small ? "w-[88%]" : "w-full"} transition-opacity duration-500 ${faded ? "opacity-40" : ""}`}>
      <div className={`gx-lid stripes-cobalt absolute inset-x-[-4%] top-0 z-10 h-[20%] border-3 border-ink ${lidOpen ? "is-open" : ""}`}>
        <span className={`absolute inset-x-0 bottom-0 h-1/3 bg-ink/25`} />
      </div>
      <div className="absolute inset-x-0 top-[18%] bottom-0 flex flex-col items-center justify-center gap-[6%] border-3 border-t-0 border-ink bg-brand text-white shadow-[4px_4px_0_var(--color-ink)]">
        <span
          className={`grid aspect-square w-[46%] place-items-center rounded-full border-3 border-ink bg-[#ffd23f] font-condensed font-black text-ink ${small ? "text-2xl" : "text-6xl"}`}
        >
          ?
        </span>
        <span className={`font-condensed font-black tracking-wide uppercase italic ${small ? "text-[9px]" : "text-lg"}`}>ROBOTICA · {label}</span>
        <span className={`absolute top-1 right-1.5 font-condensed font-black ${small ? "text-[10px]" : "text-sm"}`}>#{String(slot + 1).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
