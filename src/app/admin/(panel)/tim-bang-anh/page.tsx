import type { Metadata } from "next";
import Link from "next/link";
import { ImageSearchWorkbench } from "@/components/admin/ImageSearchWorkbench";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { Notice } from "@/components/ui/Notice";
import { site } from "@/config/site";
import { formatDateTime, formatNumber } from "@/lib/format";
import { IMAGE_SEARCH_MODEL, type DecisionReason } from "@/lib/image-search";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { getImageSearchSettings, imageSearchStats, listIndexStatus } from "@/server/repo/image-search";
import { AdminSuspense } from "@/components/admin/AdminSuspense";

export const metadata: Metadata = { title: "Tìm kiếm bằng ảnh" };

const REASON_LABELS: Record<DecisionReason, string> = {
  match: "Trả kết quả",
  "low-score": "Từ chối: chưa đủ giống",
  ambiguous: "Từ chối: lưỡng lự",
  empty: "Chưa có chỉ mục",
};

const decimal = (value: number, digits = 3) => value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Card({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
    </div>
  );
}

// YC-AI-05..08 (docs/chuan/08-tich-hop-ai.md): lập chỉ mục, hiệu chỉnh ngưỡng, theo dõi lượt tìm bằng ảnh.
export default function ImageSearchAdminPage() {
  return (
    <AdminSuspense>
      <ImageSearchAdminPageContent />
    </AdminSuspense>
  );
}

async function ImageSearchAdminPageContent() {
  const user = await requireStaff("catalog.view", "/admin/tim-bang-anh");
  const canEdit = can(user.role, "catalog.edit");
  const model = IMAGE_SEARCH_MODEL.id;
  const [{ products, otherModels }, settings, stats] = await Promise.all([listIndexStatus(model), getImageSearchSettings(model), imageSearchStats(30, 20)]);

  const withModel = products.filter((row) => row.modelUrl);
  const indexed = products.filter((row) => row.forms.length > 0);
  const searchable = indexed.filter((row) => row.status === "published").length;
  const stale = indexed.filter((row) => row.forms.some((form) => form.sourceUrl !== (row.modelUrl ?? ""))).length;
  const oldRows = otherModels.reduce((sum, item) => sum + item.rows, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Tìm kiếm bằng ảnh</h1>
          <p className="max-w-3xl text-sm text-muted">
            Khách gửi ảnh một robot, trình duyệt của khách trích đặc trưng bằng {IMAGE_SEARCH_MODEL.label}, máy chủ so với vector dựng từ mô hình 3D của từng
            sản phẩm (12 góc nhìn) rồi trả mẫu giống nhất, hoặc từ chối khi không đủ giống.
          </p>
        </div>
        {/* Cửa hàng ở tên miền khác (src/proxy.ts) nên dùng thẻ a thường. */}
        <a href={`${site.url}/tim-bang-anh`} className="text-sm font-medium text-brand-strong hover:underline" target="_blank" rel="noopener">
          Mở trang tìm bằng ảnh của khách
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Mô hình trích đặc trưng" value={<span className="text-base">{IMAGE_SEARCH_MODEL.label}</span>} note={`${IMAGE_SEARCH_MODEL.dim} chiều · ${IMAGE_SEARCH_MODEL.megabytes} MB · mã ${model}`} />
        <Card
          label="Khách tìm được"
          value={`${formatNumber(searchable)} sản phẩm`}
          note={`${formatNumber(indexed.length)}/${formatNumber(withModel.length)} sản phẩm có mô hình 3D đã lập chỉ mục${stale ? `, ${stale} cần lập lại` : ""}`}
        />
        <Card
          label="Ngưỡng từ chối"
          value={`τ ${decimal(settings.tau)} · δ ${decimal(settings.delta, 4)}`}
          note={settings.source === "calibrated" ? "Từ hiệu chỉnh" : settings.source === "manual" ? "Tự nhập" : "Mặc định, chưa hiệu chỉnh"}
        />
        <Card
          label="30 ngày qua"
          value={`${formatNumber(stats.total)} lượt tìm`}
          note={
            stats.total > 0
              ? `${Math.round((stats.accepted / stats.total) * 100)}% có kết quả${stats.medianClientMs !== null ? ` · trích đặc trưng ~${formatNumber(stats.medianClientMs)} ms` : ""}`
              : "Chưa có lượt tìm"
          }
        />
      </div>

      {indexed.length === 0 && withModel.length > 0 && (
        <Notice tone="info">Chưa lập chỉ mục sản phẩm nào nên khách chưa thấy tính năng tìm bằng ảnh. Bấm “Lập … sản phẩm chưa có” ở mục 1.</Notice>
      )}
      {indexed.length > 0 && settings.source === "default" && (
        <Notice tone="info">Đang dùng ngưỡng mặc định. Hãy chạy hiệu chỉnh ở mục 2 để chọn τ, δ theo đúng dữ liệu của cửa hàng.</Notice>
      )}
      {oldRows > 0 && (
        <Notice tone="info">
          Còn {formatNumber(oldRows)} dòng chỉ mục của mô hình cũ ({otherModels.map((item) => item.model).join(", ")}). Chúng không được dùng; vector của hai mô hình
          khác nhau không so sánh được với nhau.
        </Notice>
      )}

      <ImageSearchWorkbench rows={products} settings={settings} canEdit={canEdit} />

      <section className="space-y-4" aria-labelledby="logs-heading">
        <div className="space-y-1">
          <h2 id="logs-heading" className="text-xl font-bold">
            3. Lượt tìm gần đây
          </h2>
          <p className="text-sm text-muted">Chỉ ghi điểm và quyết định, không lưu ảnh của khách.</p>
        </div>
        {stats.total > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(REASON_LABELS) as DecisionReason[])
              .filter((reason) => stats.byReason[reason] > 0)
              .map((reason) => (
                <span key={reason} className={BADGE}>
                  {REASON_LABELS[reason]}: {formatNumber(stats.byReason[reason])}
                </span>
              ))}
          </div>
        )}
        {stats.recent.length === 0 ? (
          <Empty>Chưa có lượt tìm nào.</Empty>
        ) : (
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Lúc</th>
                  <th scope="col">Hạng 1</th>
                  <th scope="col">s₁</th>
                  <th scope="col">s₁ − s₂</th>
                  <th scope="col">Quyết định</th>
                  <th scope="col">Trích đặc trưng</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</td>
                    <td>
                      {row.productId ? (
                        <Link href={`/admin/san-pham/${row.productId}`} className="hover:underline">
                          {row.productName ?? row.productId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tabular-nums">{decimal(row.s1)}</td>
                    <td className="tabular-nums">{decimal(row.s1 - row.s2)}</td>
                    <td>
                      <span className={BADGE}>{REASON_LABELS[row.reason]}</span>
                    </td>
                    <td className="text-muted tabular-nums">{row.clientMs === null ? "—" : `${formatNumber(row.clientMs)} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
