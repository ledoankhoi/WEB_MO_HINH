import Link from "next/link";
import { RotateCw } from "lucide-react";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import type { Product } from "@/lib/types";

const STICKER = "self-start border-3 border-ink bg-surface px-3.5 py-1 font-condensed text-lg font-extrabold tracking-[0.04em] text-ink uppercase";

// Khối mở đầu trang chủ kiểu "bìa hộp": nền xanh coban, chữ nghiêng cỡ lớn, nhãn giá dán chéo. Có `members` (bộ hợp
// thể): giới thiệu "N robot. 1 <tên>." kèm các thành viên mua lẻ; không có thì giới thiệu một sản phẩm nổi bật.
export function ComboHero({ product, members }: { product: Product; members: Product[] }) {
  const combo = members.length > 0;
  const shortName = product.name.split(" (")[0].split(" ")[0];
  const height = product.specs.find((spec) => spec.label === "Chiều cao")?.value;
  const tagline = `${product.tagline}${height ? `, cao ${height.charAt(0).toLowerCase()}${height.slice(1)}` : ""}.`;

  return (
    <section aria-labelledby="hero-title" className="grid border-3 border-ink bg-cobalt shadow-[10px_10px_0_var(--color-ink)] lg:grid-cols-2">
      <div className="flex flex-col gap-5 p-6 text-white sm:p-10 lg:p-12">
        <p className={`${STICKER} -rotate-3`}>{combo ? `Bộ ${members.length} robot hợp thể` : (getCategory(product.category)?.name ?? "Nổi bật")}</p>
        <h1 id="hero-title" className="pt-2 font-condensed text-[clamp(3.25rem,7.5vw,5.5rem)] leading-[0.95] font-black tracking-[-0.01em] uppercase italic">
          {combo ? (
            <>
              {members.length} robot.
              <br />1 {shortName}.
            </>
          ) : (
            product.name
          )}
        </h1>
        <p className="max-w-[40ch] text-lg leading-relaxed font-medium text-[#e3eaff] sm:text-xl">{tagline}</p>
        <p className="mt-1 rotate-2 self-start border-3 border-ink bg-brand px-4 py-2.5 font-condensed text-3xl leading-none font-black text-white italic tabular-nums">
          {combo && <span className="mr-2 text-lg font-extrabold tracking-[0.04em] uppercase not-italic">Cả bộ</span>}
          {formatVnd(product.price)}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <ButtonLink href={`/san-pham/${product.slug}`} variant="secondary" size="lg">
            <RotateCw className="size-5" strokeWidth={2.6} aria-hidden />
            {combo ? "Xem hợp thể 3D" : "Xoay xem 3D"}
          </ButtonLink>
          <AddToCartButton id={product.variantId} name={product.name} stock={product.stock} size="lg" label="Thêm vào giỏ" />
        </div>
      </div>
      <div className="stripes-cobalt flex flex-col gap-4 border-t-3 border-ink p-5 sm:p-7 lg:border-t-0 lg:border-l-3">
        <ProductImage src={product.image} alt={product.name} className="h-72 w-full sm:h-[400px]" />
        {combo && (
          <ul aria-label="Các thành viên, mua lẻ được" className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {members.map((member) => (
              <li key={member.id}>
                <Link href={`/san-pham/${member.slug}`} className="flex flex-col items-center gap-1 border-2 border-ink bg-surface px-1.5 pt-2 pb-2.5 text-ink transition hover:bg-raised">
                  <ProductImage src={member.image} alt="" className="size-16" />
                  <span className="text-center font-condensed text-[15px] leading-tight font-extrabold uppercase">{member.name.split(" ")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
