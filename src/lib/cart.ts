"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { site } from "@/config/site";
import { flashLimit } from "./flash-sale";
import { applyBundles, type BundleDeal } from "./bundles";
import { canPreorder, lineDeposit, orderableQty } from "./preorder";
import { orderTotals } from "./pricing";
import type { CartProduct, ProductSummary } from "./types";
import { parseConfig, type ParsedConfig } from "./workshop";

// Giỏ hàng lưu trong localStorage của trình duyệt: chỉ gồm mã biến thể và số lượng. Giá và tồn kho
// luôn lấy mới từ máy chủ (/api/cart) và được kiểm tra lại lần nữa khi đặt hàng.
// `cfg`: cấu hình Xưởng (src/lib/workshop.ts); không có là nguyên hộp. Cùng biến thể khác cấu hình là hai dòng.
export type CartLine = { id: string; qty: number; cfg?: string };

// Khoá của một dòng: mã biến thể, kèm cấu hình Xưởng nếu có.
export const lineKey = (line: Pick<CartLine, "id" | "cfg">) => (line.cfg ? `${line.id}~${line.cfg}` : line.id);

// v2: mỗi dòng là một biến thể (v1 lưu mã sản phẩm cũ, không còn dùng được).
const STORAGE_KEY = "robostore:cart:v2";
const MAX_LINES = 50;
const EMPTY: readonly CartLine[] = Object.freeze([]);

let snapshot: readonly CartLine[] | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): readonly CartLine[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    const lines: CartLine[] = [];
    for (const item of data as { id?: unknown; qty?: unknown; cfg?: unknown }[]) {
      if (
        typeof item?.id === "string" &&
        /^[a-z0-9]{1,40}$/i.test(item.id) &&
        typeof item.qty === "number" &&
        Number.isInteger(item.qty) &&
        item.qty > 0 &&
        (item.cfg === undefined || (typeof item.cfg === "string" && item.cfg.length <= 200))
      ) {
        lines.push({ id: item.id, qty: Math.min(item.qty, site.maxQtyPerItem), ...(item.cfg ? { cfg: item.cfg as string } : {}) });
      }
    }
    return lines.length > 0 ? lines.slice(0, MAX_LINES) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(): readonly CartLine[] {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // localStorage bị chặn (chế độ riêng tư nghiêm ngặt): giỏ hàng chỉ tồn tại trong phiên hiện tại.
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function write(next: readonly CartLine[]) {
  snapshot = next.length > 0 ? next : EMPTY;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Bỏ qua: xem ghi chú ở hàm read().
  }
  emit();
}

// Đồng bộ khi giỏ hàng thay đổi ở một thẻ trình duyệt khác.
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  snapshot = read();
  emit();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => (snapshot ??= read());
const getServerSnapshot = () => EMPTY;

export const cart = {
  // Thêm vào giỏ, không vượt quá `max` (tồn kho hoặc giới hạn mỗi đơn). Trả về số lượng thực sự được thêm.
  // `cfg`: cấu hình Xưởng. Giới hạn tồn kho tính chung mọi dòng cùng biến thể.
  add(id: string, qty: number, max: number = site.maxQtyPerItem, cfg = ""): number {
    const lines = getSnapshot();
    const key = lineKey({ id, cfg });
    const existing = lines.find((line) => lineKey(line) === key);
    const others = lines.filter((line) => line.id === id && lineKey(line) !== key).reduce((sum, line) => sum + line.qty, 0);
    const limit = Math.min(max, site.maxQtyPerItem) - others;
    const current = existing?.qty ?? 0;
    const target = Math.min(current + qty, limit);
    if (target <= current) return 0;
    if (existing) write(lines.map((line) => (lineKey(line) === key ? { ...line, qty: target } : line)));
    else if (lines.length < MAX_LINES) write([...lines, { id, qty: target, ...(cfg ? { cfg } : {}) }]);
    else return 0;
    return target - current;
  },
  // `key`: khoá dòng (lineKey).
  setQuantity(key: string, qty: number) {
    const lines = getSnapshot();
    if (qty <= 0) write(lines.filter((line) => lineKey(line) !== key));
    else write(lines.map((line) => (lineKey(line) === key ? { ...line, qty: Math.min(qty, site.maxQtyPerItem) } : line)));
  },
  remove(key: string) {
    write(getSnapshot().filter((line) => lineKey(line) !== key));
  },
  clear() {
    write(EMPTY);
  },
};

export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCartCount(): number {
  return useCartLines().reduce((total, line) => total + line.qty, 0);
}

const noopSubscribe = () => () => {};

// false khi dựng ở máy chủ và trong lượt hydrate đầu tiên, true sau đó. Dùng để chưa vội hiện
// "giỏ hàng trống" khi dữ liệu trong localStorage chưa được đọc.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export type CartRow = {
  // Khoá dòng (lineKey): dùng cho cart.setQuantity, cart.remove.
  key: string;
  id: string;
  qty: number;
  cfg: string;
  // Tuỳ biến Xưởng đã tính giá (null nếu cấu hình không còn hợp lệ).
  config: ParsedConfig | null;
  // Giá biến thể + giá tuỳ chọn Xưởng.
  unitPrice: number;
  product: CartProduct | null;
  // Số lượng tối đa có thể đặt lúc này.
  maxQty: number;
  lineTotal: number;
  // preorder_closed: đợt đặt trước ngừng nhận hoặc hết suất.
  issue: "unavailable" | "out_of_stock" | "over_stock" | "preorder_closed" | null;
};

