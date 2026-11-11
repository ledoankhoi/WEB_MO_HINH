"use client";

import { useSyncExternalStore } from "react";

// So sánh sản phẩm (docs/ke-hoach/nghiep-vu-ban-hang.md mục 19): tối đa COMPARE_MAX slug, lưu ở trình duyệt. Trang
// /so-sanh?sp=a,b,c đọc từ URL nên gửi đường dẫn cho người khác vẫn thấy đúng bảng.

const STORAGE_KEY = "robostore:compare:v1";
export const COMPARE_MAX = 4;
const EMPTY: readonly string[] = Object.freeze([]);

let snapshot: readonly string[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function read(): readonly string[] {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    const list = Array.isArray(data) ? data.filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9-]{1,120}$/.test(slug)).slice(0, COMPARE_MAX) : [];
    return list.length > 0 ? list : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(next: readonly string[]) {
  snapshot = next.length > 0 ? next : EMPTY;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage bị chặn: danh sách chỉ còn trong phiên.
  }
  emit();
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      snapshot = read();
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCompareList(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => (snapshot ??= read()),
    () => EMPTY,
  );
}

export const compare = {
  // Thêm hoặc bỏ; trả về "added", "removed" hoặc "full" (đã đủ COMPARE_MAX).
  toggle(slug: string): "added" | "removed" | "full" {
    const list = (snapshot ??= read());
    if (list.includes(slug)) {
      write(list.filter((item) => item !== slug));
      return "removed";
    }
    if (list.length >= COMPARE_MAX) return "full";
    write([...list, slug]);
    return "added";
  },
  clear() {
    write(EMPTY);
  },
};

export const compareHref = (slugs: readonly string[]) => `/so-sanh?sp=${slugs.join(",")}`;
