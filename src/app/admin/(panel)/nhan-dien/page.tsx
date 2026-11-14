import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, TABLE, TABLE_WRAP, chip, first } from "@/components/admin/parts";
import { ModelButtons, ModelImportForm, RobotProducts, RobotsImportForm, SuggestionsButton } from "@/components/admin/RecognitionForms";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listModels, listProductChoices, listRobots, recognitionStats } from "@/server/repo/recognition";

// Nhận dạng robot (docs/nhan-dang-robot/00-ke-hoach.md, B10–B11): mô hình, danh sách robot, ghép sản phẩm, thống kê 30 ngày.
// `?loai=<franchise>` lọc bảng robot, `?chua-ghep=1` chỉ hiện robot chưa có sản phẩm.
export default function RecognitionAdminPage(props: PageProps<"/admin/nhan-dien">) {
  return (
    <AdminSuspense>
      <RecognitionAdminContent {...props} />
    </AdminSuspense>
  );
}

const pct = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? `${(100 * value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "—");
const LEVELS = [
  ["class", "Đúng robot"],
  ["character", "Cấp nhân vật"],
  ["franchise", "Cấp franchise"],
  ["none", "Không nhận ra"],
] as const;

async function RecognitionAdminContent({ searchParams }: PageProps<"/admin/nhan-dien">) {
  const user = await requireStaff("catalog.view", "/admin/nhan-dien");
  const editable = can(user.role, "catalog.edit");
  const [models, robots, choices, stats, params] = await Promise.all([listModels(), listRobots(), listProductChoices(), recognitionStats(30), searchParams]);
  const franchise = first(params.loai);
  const onlyUnlinked = first(params["chua-ghep"]) === "1";
  const franchises = [...new Map(robots.map((r) => [r.franchise, r.franchiseLabel])).entries()];
  const shown = robots.filter((r) => (!franchise || r.franchise === franchise) && (!onlyUnlinked || r.productIds.length === 0));
  const productName = new Map(choices.map((c) => [c.id, c.name]));
  const linkedProducts = new Set(robots.flatMap((r) => r.productIds));
  const href = (next: { loai?: string; chuaGhep?: boolean }) => {
    const query = new URLSearchParams();
    if (next.loai) query.set("loai", next.loai);
    if (next.chuaGhep) query.set("chua-ghep", "1");
    return `/admin/nhan-dien${query.size ? `?${query}` : ""}`;
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Nhận dạng robot (AI)</h1>
      <p className="max-w-3xl text-sm text-muted">
        Mô hình phân loại ảnh chạy trong trình duyệt của khách; máy chủ chỉ nhận xác suất, không nhận ảnh. Dữ liệu nhập từ các bước học máy: danh sách robot (B1)
        và mô hình đã xuất (B9). Mỗi lúc chỉ một mô hình được bật.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Mô hình</h2>
        {models.length === 0 ? (
          <p className="text-sm text-muted">Chưa có mô hình nào. Nhập danh sách robot trước, rồi nhập model card của bước B9.</p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Mô hình</th>
                  <th scope="col">Lớp</th>
                  <th scope="col">Dung lượng</th>
                  <th scope="col">Top-1 (test)</th>
                  <th scope="col">Nhập lúc</th>
                  <th scope="col">Trạng thái</th>
                  {editable && <th scope="col">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium">{m.label}</div>
                      <div className="font-mono text-xs text-muted">{m.id}</div>
                    </td>
                    <td className="tabular-nums">{m.classes}</td>
                    <td className="tabular-nums">{m.mb.toLocaleString("vi-VN")} MB {m.variant && <span className="text-muted">({m.variant})</span>}</td>
                    <td className="tabular-nums">{pct(m.metrics.top1)}</td>
                    <td className="text-sm text-muted">{formatDateTime(m.createdAt)}</td>
                    <td>
                      <span className={BADGE}>{m.isActive ? "Đang bật" : "Tắt"}</span>
                      {m.isSmoke && <span className={`${BADGE} ml-1 text-warning`}>Chạy thử</span>}
                    </td>
                    {editable && (
                      <td>
                        <ModelButtons id={m.id} active={m.isActive} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(() => {
        const shownModel = models.find((m) => m.isActive) ?? models[0];
        return shownModel ? <StepMetrics label={shownModel.label} metrics={shownModel.metrics} /> : null;
      })()}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Lượt nhận dạng 30 ngày qua</h2>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">Tổng</dt>
            <dd className="text-2xl font-semibold tabular-nums">{stats.total.toLocaleString("vi-VN")}</dd>
          </div>
          {LEVELS.map(([key, label]) => (
            <div key={key} className="rounded-xl border border-line bg-surface p-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{stats.byLevel[key].toLocaleString("vi-VN")}</dd>
            </div>
          ))}
          <div className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">Thời gian ở trình duyệt (trung vị)</dt>
            <dd className="text-2xl font-semibold tabular-nums">{stats.medianClientMs === null ? "—" : `${Math.round(stats.medianClientMs)} ms`}</dd>
          </div>
        </dl>
      </section>

      {editable && (
        <section className="grid gap-4 lg:grid-cols-2">
          <RobotsImportForm />
          <ModelImportForm />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Robot và sản phẩm</h2>
            <p className="text-sm text-muted">
              {robots.length} robot; {robots.filter((r) => r.productIds.length > 0).length} robot đã ghép sản phẩm; {linkedProducts.size}/{choices.length} sản phẩm đã gắn với robot.
            </p>
          </div>
          {editable && robots.length > 0 && <SuggestionsButton />}
        </div>
        {robots.length > 0 && (
          <nav aria-label="Lọc robot" className="flex flex-wrap gap-2">
            <Link href={href({ chuaGhep: onlyUnlinked })} className={chip(!franchise)}>Tất cả</Link>
            {franchises.map(([key, label]) => (
              <Link key={key} href={href({ loai: key, chuaGhep: onlyUnlinked })} className={chip(franchise === key)}>{label}</Link>
            ))}
            <Link href={href({ loai: franchise, chuaGhep: !onlyUnlinked })} className={chip(onlyUnlinked)}>Chưa ghép sản phẩm</Link>
          </nav>
        )}
        {shown.length > 0 && (
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Robot</th>
                  <th scope="col">Nhân vật · dòng · phe</th>
                  <th scope="col">Gợi ý của B1</th>
                  <th scope="col">Sản phẩm đã ghép</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-xs text-muted">{r.slug}</div>
                    </td>
                    <td className="text-sm">
                      {r.character}
                      <div className="text-xs text-muted">{[r.series, r.faction].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="font-mono text-xs text-muted">{r.storeProducts.join(", ") || "—"}</td>
                    <td className="min-w-64">
                      {editable ? (
                        <RobotProducts robotId={r.id} linked={r.productIds.map((id) => ({ id, name: productName.get(id) ?? id }))} choices={choices} />
                      ) : (
                        <span className="text-sm">{r.productIds.map((id) => productName.get(id) ?? id).join(", ") || "—"}</span>
                      )}
                    </td>
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

type Digest = {
  data?: { classes_collected: number; images_raw: number; images_clean: number; classes_known: number; classes_unknown: number; sizes: Record<string, number> };
  b06?: { choice: string; by_arch: Record<string, { runs: number; top1: number; top1_std: number; macro_f1: number }> };
  b08?: {
    top1: number;
    top5: number;
    macro_f1: number;
    character: number;
    franchise: number;
    temperature: number;
    ece_before: number;
    ece_after: number;
    auroc_unknown: number;
    auroc_negative: number;
    rule_test: Record<string, number>;
  };
};

const num = (value: unknown) => (typeof value === "number" ? value.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : "—");

// Số liệu các bước học máy gói trong model card (ml/scripts/b09_xuat_onnx.py, step_digest): dữ liệu B2–B4, so sánh kiến trúc B6,
// đánh giá trên test B8, bản xuất B9. Báo cáo đầy đủ ở docs/nhan-dang-robot/bao-cao/.
function StepMetrics({ label, metrics }: { label: string; metrics: Record<string, unknown> }) {
  const steps = (metrics.steps ?? {}) as Digest;
  const groups: { title: string; rows: [string, string][] }[] = [];
  if (steps.data) {
    const { sizes } = steps.data;
    groups.push({
      title: "Dữ liệu (B2–B4)",
      rows: [
        ["Ảnh thu thập / sau làm sạch", `${num(steps.data.images_raw)} / ${num(steps.data.images_clean)}`],
        ["Robot đã biết / robot lạ (để thử từ chối)", `${steps.data.classes_known} / ${steps.data.classes_unknown}`],
        ["Ảnh train / val / test", `${num(sizes.train)} / ${num(sizes.val)} / ${num(sizes.test)}`],
      ],
    });
  }
  if (steps.b06) {
    groups.push({
      title: "So sánh kiến trúc trên val (B6)",
      rows: Object.entries(steps.b06.by_arch).map(([arch, v]) => [
        `${arch}${arch === steps.b06!.choice ? " (được chọn)" : ""}`,
        `top-1 ${pct(v.top1)} ± ${pct(v.top1_std)}, macro-F1 ${pct(v.macro_f1)} (${v.runs} lần chạy)`,
      ]),
    });
  }
  if (steps.b08) {
    const b = steps.b08;
    const r = b.rule_test ?? {};
    groups.push({
      title: "Đánh giá trên tập test (B8)",
      rows: [
        ["Top-1 / top-5 / macro-F1", `${pct(b.top1)} / ${pct(b.top5)} / ${pct(b.macro_f1)}`],
        ["Đúng ở cấp nhân vật / franchise", `${pct(b.character)} / ${pct(b.franchise)}`],
        ["Nhiệt độ T, ECE trước → sau hiệu chỉnh", `${num(b.temperature)}, ${num(b.ece_before)} → ${num(b.ece_after)}`],
        ["AUROC robot lạ / ảnh không phải robot", `${num(b.auroc_unknown)} / ${num(b.auroc_negative)}`],
        ["Luật theo cấp: trả lời đúng lớp / đúng ở một cấp / sai / từ chối oan", `${pct(r.known_correct_class)} / ${pct(r.known_correct_any)} / ${pct(r.known_wrong)} / ${pct(r.known_reject)}`],
        ["Nhận nhầm robot lạ / ảnh không phải robot", `${pct(r.unknown_false_accept)} / ${pct(r.negative_false_accept)}`],
      ],
    });
  }
  groups.push({
    title: "Bản xuất cho trình duyệt (B9)",
    rows: [
      ["Top-1 / macro-F1 trên test", `${pct(metrics.top1)} / ${pct(metrics.macro_f1)}`],
      ["ECE, top-1 trùng với PyTorch", `${num(metrics.ece)}, ${pct(metrics.agree)}`],
    ],
  });
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Số liệu từng bước: {label}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-2 font-semibold">{group.title}</h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
              {group.rows.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{key}</dt>
                  <dd className="text-right tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