type Known = ReadonlyMap<string, CartProduct | null>;

// Ghép giỏ hàng với dữ liệu sản phẩm mới nhất từ máy chủ.
export function useCart() {
  const lines = useCartLines();
  const hydrated = useHydrated();
  const [known, setKnown] = useState<Known>(new Map());
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [comboDeals, setComboDeals] = useState<{ key: string; deals: (BundleDeal & { members: ProductSummary[] })[] }>({ key: "", deals: [] });

  const missing = useMemo(
    () =>
      lines
        .map((line) => line.id)
        .filter((id) => !known.has(id))
        .sort()
        .join(","),
    [lines, known],
  );

  useEffect(() => {
    if (!missing) return;
    const controller = new AbortController();
    const ids = missing.split(",");
    fetch(`/api/cart?ids=${missing}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { products: CartProduct[] }) => {
        const found = new Map(data.products.map((product) => [product.id, product]));
        setFailed(false);
        setKnown((previous) => {
          const next = new Map(previous);
          for (const id of ids) next.set(id, found.get(id) ?? null);
          return next;
        });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [missing, reloadToken]);

  // Tồn kho theo biến thể: các dòng cùng biến thể (khác cấu hình Xưởng) dùng chung.
  const perVariant = new Map<string, number>();
  for (const line of lines) perVariant.set(line.id, (perVariant.get(line.id) ?? 0) + line.qty);
  const rows: CartRow[] = lines.map((line) => {
    const product = known.get(line.id) ?? null;
    const cfg = line.cfg ?? "";
    const config = product ? parseConfig(cfg, product.category) : null;
    const others = (perVariant.get(line.id) ?? 0) - line.qty;
    // Hàng đặt trước giới hạn theo suất còn lại của đợt, hàng thường theo tồn kho.
    // Giá flash sale đang chạy chỉ cho số suất còn lại và số tối đa mỗi đơn.
    const base = product ? orderableQty(product.stock, product.preorder, site.maxQtyPerItem) : 0;
    const limit = product?.flash ? Math.min(base, flashLimit(product.flash)) : base;
    const maxQty = product?.available ? Math.max(limit - others, 0) : 0;
    let issue: CartRow["issue"] = null;
    if (!product || !product.available || !config) issue = "unavailable";
    else if (product.preorder && !canPreorder(product.preorder)) issue = "preorder_closed";
    else if (!product.preorder && product.stock <= 0) issue = "out_of_stock";
    else if (line.qty > maxQty) issue = "over_stock";
    const unitPrice = (product?.price ?? 0) + (config?.price ?? 0);
    return { key: lineKey(line), id: line.id, qty: line.qty, cfg, config, unitPrice, product, maxQty, lineTotal: unitPrice * line.qty, issue };
  });

  // Combo của các sản phẩm đang có trong giỏ: tải lại khi tập sản phẩm đổi.
  const productKey = [...new Set(rows.flatMap((row) => (row.product ? [row.product.productId] : [])))].sort().join(",");
  useEffect(() => {
    if (!productKey) return;
    const controller = new AbortController();
    fetch(`/api/combo?products=${productKey}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { deals: (BundleDeal & { members: ProductSummary[] })[] } | null) => {
        if (data) setComboDeals({ key: productKey, deals: data.deals });
      })
      .catch(() => {
        // Không tải được combo: giỏ vẫn dùng được, máy chủ vẫn tính giảm khi đặt hàng.
      });
    return () => controller.abort();
  }, [productKey]);
  const deals = productKey && comboDeals.key === productKey ? comboDeals.deals : [];
  const dealMembers = new Map(deals.flatMap((deal) => deal.members.map((member) => [member.id, member] as const)));

  const loading = !hydrated || (missing !== "" && !failed);
  // Tổng tiền cọc của các dòng đặt trước (máy chủ tính lại khi đặt hàng).
  const deposit = rows.reduce(
    (sum, row) => sum + (row.product?.preorder && !row.issue ? lineDeposit(row.unitPrice, row.qty, row.product.preorder.depositPercent) : 0),
    0,
  );
  // Combo (src/lib/bundles.ts): giảm khi đủ bộ, gợi ý món còn thiếu; máy chủ tính lại khi đặt hàng.
  const valid = rows.filter((row) => row.product && !row.issue);
  const bundle = applyBundles(
    valid.map((row) => ({ productId: row.product!.productId, unitPrice: row.product!.price, quantity: row.qty })),
    deals,
  );
  const subtotal = valid.reduce((sum, row) => sum + row.unitPrice * row.qty, 0);
  const totals = orderTotals(
    valid.map((row) => ({ price: row.unitPrice, quantity: row.qty })),
    Math.min(bundle.discount, subtotal),
  );

  return {
    rows,
    loading,
    failed,
    totals,
    deposit,
    hasPreorder: rows.some((row) => row.product?.preorder),
    // Combo đã áp (`applied`), combo còn thiếu món (`missing`) và thẻ của thành viên các combo (`members`) để gợi ý.
    bundle: { applied: bundle.applied, missing: bundle.missing, members: dealMembers },
    count: lines.reduce((total, line) => total + line.qty, 0),
    canCheckout: !loading && !failed && rows.length > 0 && rows.every((row) => row.issue === null),
    // Bỏ dữ liệu đã nhớ để tải lại giá và tồn kho từ máy chủ.
    reload() {
      setKnown(new Map());
      setFailed(false);
      setReloadToken((value) => value + 1);
    },
  };
}
