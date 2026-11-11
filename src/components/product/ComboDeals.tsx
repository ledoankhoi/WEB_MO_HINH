"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";
import { cart } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { ProductImage } from "./ProductCard";

type Deal = { id: string; name: string; percent: number; members: ProductSummary[] };

// Combo có sản phẩm này (nghiep-vu-ban-hang mục 12): thành viên, giá cả bộ trước và sau giảm, nút thêm cả bộ vào giỏ.
export function ComboDeals({ deals, currentId }: { deals: Deal[]; currentId: string }) {
  const router = useRouter();
  if (deals.length === 0) return null;
  return (
    <section aria-labelledby="combo" className="space-y-4">
      <h2 id="combo" className="text-2xl font-bold tracking-tight">
        Mua đủ bộ, giảm thêm
      </h2>
      {deals.map((deal) => {
        const full = deal.members.reduce((sum, member) => sum + member.price, 0);
        const sellable = deal.members.every((member) => member.stock > 0 || member.preorder);
        return (
          <div key={deal.id} className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-lg font-bold">
                {deal.name} <span className="text-brand">−{deal.percent}%</span>
              </p>
              <p className="text-sm text-muted">
                Cả bộ {deal.members.length} món: <span className="line-through tabular-nums">{formatVnd(full)}</span>{" "}
                <strong className="text-base text-fg tabular-nums">{formatVnd(full - Math.floor((full * deal.percent) / 100))}</strong>
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {deal.members.map((member) => (
                <li key={member.id}>
                  <Link
                    href={`/san-pham/${member.slug}`}
                    aria-current={member.id === currentId ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-2xl border p-2 text-sm transition hover:border-brand ${member.id === currentId ? "border-brand" : "border-line"}`}
                  >
                    <ProductImage src={member.image} alt="" className="product-stage size-12 shrink-0 rounded-xl" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{member.name}</span>
                      <span className="text-muted tabular-nums">{formatVnd(member.price)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Button
              disabled={!sellable}
              onClick={() => {
                const added = deal.members.reduce((sum, member) => sum + cart.add(member.variantId, 1), 0);
                showToast(added > 0 ? `Đã thêm bộ ${deal.name} vào giỏ hàng.` : "Giỏ hàng đã có đủ bộ này.", { tone: added > 0 ? "success" : "info" });
                router.push("/gio-hang");
              }}
            >
              {sellable ? "Thêm cả bộ vào giỏ" : "Có món đang hết hàng"}
            </Button>
          </div>
        );
      })}
    </section>
  );
}
