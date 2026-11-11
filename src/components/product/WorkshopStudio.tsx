"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, Check, Eye, EyeOff, Moon, ShoppingCart, Sun, Wrench } from "lucide-react";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import type { RobotViewerProps } from "@/components/three/RobotViewer";
import type { WorkshopLook } from "@/components/three/Stage";
import { showToast } from "@/components/ui/Toaster";
import { cart } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import { DECAL_PATTERN, PAINT_TINTS, groupsFor, parseConfig, serializeConfig, type WorkshopGroup, type WorkshopSelection } from "@/lib/workshop";

// Xưởng ROBOTICA, trang riêng /san-pham/[slug]/xuong: khung 3D lớn bên trái, các bước tuỳ biến bên phải. Mọi tuỳ biến
// có hình đều hiện trên mô hình 3D: màu sơn, lớp hoàn thiện (độ bóng), đế trưng bày (bản LED phát sáng), đèn LED mắt và
// ngực, decal tên riêng (nhãn ở vai), hộp quà. Lắp ráp hộ là dịch vụ, không đổi hình. Giá tính lại ở máy chủ khi đặt.

// Tuỳ biến nào thấy trên khung 3D, và thấy ra sao.
const PREVIEW: Record<WorkshopGroup["key"], string | null> = {
  paint: "Đổi màu trên mô hình",
  finish: "Đổi độ bóng, ánh kim",
  stand: "Đế đặt dưới chân mô hình",
  led: "Đốm sáng ở mắt, ngực (bật Phòng tối để thấy rõ)",
  decal: "Nhãn tên ở vai mô hình",
  gift: "Hộp quà đặt cạnh mô hình",
  assembly: null,
};

const active = (value: string | undefined) => (value && value !== "none" ? value : null);

