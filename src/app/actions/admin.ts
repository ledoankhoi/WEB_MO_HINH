"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  isCategorySlug,
  isPaymentStatus,
  isRobotModelKey,
  type OrderStatus,
  type PaymentStatus,
  type ProductSpec,
} from "@/lib/catalog";
import { slugify } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { isHexColor, parseMoney, readText } from "@/lib/validation";
import { requireAdmin } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { isConstraintError } from "@/server/db";
import { advanceOrder, cancelOrder, setPaymentStatus } from "@/server/repo/orders";
import {
  deleteProduct,
  insertProduct,
  saveProductImage,
  updateProduct,
  type ProductInput,
} from "@/server/repo/products";

const MAX_POSTER_BYTES = 800 * 1024;
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{20}$/.test(value);

// Mỗi dòng có dạng "Nhãn: giá trị".
function parseSpecs(raw: string): ProductSpec[] | null {
  const specs: ProductSpec[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!label || !value || label.length > 60 || value.length > 200) return null;
    specs.push({ label, value });
  }
  return specs.length <= 20 ? specs : null;
}

// Chỉ nhận ảnh WebP hoặc PNG do trang quản trị chụp từ mô hình 3D; kiểm tra chữ ký file thay vì tin
// kiểu MIME do trình duyệt khai báo.
async function readPoster(form: FormData): Promise<{ data: ArrayBuffer; contentType: string } | null | "invalid"> {
  const file = form.get("poster");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_POSTER_BYTES) return "invalid";

  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { data, contentType: "image/webp" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { data, contentType: "image/png" };
  return "invalid";
}

export async function saveProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();

  const id = readText(form, "id");
  const name = readText(form, "name");
  const slug = readText(form, "slug") || slugify(name);
  const tagline = readText(form, "tagline");
  const description = readText(form, "description").replace(/\r\n/g, "\n");
  const category = readText(form, "category");
  const priceInput = readText(form, "price");
  const compareInput = readText(form, "compareAtPrice");
  const stockInput = readText(form, "stock");
  const model = readText(form, "model");
  const modelUrl = readText(form, "modelUrl");
  const colors = {
    primary: readText(form, "colorPrimary"),
    secondary: readText(form, "colorSecondary"),
    accent: readText(form, "colorAccent"),
  };
  const specsInput = readText(form, "specs");
  const isFeatured = form.get("isFeatured") === "on";
  const isActive = form.get("isActive") === "on";

  const values = {
    name,
    slug,
    tagline,
    description,
    category,
    price: priceInput,
    compareAtPrice: compareInput,
    stock: stockInput,
    model,
    modelUrl,
    colorPrimary: colors.primary,
    colorSecondary: colors.secondary,
    colorAccent: colors.accent,
    specs: specsInput,
    isFeatured: isFeatured ? "on" : "",
    isActive: isActive ? "on" : "",
  };

  const errors: Record<string, string> = {};
  if (id && !isId(id)) return { message: "Sản phẩm không hợp lệ.", values };
  if (name.length < 2 || name.length > 120) errors.name = "Tên cần từ 2 đến 120 ký tự.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    errors.slug = "Đường dẫn chỉ gồm chữ thường không dấu, số và gạch nối (tối đa 80 ký tự).";
  }
  if (tagline.length > 160) errors.tagline = "Mô tả ngắn tối đa 160 ký tự.";
  if (description.length > 5000) errors.description = "Mô tả tối đa 5.000 ký tự.";
  if (!isCategorySlug(category)) errors.category = "Vui lòng chọn danh mục.";

  const price = parseMoney(priceInput);
  if (price === null) errors.price = "Giá bán phải là số nguyên không âm.";
  const compareAtPrice = compareInput ? parseMoney(compareInput) : null;
  if (compareInput && compareAtPrice === null) errors.compareAtPrice = "Giá gốc không hợp lệ.";
  else if (price !== null && compareAtPrice !== null && compareAtPrice <= price) {
    errors.compareAtPrice = "Giá gốc phải lớn hơn giá bán (để trống nếu không giảm giá).";
  }

  const stock = /^\d{1,6}$/.test(stockInput) ? Number(stockInput) : null;
  if (stock === null) errors.stock = "Tồn kho phải là số nguyên từ 0 đến 999.999.";
  if (!isRobotModelKey(model)) errors.model = "Vui lòng chọn kiểu dáng mô hình.";
  const mediaBase = process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const modelPath = mediaBase && modelUrl.startsWith(mediaBase) ? modelUrl.slice(mediaBase.length) : modelUrl;
  if (modelUrl && !/^\/models\/[A-Za-z0-9._-]{1,100}\.glb$/.test(modelPath)) {
    errors.modelUrl = "Đường dẫn phải có dạng /models/ten-file.glb, trong public/models hoặc trên kho media (MEDIA_BASE_URL).";
  }
  if (!isHexColor(colors.primary) || !isHexColor(colors.secondary) || !isHexColor(colors.accent)) {
    errors.colors = "Màu phải ở dạng #rrggbb.";
  }
  const specs = parseSpecs(specsInput);
  if (!specs) errors.specs = "Mỗi dòng thông số cần có dạng “Nhãn: giá trị” (tối đa 20 dòng).";

  const poster = await readPoster(form);
  if (poster === "invalid") errors.poster = "Ảnh đại diện không hợp lệ hoặc quá lớn.";

  if (
    Object.keys(errors).length > 0 ||
    price === null ||
    stock === null ||
    !specs ||
    poster === "invalid" ||
    !isRobotModelKey(model)
  ) {
    return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  }

  const input: ProductInput = {
    slug,
    name,
    tagline,
    description,
    category,
    price,
    compareAtPrice,
    stock,
    model,
    modelUrl: modelUrl || null,
    colors,
    specs,
    isFeatured,
    isActive,
  };

  let productId = id;
  try {
    if (id) {
      if (!(await updateProduct(id, input))) return { message: "Sản phẩm không còn tồn tại.", values };
    } else {
      productId = await insertProduct(input);
    }
  } catch (error) {
    if (isConstraintError(error)) {
      return { errors: { slug: "Đường dẫn này đã được dùng cho sản phẩm khác." }, values };
    }
    throw error;
  }

  if (poster) await saveProductImage(productId, poster.data, poster.contentType);
  updateTag(PRODUCTS_TAG);

  if (!id) redirect(`/admin/san-pham/${productId}?moi=1`);
  return { ok: true, message: "Đã lưu thay đổi.", values };
}

