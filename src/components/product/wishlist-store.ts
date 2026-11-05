import { useSyncExternalStore } from "react";

// Danh sách yêu thích tải một lần cho cả trang; nút trái tim trên thẻ và số đếm ở đầu trang dùng chung.
// null: chưa tải xong hoặc chưa đăng nhập.
let ids: ReadonlySet<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  loading ??= fetch("/api/wishlist", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ ids: string[] | null }>)
    .then((body) => {
      ids = body.ids ? new Set(body.ids) : null;
      // Chưa đăng nhập: lần gắn nút sau (ví dụ sau khi đăng nhập) tải lại.
      if (!body.ids) loading = null;
      emit();
    })
    .catch(() => {
      loading = null;
    });
  return () => {
    listeners.delete(listener);
  };
}

export function useWishlistIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(
    subscribe,
    () => ids,
    () => null,
  );
}

export function getWishlistIds(): ReadonlySet<string> | null {
  return ids;
}

export function setWishlistIds(next: ReadonlySet<string>) {
  ids = next;
  emit();
}