export function WorkshopStudio({
  slug,
  variantId,
  name,
  price,
  stock,
  category,
  viewer,
  parts,
}: {
  slug: string;
  variantId: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  viewer: RobotViewerProps;
  // Linh kiện trong hộp (products.box_contents), hiện cạnh chế độ bóc tách.
  parts: string[];
}) {
  const groups = groupsFor(category);
  const [selection, setSelection] = useState<WorkshopSelection>({});
  const [decalText, setDecalText] = useState("");
  const [explode, setExplode] = useState(0);
  const [dark, setDark] = useState(false);
  const [labels, setLabels] = useState(true);
  const [added, setAdded] = useState(false);

  const cleanDecal = decalText.trim().toUpperCase();
  const decalInvalid = selection.decal === "ten-rieng" && !DECAL_PATTERN.test(cleanDecal);
  const cfg = serializeConfig({ ...selection, decalText: cleanDecal });
  const config = parseConfig(cfg, category);
  const choose = (key: keyof WorkshopSelection, value: string) => {
    setAdded(false);
    setSelection((current) => {
      const next = { ...current, [key]: value };
      // Lớp hoàn thiện chỉ có khi sơn lại: bỏ sơn thì bỏ luôn lớp hoàn thiện.
      if (key === "paint" && value === "none") delete next.finish;
      return next;
    });
  };
  const hasLed = active(selection.led) !== null || selection.stand === "luc-giac-led";

  const look: WorkshopLook = {
    finish: active(selection.finish),
    stand: active(selection.stand),
    led: active(selection.led) !== null,
    decal: selection.decal === "ten-rieng" ? cleanDecal || "TÊN BẠN" : null,
    gift: active(selection.gift) !== null,
    labels,
    dark,
  };
  // Chip "đang xem" trên khung 3D: các lựa chọn khác "none".
  const chips = groups.flatMap((group) => {
    const key = active(selection[group.key]);
    if (!key) return [];
    const choice = group.choices.find((item) => item.key === key);
    return choice ? [{ group: group.key, text: group.key === "decal" ? `Decal "${cleanDecal || "…"}"` : choice.label }] : [];
  });

  const addToCart = () => {
    if (!config || decalInvalid) return;
    const count = cart.add(variantId, 1, stock, cfg);
    if (count > 0) {
      setAdded(true);
      showToast(cfg ? `Đã thêm ${name} (bản tuỳ biến) vào giỏ hàng.` : `Đã thêm ${name} vào giỏ hàng.`);
    } else showToast("Đã đạt số lượng tối đa có thể đặt cho mẫu này.", { tone: "error" });
  };

  const visible = groups.filter((group) => !group.requires || active(selection[group.requires]) !== null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Link href={`/san-pham/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-brand">
            <ArrowLeft className="size-4" aria-hidden /> Về trang sản phẩm
          </Link>
          <h1 className="flex flex-wrap items-center gap-x-3 font-condensed text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-black uppercase italic">
            <Wrench className="size-9" strokeWidth={2.6} aria-hidden /> Xưởng ROBOTICA
          </h1>
          <p className="text-lg font-semibold">{name}</p>
        </div>
        <p className="max-w-md text-sm text-muted">
          Thợ của xưởng làm theo đơn trên chính mô hình bạn mua. Chọn từng bước bên phải; mọi thay đổi có hình hiện ngay trên mô hình 3D.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start">
        {/* Khung 3D */}
        <div className="space-y-4 lg:sticky lg:top-40">
          <div className="flex min-h-7 flex-wrap items-center gap-1.5" aria-live="polite">
            <span className="font-condensed text-xs font-black text-muted uppercase">Đang xem:</span>
            {chips.length === 0 ? (
              <span className="border-2 border-ink bg-surface px-2 py-0.5 font-condensed text-xs font-black uppercase">Bản nguyên hộp</span>
            ) : (
              chips.map((chip) => (
                <span key={chip.group} className="flex items-center gap-1 border-2 border-ink bg-[#ffd23f] px-2 py-0.5 font-condensed text-xs font-black uppercase">
                  <Check className="size-3" strokeWidth={3} aria-hidden /> {chip.text}
                </span>
              ))
            )}
          </div>
          <div
            className={`relative h-[62vh] min-h-[420px] overflow-hidden border-3 border-ink shadow-[8px_8px_0_var(--color-ink)] transition-colors duration-500 ${dark ? "bg-[radial-gradient(circle_at_50%_40%,#2a2f3a,#0b0c0f_70%)]" : "halftone"}`}
          >
            <RobotViewerLoader {...viewer} tint={config?.tint ?? null} explode={explode} look={look} />
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setDark((value) => !value)}
                aria-pressed={dark}
                className={`flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-condensed text-xs font-black uppercase shadow-[2px_2px_0_var(--color-ink)] ${dark ? "bg-[#ffd23f] text-ink" : "bg-surface"}`}
              >
                {dark ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
                {dark ? "Bật đèn" : "Phòng tối"}
              </button>
              <button
                type="button"
                onClick={() => setLabels((value) => !value)}
                aria-pressed={labels}
                className="flex items-center gap-1.5 border-2 border-ink bg-surface px-2.5 py-1 font-condensed text-xs font-black uppercase shadow-[2px_2px_0_var(--color-ink)]"
              >
                {labels ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                {labels ? "Ẩn chú thích" : "Hiện chú thích"}
              </button>
              {hasLed && !dark && (
                <span className="max-w-[10rem] border-2 border-ink bg-ink px-2 py-1 text-[11px] leading-tight font-semibold text-white">
                  Bật Phòng tối để xem đèn LED sáng
                </span>
              )}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="flex items-center justify-between font-condensed text-lg font-extrabold uppercase">
              <span className="flex items-center gap-2">
                <Boxes className="size-5" strokeWidth={2.4} aria-hidden /> Bóc tách linh kiện
              </span>
              <span className="text-sm text-muted">{explode === 0 ? "Lắp nguyên" : `Tách ${Math.round(explode * 100)}%`}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(explode * 100)}
              onChange={(event) => setExplode(Number(event.target.value) / 100)}
              className="w-full accent-[var(--color-brand)]"
              aria-label="Mức bóc tách linh kiện"
            />
          </label>
          {parts.length > 0 && (
            <details className="border-3 border-ink bg-surface p-3">
              <summary className="cursor-pointer font-condensed text-base font-extrabold uppercase">Linh kiện trong hộp ({parts.length})</summary>
              <ol className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                {parts.map((part, index) => (
                  <li key={part} className="flex gap-2 border-2 border-ink px-2 py-1">
                    <span className="font-condensed font-black text-brand">{String(index + 1).padStart(2, "0")}</span>
                    {part}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>

        {/* Các bước tuỳ biến */}
        <div className="space-y-4">
          {visible.map((group, index) => {
            const step = index + 1;
            const current = selection[group.key] ?? group.choices[0].key;
            const preview = PREVIEW[group.key];
            return (
              <fieldset key={group.key} className="space-y-3 border-3 border-ink bg-surface p-4 shadow-[4px_4px_0_var(--color-ink)]">
                <legend className="sr-only">{group.label}</legend>
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center bg-ink font-condensed text-lg font-black text-white">{step}</span>
                  <div className="min-w-0 space-y-1">
                    <p className="font-condensed text-xl leading-none font-black uppercase italic">{group.label}</p>
                    <p className="text-xs text-muted">{group.description}</p>
                    <p className={`text-[11px] font-bold uppercase ${preview ? "text-cobalt" : "text-muted"}`}>
                      {preview ? `Xem trên 3D: ${preview}` : "Dịch vụ của thợ, không đổi hình trên 3D"}
                    </p>
                  </div>
                </div>
                <div className={group.key === "paint" ? "grid grid-cols-2 gap-2" : "space-y-1.5"} role="radiogroup" aria-label={group.label}>
                  {group.choices.map((choice) => {
                    const on = current === choice.key;
                    const swatch = group.key === "paint" ? PAINT_TINTS[choice.key] : undefined;
                    return (
                      <button
                        key={choice.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => choose(group.key, choice.key)}
                        className={`flex w-full items-center justify-between gap-2 border-3 px-3 py-2 text-left text-sm font-semibold transition ${
                          on ? "border-ink bg-ink text-white" : "border-line hover:border-ink"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {group.key === "paint" && (
                            <span
                              aria-hidden
                              className="size-5 shrink-0 rounded-full border-2 border-ink"
                              style={{ background: swatch ?? "repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)" }}
                            />
                          )}
                          <span className="min-w-0">
                            {choice.label}
                            {choice.note && <span className={`block text-xs font-normal ${on ? "text-white/80" : "text-muted"}`}>{choice.note}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{choice.price > 0 ? `+${formatVnd(choice.price)}` : "0 ₫"}</span>
                      </button>
                    );
                  })}
                </div>
                {group.key === "decal" && selection.decal === "ten-rieng" && (
                  <label className="block space-y-1 text-xs font-semibold">
                    Chữ in trên decal (hiện ngay trên mô hình)
                    <input
                      value={decalText}
                      onChange={(event) => setDecalText(event.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 12))}
                      placeholder="VD: MINH 01"
                      className="h-10 w-full border-3 border-ink px-2 font-mono text-sm tracking-widest uppercase"
                      aria-invalid={decalInvalid}
                    />
                    {decalInvalid && <span className="text-danger">Nhập 1–12 ký tự A–Z, 0–9.</span>}
                  </label>
                )}
              </fieldset>
            );
          })}

          {/* Tổng kết */}
          <div className="space-y-3 border-3 border-ink bg-surface p-4 shadow-[6px_6px_0_var(--color-ink)]">
            <p className="font-condensed text-xl font-black uppercase italic">Cấu hình của bạn</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Mô hình nguyên hộp</dt>
                <dd className="tabular-nums">{formatVnd(price)}</dd>
              </div>
              {(config?.lines ?? []).map((line) => (
                <div key={line.group} className="flex justify-between gap-3 text-muted">
                  <dt>
                    {line.group}: {line.label}
                  </dt>
                  <dd className="shrink-0 tabular-nums">+{formatVnd(line.price)}</dd>
                </div>
              ))}
              {config && config.leadDays > 0 && (
                <div className="flex justify-between gap-3 text-muted">
                  <dt>Thời gian xử lý thêm</dt>
                  <dd>{config.leadDays} ngày</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t-3 border-ink pt-2">
                <dt className="font-condensed text-lg font-extrabold uppercase">Tổng mỗi mô hình</dt>
                <dd className="font-condensed text-3xl font-black italic tabular-nums">{formatVnd(price + (config?.price ?? 0))}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={addToCart}
              disabled={stock <= 0 || !config || decalInvalid}
              className="flex h-14 w-full items-center justify-center gap-2 border-3 border-ink bg-brand font-condensed text-xl font-extrabold text-white uppercase shadow-[4px_4px_0_var(--color-ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="size-5" aria-hidden />
              {stock <= 0 ? "Tạm hết hàng" : cfg ? "Thêm cấu hình vào giỏ" : "Thêm bản nguyên hộp vào giỏ"}
            </button>
            {added && (
              <Link
                href="/gio-hang"
                className="flex h-11 items-center justify-center border-3 border-ink bg-[#ffd23f] font-condensed text-base font-black uppercase shadow-[3px_3px_0_var(--color-ink)]"
              >
                Xem giỏ hàng
              </Link>
            )}
            <p className="text-xs text-muted">Hàng tuỳ biến không đổi trả vì lý do không thích; vẫn bảo hành lỗi sản xuất và lỗi gia công của xưởng.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
