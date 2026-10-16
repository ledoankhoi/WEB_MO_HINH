"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { site } from "@/config/site";
import { orderTotals } from "./pricing";
import type { CartProduct } from "./types";

// Giỏ hàng lưu trong localStorage của trình duyệt: chỉ gồm mã biến thể và số lượng. Giá và tồn kho
// luôn lấy mới từ máy chủ (/api/cart) và được kiểm tra lại lần nữa khi đặt hàng.
export type CartLine = { id: string; qty: number };

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
    for (const item of data as { id?: unknown; qty?: unknown }[]) {
      if (
        typeof item?.id === "string" &&
        /^[a-z0-9]{1,40}$/i.test(item.id) &&
        typeof item.qty === "number" &&
        Number.isInteger(item.qty) &&
        item.qty > 0
      ) {
        lines.push({ id: item.id, qty: Math.min(item.qty, site.maxQtyPerItem) });
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
  add(id: string, qty: number, max: number = site.maxQtyPerItem): number {
    const lines = getSnapshot();
    const limit = Math.min(max, site.maxQtyPerItem);
    const existing = lines.find((line) => line.id === id);
    const current = existing?.qty ?? 0;
    const target = Math.min(current + qty, limit);
    if (target <= current) return 0;
    if (existing) write(lines.map((line) => (line.id === id ? { ...line, qty: target } : line)));
    else if (lines.length < MAX_LINES) write([...lines, { id, qty: target }]);
    else return 0;
    return target - current;
  },
  setQuantity(id: string, qty: number) {
    const lines = getSnapshot();
    if (qty <= 0) write(lines.filter((line) => line.id !== id));
    else write(lines.map((line) => (line.id === id ? { ...line, qty: Math.min(qty, site.maxQtyPerItem) } : line)));
  },
  remove(id: string) {
    write(getSnapshot().filter((line) => line.id !== id));
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
  id: string;
  qty: number;
  product: CartProduct | null;
  // Số lượng tối đa có thể đặt lúc này.
  maxQty: number;
  lineTotal: number;
  issue: "unavailable" | "out_of_stock" | "over_stock" | null;
};

type Known = ReadonlyMap<string, CartProduct | null>;

// Ghép giỏ hàng với dữ liệu sản phẩm mới nhất từ máy chủ.
export function useCart() {
  const lines = useCartLines();
  const hydrated = useHydrated();
  const [known, setKnown] = useState<Known>(new Map());
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

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

  const rows: CartRow[] = lines.map((line) => {
    const product = known.get(line.id) ?? null;
    const maxQty = product?.available ? Math.min(product.stock, site.maxQtyPerItem) : 0;
    let issue: CartRow["issue"] = null;
    if (!product || !product.available) issue = "unavailable";
    else if (product.stock <= 0) issue = "out_of_stock";
    else if (line.qty > maxQty) issue = "over_stock";
    return { id: line.id, qty: line.qty, product, maxQty, lineTotal: (product?.price ?? 0) * line.qty, issue };
  });

  const loading = !hydrated || (missing !== "" && !failed);
  const totals = orderTotals(
    rows.filter((row) => row.product && !row.issue).map((row) => ({ price: row.product!.price, quantity: row.qty })),
  );

  return {
    rows,
    loading,
    failed,
    totals,
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
