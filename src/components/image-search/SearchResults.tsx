"use client";

import Link from "next/link";
import { CircleCheck, CircleHelp, CircleX, Lightbulb } from "lucide-react";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { IMAGE_SEARCH_MODEL, type ImageSearchResponse } from "@/lib/image-search";

// Thông tin của một lượt tìm để giải thích kết quả (mục "Hệ thống quyết định thế nào").
export type SearchTrace = {
  // Ảnh vuông đúng phần đưa vào mô hình.
  thumbnail: string;
  // Vài số đầu của vector đặc trưng đã chuẩn hoá.
  head: number[];
  modelCached: boolean;
  loadMs: number;
  embedMs: number;
  serverMs: number;
  cropped: boolean;
};

type Hit = ImageSearchResponse["results"][number];

const decimal = (value: number, digits = 3) => value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
// Độ giống hiển thị cho khách: cô-sin × 100, cắt ở 0.
const percent = (score: number) => Math.round(Math.max(0, Math.min(1, score)) * 100);
const duration = (ms: number) => (ms >= 1000 ? `${decimal(ms / 1000, 1)} giây` : `${Math.round(ms)} ms`);

// Thanh độ giống, vạch đứng là ngưỡng τ.
function Meter({ score, tau, strong = false }: { score: number; tau: number; strong?: boolean }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
      <div className={`h-full rounded-full ${strong ? "bg-brand" : "bg-muted/50"}`} style={{ width: `${percent(score)}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-fg/70" style={{ left: `${percent(tau)}%` }} title={`Ngưỡng τ = ${decimal(tau)}`} />
    </div>
  );
}

function FormBadge({ hit }: { hit: Hit }) {
  if (hit.form !== "alt" || !hit.label) return null;
  return <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold text-bg">Khớp {hit.label.toLowerCase()}</span>;
}

function BestMatch({ hit, tau }: { hit: Hit; tau: number }) {
  const { product } = hit;
  const href = `/san-pham/${product.slug}`;
  return (
    <article className="grid gap-5 rounded-2xl border border-brand/40 bg-surface p-4 shadow-lg shadow-brand/5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:p-5">
      <Link href={href} className="product-stage relative block aspect-square overflow-hidden rounded-xl" tabIndex={-1} aria-hidden>
        <ProductImage src={product.image} alt="" className="size-full p-4" />
      </Link>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[11px] font-bold tracking-wider text-brand-strong uppercase">{getCategory(product.category)?.name ?? "Mô hình"}</p>
        <h3 className="text-xl leading-snug font-bold">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        {product.tagline && <p className="text-sm text-muted">{product.tagline}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold tabular-nums">{formatVnd(product.price)}</span>
          {product.stock <= 0 && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium">Hết hàng</span>}
          <FormBadge hit={hit} />
        </div>
        <div className="space-y-1.5 pt-1">
          <p className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Độ giống</span>
            <span className="font-semibold tabular-nums">{percent(hit.score)}%</span>
          </p>
          <Meter score={hit.score} tau={tau} strong />
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <ButtonLink href={href} size="lg">
            Xem sản phẩm
          </ButtonLink>
          <AddToCartButton id={product.variantId} name={product.name} stock={product.stock} size="lg" label="Thêm vào giỏ" />
        </div>
      </div>
    </article>
  );
}

function MatchCard({ hit, tau, accepted }: { hit: Hit; tau: number; accepted: boolean }) {
  const { product } = hit;
  const href = `/san-pham/${product.slug}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5">
      <Link href={href} className="product-stage relative block aspect-square overflow-hidden" tabIndex={-1} aria-hidden>
        <ProductImage src={product.image} alt="" className="size-full p-4 transition duration-500 group-hover:scale-105" />
        <span className="absolute top-2.5 left-2.5 rounded-full border border-line bg-surface/95 px-2 py-0.5 text-xs font-semibold tabular-nums">
          {percent(hit.score)}%
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h4 className="line-clamp-2 text-sm leading-snug font-semibold">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h4>
        <p className="text-sm font-bold tabular-nums">{formatVnd(product.price)}</p>
        <div className="mt-auto space-y-1.5 pt-1">
          <FormBadge hit={hit} />
          <Meter score={hit.score} tau={tau} strong={accepted && hit.score >= tau} />
        </div>
      </div>
    </article>
  );
}

const TIPS = [
  "Chụp trọn con robot, không bị che hay cắt mất đầu, chân.",
  "Nền đơn giản, đủ sáng; tránh chụp ngược sáng.",
  "Ảnh có nhiều đồ vật thì kéo chuột trên ảnh để khoanh vùng con robot.",
  "Thử một góc khác: chính diện hoặc chéo 45° thường cho kết quả tốt nhất.",
];

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <CircleCheck className="size-4 shrink-0 text-success" aria-label="đạt" />
  ) : (
    <CircleX className="size-4 shrink-0 text-danger" aria-label="không đạt" />
  );
}