export async function deleteProductAction(id: string): Promise<FormState> {
  await requireAdmin();
  if (!isId(id)) return { message: "Sản phẩm không hợp lệ." };
  if (!(await deleteProduct(id))) {
    return { message: "Không xoá được vì sản phẩm đã có trong đơn hàng. Hãy bỏ chọn “Đang bán” để ẩn sản phẩm." };
  }
  updateTag(PRODUCTS_TAG);
  redirect("/admin/san-pham");
}

export async function advanceOrderAction(id: string, to: OrderStatus): Promise<FormState> {
  await requireAdmin();
  if (!isId(id) || (to !== "confirmed" && to !== "shipping" && to !== "completed")) {
    return { message: "Yêu cầu không hợp lệ." };
  }
  const changed = await advanceOrder(id, to);
  refresh();
  return changed
    ? { ok: true, message: "Đã cập nhật trạng thái đơn hàng." }
    : { message: "Đơn hàng đã thay đổi trạng thái trước đó. Trang vừa được tải lại." };
}

export async function cancelOrderAsAdminAction(id: string): Promise<FormState> {
  await requireAdmin();
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const cancelled = await cancelOrder(id, ["pending", "confirmed", "shipping"]);
  if (cancelled) updateTag(PRODUCTS_TAG);
  refresh();
  return cancelled
    ? { ok: true, message: "Đã huỷ đơn và hoàn hàng về kho." }
    : { message: "Không thể huỷ đơn ở trạng thái hiện tại." };
}

export async function setPaymentStatusAction(id: string, status: PaymentStatus): Promise<FormState> {
  await requireAdmin();
  if (!isId(id) || typeof status !== "string" || !isPaymentStatus(status)) {
    return { message: "Yêu cầu không hợp lệ." };
  }
  const changed = await setPaymentStatus(id, status);
  refresh();
  return changed ? { ok: true, message: "Đã cập nhật thanh toán." } : { message: "Không tìm thấy đơn hàng." };
}
