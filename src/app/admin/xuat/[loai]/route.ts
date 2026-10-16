import { can } from "@/lib/permissions";
import { authorize } from "@/server/auth/session";
import { STOCK_FILTERS, listStock, stockCard, toCsv, type StockFilter } from "@/server/repo/stock-reports";

const isId = (value: string | null) => typeof value === "string" && /^[a-f0-9]{20}$/.test(value);
const MAX_ROWS = 20_000;

// Xuất CSV (YC-KHO-19, YC-BC-03): kiểm tra quyền như trang tương ứng; cột giá vốn chỉ có với cost.view (SEC-03).
export async function GET(request: Request, ctx: RouteContext<"/admin/xuat/[loai]">) {
  const { loai } = await ctx.params;
  const user = await authorize("inventory.view");
  if (!user) return new Response("Không có quyền.", { status: 403 });
  const params = new URL(request.url).searchParams;
  let csv: string;

  if (loai === "ton-kho") {
    const withCost = can(user.role, "cost.view");
    const filter = params.get("loc") as StockFilter | null;
    const header = ["SKU", "Mã vạch", "Sản phẩm", "Thực có", "Đang giữ", "Khả dụng", "Cách ly", "Ngưỡng sắp hết", "Số ngày từ lần nhập"];
    if (withCost) header.push("Giá vốn", "Giá trị tồn");
    const rows: (string | number | null)[][] = [];
    for (let page = 1; rows.length < MAX_ROWS; page++) {
      const { items, total } = await listStock({
        q: params.get("q")?.slice(0, 60) ?? "",
        filter: filter && filter in STOCK_FILTERS ? filter : undefined,
        locationId: isId(params.get("vi-tri")) ? params.get("vi-tri")! : undefined,
        page,
        pageSize: 200,
        withCost,
      });
      for (const item of items) {
        const row: (string | number | null)[] = [item.sku, item.barcode, item.name, item.onHand, item.reserved, item.available, item.quarantined, item.threshold, item.ageDays];
        if (withCost) row.push(item.avgCost ?? 0, item.value ?? 0);
        rows.push(row);
      }
      if (page * 200 >= total) break;
    }
    csv = toCsv(header, rows);
  } else if (loai === "the-kho") {
    const variantId = params.get("bien-the");
    if (!isId(variantId)) return new Response("Thiếu biến thể.", { status: 400 });
    const card = await stockCard(variantId!, MAX_ROWS);
    csv = toCsv(
      ["Thời điểm (UTC)", "Loại", "Vị trí", "Thay đổi tồn", "Thay đổi đang giữ", "Tồn sau", "Người làm", "Phiếu", "Đơn", "Lý do"],
      card.map((row) => [
        new Date(row.createdAt).toISOString(),
        row.type,
        row.locationCode,
        row.qtyDelta,
        row.reservedDelta,
        row.balance,
        row.actorName,
        row.documentCode,
        row.orderCode,
        row.reason,
      ]),
    );
  } else {
    return new Response("Không có báo cáo này.", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${loai}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
