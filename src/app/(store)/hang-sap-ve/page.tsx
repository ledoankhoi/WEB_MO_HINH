import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/product/ProductCard";
import { BOX, PageHero, SectionHeading } from "@/components/store/StoreKit";
import { getComingProducts } from "@/server/catalog";
import type { ComingProduct } from "@/server/repo/preorders";

export const metadata: Metadata = {
  title: "Hàng sắp về",
  description: "Mô hình robot sắp về hàng tại ROBOTICA: xem ngày dự kiến về, đặt trước giữ suất bằng tiền cọc, hàng về là được giữ riêng cho bạn.",
  alternates: { canonical: "/hang-sap-ve" },
};

const VN_OFFSET_MS = 7 * 3600 * 1000;

// Nhóm theo tháng dự kiến về (giờ Việt Nam), tháng sớm trước; đợt ngừng nhận đặt xếp sau cùng trong tháng (đã sắp ở truy vấn).
function byMonth(items: ComingProduct[]): { key: string; label: string; items: ComingProduct[] }[] {
  const groups = new Map<string, { key: string; label: string; items: ComingProduct[] }>();
  for (const item of [...items].sort((a, b) => a.offer.expectedAt - b.offer.expectedAt)) {
    const date = new Date(item.offer.expectedAt + VN_OFFSET_MS);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const group = groups.get(key) ?? { key, label: `Tháng ${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const STEPS = [
  { title: "Chọn mẫu sắp về", text: "Mỗi mẫu ghi ngày dự kiến về, phần trăm cọc và số suất còn lại." },
  { title: "Đặt cọc giữ suất", text: "Chuyển khoản hoặc VNPay tiền cọc (có mẫu không cần cọc). Muốn trả đủ luôn cũng được." },
  { title: "Hàng về, giữ riêng", text: "Hàng về được chia theo thứ tự đặt. Bạn nhận email khi hàng về hoặc khi lịch về đổi." },
  { title: "Giao và trả nốt", text: "Phần còn lại trả khi nhận hàng, hoặc trả trước ở trang đơn." },
];

async function Coming() {
  const items = await getComingProducts();
  if (items.length === 0) {
    return (
      <div className={`${BOX} space-y-3 p-8 text-center`}>
        <p className="font-condensed text-2xl font-extrabold uppercase">Chưa có mẫu nào đang mở đặt trước</p>
        <p className="text-muted">
          Ghé lại sau, hoặc bấm “Báo khi có hàng” ở mẫu đang hết để được báo khi về.{" "}
          <Link href="/san-pham" className="font-semibold text-brand-strong underline">
            Xem hàng có sẵn
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-16">
      {byMonth(items).map((group, index) => (
        <section key={group.key} aria-labelledby={`thang-${group.key}`} className="space-y-8">
          <SectionHeading id={`thang-${group.key}`} bar={index % 2 === 0 ? "bg-cobalt" : "bg-brand"}>
            Về {group.label.toLowerCase()}
          </SectionHeading>
          <ProductGrid products={group.items.map((item) => item.product)} />
        </section>
      ))}
    </div>
  );
}

export default function ComingSoonPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        sticker="Hàng sắp về"
        title={
          <>
            Đặt trước
            <br />
            <span className="text-ink">giữ suất sớm</span>
          </>
        }
        intro="Những mẫu đang trên đường về kho ROBOTICA. Đặt cọc để giữ suất, không lo hết hàng ngay ngày mở bán; hàng về là được giữ riêng theo thứ tự đặt."
      />

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className={`${BOX} space-y-2 p-5`}>
            <p className="font-condensed text-4xl font-black text-cobalt italic">{String(index + 1).padStart(2, "0")}</p>
            <p className="font-condensed text-xl font-extrabold uppercase">{step.title}</p>
            <p className="text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>

      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải hàng sắp về...</p>}>
        <Coming />
      </Suspense>
    </div>
  );
}