function Explain({ response, trace }: { response: ImageSearchResponse; trace: SearchTrace }) {
  const { s1, s2, tau, delta, candidates, results } = response;
  const passTau = s1 >= tau;
  const passDelta = s1 - s2 >= delta;
  const top = results.slice(0, 5);

  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-4 text-brand-strong" aria-hidden />
        Hệ thống quyết định thế nào?
        <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Xem từng bước</span>
      </summary>
      <ol className="grid gap-3 border-t border-line p-4 text-sm sm:grid-cols-2">
        <li className="space-y-2 rounded-xl bg-raised/60 p-3">
          <p className="font-semibold">1. Ảnh đưa vào mô hình</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nhỏ tạo ngay trong trình duyệt (data URL) */}
            <img src={trace.thumbnail} alt="Phần ảnh đưa vào mô hình" width={64} height={64} className="size-16 rounded-lg border border-line object-cover" />
            <p className="text-muted">
              {trace.cropped ? "Vùng bạn khoanh" : "Cả ảnh"}, cắt vuông ở giữa rồi thu về {IMAGE_SEARCH_MODEL.size} × {IMAGE_SEARCH_MODEL.size} điểm ảnh.
            </p>
          </div>
        </li>
        <li className="space-y-2 rounded-xl bg-raised/60 p-3">
          <p className="font-semibold">2. Trích đặc trưng</p>
          <p className="text-muted">
            {IMAGE_SEARCH_MODEL.label} biến ảnh thành vector {IMAGE_SEARCH_MODEL.dim} số, chuẩn hoá về độ dài 1. Vài số đầu:
          </p>
          <p className="font-mono text-xs break-all">[{trace.head.map((value) => decimal(value, 4)).join("; ")}; …]</p>
        </li>
        <li className="space-y-2 rounded-xl bg-raised/60 p-3">
          <p className="font-semibold">3. So với {candidates} sản phẩm</p>
          <p className="text-muted">
            Mỗi sản phẩm có một vector đại diện, gộp từ 12 góc nhìn dựng từ mô hình 3D. Điểm là cô-sin giữa hai vector.
          </p>
          <ul className="space-y-1.5">
            {top.map((hit, index) => (
              <li key={hit.product.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate">
                  {index === 0 ? "s₁" : index === 1 ? "s₂" : `#${index + 1}`} · {hit.product.name}
                </span>
                <span className="font-mono text-xs tabular-nums">{decimal(hit.score)}</span>
                <span className="col-span-2">
                  <Meter score={hit.score} tau={tau} strong={index === 0} />
                </span>
              </li>
            ))}
          </ul>
        </li>
        <li className="space-y-2 rounded-xl bg-raised/60 p-3">
          <p className="font-semibold">4. Chấp nhận hay từ chối</p>
          <p className="flex items-center gap-2">
            <Check ok={passTau} />
            <span>
              Đủ giống: s₁ = {decimal(s1)} {passTau ? "≥" : "<"} τ = {decimal(tau)}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Check ok={passDelta} />
            <span>
              Không lưỡng lự: s₁ − s₂ = {decimal(s1 - s2)} {passDelta ? "≥" : "<"} δ = {decimal(delta)}
            </span>
          </p>
          <p className="font-medium">{response.accepted ? "→ Trả về sản phẩm hạng 1." : "→ Từ chối, không đoán bừa một sản phẩm."}</p>
        </li>
      </ol>
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        Tải mô hình: {trace.modelCached ? "có sẵn trên máy" : duration(trace.loadMs)} · Trích đặc trưng: {duration(trace.embedMs)} · Máy chủ xếp hạng:{" "}
        {duration(trace.serverMs)} · Ảnh của bạn không được gửi lên máy chủ, chỉ có vector {IMAGE_SEARCH_MODEL.dim} số.
      </p>
    </details>
  );
}

export function SearchResults({ response, trace }: { response: ImageSearchResponse; trace: SearchTrace }) {
  const { accepted, reason, results, tau } = response;
  const [best, ...rest] = results;

  return (
    <div className="space-y-6">
      {accepted && best ? (
        <section className="space-y-3" aria-labelledby="best-match">
          <h2 id="best-match" className="flex items-center gap-2 text-lg font-bold">
            <CircleCheck className="size-5 text-success" aria-hidden />
            Tìm thấy mẫu giống nhất
          </h2>
          <BestMatch hit={best} tau={tau} />
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-labelledby="no-match">
          <h2 id="no-match" className="flex items-center gap-2 text-lg font-bold">
            <CircleX className="size-5 text-danger" aria-hidden />
            {reason === "ambiguous" ? "Ảnh giống nhiều mẫu, chưa chắc là mẫu nào" : "Chưa tìm thấy mẫu này trong cửa hàng"}
          </h2>
          <p className="text-sm text-muted">
            {reason === "ambiguous"
              ? "Hai mẫu đứng đầu có điểm quá sát nhau nên hệ thống không tự chọn. Bạn xem các mẫu bên dưới, hoặc chụp lại rõ hơn để hệ thống phân biệt được."
              : "Ảnh không đủ giống mẫu nào cửa hàng đang bán. Có thể cửa hàng chưa có mẫu này, hoặc ảnh khó nhận (tối, mờ, robot quá nhỏ)."}
          </p>
          <ul className="grid gap-1.5 text-sm">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {tip}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Hoặc{" "}
            <Link href="/san-pham" className="font-medium text-brand-strong hover:underline">
              tìm theo tên trong cửa hàng
            </Link>
            .
          </p>
        </section>
      )}

      {(accepted ? rest : results).length > 0 && (
        <section className="space-y-3" aria-labelledby="similar">
          <h2 id="similar" className="text-base font-semibold">
            {accepted ? "Mẫu khác gần giống" : reason === "ambiguous" ? "Có phải một trong các mẫu này?" : "Các mẫu gần nhất (độ giống thấp)"}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {(accepted ? rest : results).slice(0, 8).map((hit) => (
              <li key={hit.product.id}>
                <MatchCard hit={hit} tau={tau} accepted={accepted} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Explain response={response} trace={trace} />
    </div>
  );
}
