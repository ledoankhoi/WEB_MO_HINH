import Link from "next/link";
import { ProductGrid, ProductImage } from "@/components/product/ProductCard";
import { MobileBuyBar } from "@/components/product/MobileBuyBar";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductTabs } from "@/components/product/ProductTabs";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { WishlistButton } from "@/components/product/WishlistButton";
import { PRODUCT_PHOTOS } from "@/data/product-photos";
import { site } from "@/config/site";
import { getCategory } from "@/lib/catalog";
import { getModelFeatures, modelKey } from "@/lib/model-features";
import { formatDate, formatVnd } from "@/lib/format";
import type { Product, ProductSummary } from "@/lib/types";
import modelCredits from "@/data/model-credits.json";

type ModelCredit = { title: string; author: string; authorUrl: string; license: string; licenseUrl: string; sourceUrl: string };
const credits: Record<string, ModelCredit | undefined> = modelCredits;

// Thân trang sản phẩm. Trang cửa hàng và tab "Xem trước" của quản trị (YC-SP-08) dùng chung để bản xem
// trước giống hệt trang thật; `preview` thì không cho thêm vào giỏ.
export function ProductView({
  product,
  linked = [],
  related = [],
  reviews,
  media = [],
  preview = false,
}: {
  product: Product;
  linked?: Product[];
  related?: ProductSummary[];
  // Đánh giá đã duyệt (YC-DG-02); bản xem trước của quản trị không truyền.
  reviews?: { average: number; count: number; items: { id: string; userName: string; rating: number; comment: string; createdAt: number }[] };
  // Ảnh phụ trong thư viện ảnh (không gồm mô hình 3D).
  media?: { url: string; alt: string }[];
  preview?: boolean;
}) {
  const category = getCategory(product.category);
  const credit = credits[modelKey(product.modelUrl) ?? ""];
  const features = getModelFeatures(product.modelUrl);
  // Ghi nguồn khi ảnh đang hiển thị là ảnh của dữ liệu mẫu lấy từ cửa hàng khác.
  const seededPhotos = PRODUCT_PHOTOS[product.slug];
  const photoSet = seededPhotos && product.images.some((image) => seededPhotos.urls.includes(image.url)) ? seededPhotos : null;
  const boxItems = product.boxContents.split("\n").map((line) => line.trim()).filter(Boolean);
  const status = product.stock <= 0 ? "Hết hàng" : product.stock <= 3 ? `Sắp hết hàng (còn ${product.stock})` : "Còn hàng";

  const specs =
    product.specs.length > 0 ? (
      <dl className="grid gap-x-12 text-sm sm:grid-cols-2">
        {product.specs.map((spec) => (
          <div key={spec.label} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-line/70 py-3">
            <dt className="text-muted">{spec.label}</dt>
            <dd>{spec.value}</dd>
          </div>
        ))}
      </dl>
    ) : null;

  const reviewList = reviews && (
    <div className="space-y-4">
      {reviews.count === 0 ? (
        <p className="text-sm text-muted">Chưa có đánh giá nào. Khách đã mua có thể đánh giá trong trang tài khoản sau khi đơn hoàn tất.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {reviews.items.map((review) => (
            <li key={review.id} className="space-y-1 p-4 text-sm">
              <p className="flex flex-wrap items-center gap-x-3">
                <span className="text-warning" role="img" aria-label={`${review.rating} trên 5 sao`}>
                  {"★".repeat(review.rating)}
                  <span className="text-line">{"★".repeat(5 - review.rating)}</span>
                </span>
                <span className="font-medium">{review.userName}</span>
                <span className="text-muted">{formatDate(review.createdAt)}</span>
              </p>
              {review.comment && <p className="whitespace-pre-line text-muted">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const linkedList = linked.length > 0 && (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {linked.map((item) => (
        <li key={item.id}>
          <Link
            href={`/san-pham/${item.slug}`}
            className="flex items-center gap-3 rounded-2xl border border-line p-2 pr-4 transition hover:border-brand"
          >
            <ProductImage src={item.image} alt="" className="product-stage size-14 shrink-0 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{item.name}</span>
              <span className="text-sm text-muted tabular-nums">{formatVnd(item.price)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  const tabs = [
    {
      value: "chi-tiet",
      label: "Chi tiết",
      content: <div className="prose-store max-w-3xl text-sm leading-relaxed whitespace-pre-line text-muted">{product.description}</div>,
    },
    ...(boxItems.length > 0
      ? [
          {
            value: "trong-hop",
            label: "Trong hộp",
            content: (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {boxItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    ...(specs ? [{ value: "thong-so", label: `Thông số (${product.specs.length})`, content: specs }] : []),
    ...(linkedList ? [{ value: "hop-the", label: features?.members ? `Hợp thể (${linked.length})` : "Hợp thể thành", content: linkedList }] : []),
    ...(reviewList ? [{ value: "danh-gia", label: `Đánh giá (${reviews!.count})`, content: reviewList }] : []),
  ];

  const activeVariants = product.variants.filter((v) => v.isActive);
  const defaultVariant = activeVariants.find((v) => v.isDefault) ?? activeVariants[0];

  return (
    <div className="space-y-10 pb-24 lg:pb-0">
      <nav aria-label="Đường dẫn" className="text-sm text-muted">
        <Link href="/san-pham" className="hover:text-fg">
          Cửa hàng
        </Link>
        {category && (
          <>
            {" / "}
            <Link href={`/san-pham?loai=${category.slug}`} className="hover:text-fg">
              {category.name}
            </Link>
          </>
        )}
        <span className="text-fg">{` / ${product.name}`}</span>
      </nav>

      <div className="-mt-4 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 space-y-2">
          <ProductGallery
            name={product.name}
            photos={media.length > 0 ? media : product.images}
            source={photoSet ? { host: photoSet.source, url: photoSet.sourceUrl } : null}
            viewer={{ model: product.model, colors: product.colors, modelUrl: product.modelUrl, features, label: `Mô hình 3D của ${product.name}` }}
            hint={`Kéo để xoay, giữ Ctrl và cuộn để phóng to.${
              features?.transform
                ? features.transform.kind === "combine"
                  ? " Bấm Hợp thể để xem các thành viên ghép lại."
                  : " Bấm nút đổi dạng để chuyển giữa dạng xe và dạng robot."
                : ""
            }`}
            credit={
              credit && (
                <p className="text-xs text-muted">
                  Mô hình 3D:{" "}
                  <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                    {credit.title}
                  </a>{" "}
                  của{" "}
                  <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                    {credit.author}
                  </a>
                  , giấy phép{" "}
                  <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                    {credit.license}
                  </a>
                  .
                </p>
              )
            }
          />
        </div>

        <aside aria-label="Mua hàng" className="space-y-5 rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24 lg:w-[26rem] lg:shrink-0 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            {category && <p className="pt-2 text-xs font-bold tracking-wider text-brand-strong uppercase">{category.name}</p>}
            {!preview && <WishlistButton productId={product.id} name={product.name} className="ml-auto shrink-0" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">{product.name}</h1>
            <p className="text-muted">{product.tagline}</p>
            {reviews && reviews.count > 0 && (
              <a href="#danh-gia" className="inline-block text-sm text-muted hover:text-fg">
                <span aria-hidden="true" className="text-warning">★</span> {reviews.average.toLocaleString("vi-VN")}/5 · {reviews.count} đánh giá
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-extrabold tabular-nums">{formatVnd(product.price)}</p>
            {product.compareAtPrice !== null && product.compareAtPrice > product.price && (
              <p className="text-muted line-through tabular-nums">{formatVnd(product.compareAtPrice)}</p>
            )}
            <p className={`text-sm font-semibold ${product.stock > 0 ? "text-success" : "text-danger"}`}>{status}</p>
          </div>
          {preview ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">Bản xem trước: nút mua hàng không hoạt động.</p>
          ) : (
            <PurchasePanel name={product.name} variants={activeVariants} />
          )}

          {features?.members && linked.length > 0 && (
            <div className="space-y-2.5 border-t border-line pt-4">
              <p className="text-sm font-bold">Hoặc mua lẻ từng thành viên</p>
              <ul className="space-y-1.5">
                {linked.map((item) => (
                  <li key={item.id}>
                    <Link href={`/san-pham/${item.slug}`} className="flex items-center gap-3 rounded-xl p-1 text-sm hover:bg-raised">
                      <ProductImage src={item.image} alt="" className="product-stage size-9 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-semibold tabular-nums">{formatVnd(item.price)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center text-xs text-muted">
            <li>Miễn phí ship từ {formatVnd(site.shipping.freeFrom)}</li>
            <li>Đổi trả {site.policy.returnDays} ngày</li>
            <li>Bảo hành {site.policy.warrantyMonths} tháng</li>
          </ul>
        </aside>
      </div>

      <section aria-label="Mô tả, thông số và đánh giá" className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <ProductTabs tabs={tabs} id="danh-gia" />
      </section>

      {related.length > 0 && (
        <section aria-labelledby="lien-quan">
          <h2 id="lien-quan" className="mb-5 text-2xl font-bold tracking-tight">
            Sản phẩm liên quan
          </h2>
          <ProductGrid products={related} />
        </section>
      )}

      {!preview && defaultVariant && (
        <MobileBuyBar productId={product.id} variantId={defaultVariant.id} name={product.name} price={defaultVariant.price} stock={defaultVariant.stock} />
      )}
    </div>
  );
}
