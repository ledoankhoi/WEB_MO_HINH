"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { PRODUCT_TYPES, isRobotModelKey, type ProductSpec } from "@/lib/catalog";
import { slugify } from "@/lib/format";
import { ORDER_ACTIONS, isOrderActionKey, type OrderActionKey } from "@/lib/order-flow";
import { ROLE_LABELS, isStaffRole } from "@/lib/permissions";
import type { FormState, ProductStatus } from "@/lib/types";
import { isEmail, isHexColor, parseMoney, readText } from "@/lib/validation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hashPassword, isValidPassword } from "@/server/auth/password";
import { PRODUCTS_TAG } from "@/server/catalog";
import { isConstraintError } from "@/server/db";
import { applyOrderAction, findOrderById } from "@/server/repo/orders";
import { authorize } from "@/server/auth/session";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";
import { writeAudit } from "@/server/repo/audit";
import { deleteObject } from "@/server/storage";
import { finishModelUpload, startModelUpload } from "@/server/media-upload";
import {
  canPublish,
  deleteProduct,
  findProductById,
  saveVariant,
  setDefaultVariant,
  setVariantActive,
  updateMedia,
  insertProduct,
  saveProductImage,
  updateProduct,
  type ProductInput,
} from "@/server/repo/products";
import { findStaffById, insertStaff, updateStaff } from "@/server/repo/staff";
import { setCustomerActive } from "@/server/repo/users";
import { deleteTaxonomy, isTaxonomyKind, listTaxonomy, saveTaxonomy, type TaxonomyKind } from "@/server/repo/taxonomy";

const MAX_POSTER_BYTES = 800 * 1024;

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
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;

  const id = readText(form, "id");
  const name = readText(form, "name");
  const slug = readText(form, "slug") || slugify(name);
  const tagline = readText(form, "tagline");
  const description = readText(form, "description").replace(/\r\n/g, "\n");
  const category = readText(form, "category");
  const priceInput = readText(form, "price");
  const compareInput = readText(form, "compareAtPrice");
  const skuInput = readText(form, "sku").toUpperCase();
  const model = readText(form, "model");
  const modelUrl = readText(form, "modelUrl");
  const colors = {
    primary: readText(form, "colorPrimary"),
    secondary: readText(form, "colorSecondary"),
    accent: readText(form, "colorAccent"),
  };
  const specsInput = readText(form, "specs");
  const isFeatured = form.get("isFeatured") === "on";
  const metaTitle = readText(form, "metaTitle");
  const metaDescription = readText(form, "metaDescription");
  const statusInput = readText(form, "status");
  const brandId = readText(form, "brandId");
  const seriesId = readText(form, "seriesId");
  const productType = readText(form, "productType");
  const scale = readText(form, "scale");
  const grade = readText(form, "grade");
  const boxContents = readText(form, "boxContents").replace(/\r\n/g, "\n");

  const values = {
    brandId,
    seriesId,
    productType,
    scale,
    grade,
    boxContents,
    name,
    slug,
    tagline,
    description,
    category,
    price: priceInput,
    compareAtPrice: compareInput,
    sku: skuInput,
    model,
    modelUrl,
    colorPrimary: colors.primary,
    colorSecondary: colors.secondary,
    colorAccent: colors.accent,
    specs: specsInput,
    isFeatured: isFeatured ? "on" : "",
    metaTitle,
    metaDescription,
    status: statusInput,
  };

  const errors: Record<string, string> = {};
  if (id && !isId(id)) return { message: "Sản phẩm không hợp lệ.", values };
  if (name.length < 2 || name.length > 120) errors.name = "Tên cần từ 2 đến 120 ký tự.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    errors.slug = "Đường dẫn chỉ gồm chữ thường không dấu, số và gạch nối (tối đa 80 ký tự).";
  }
  if (tagline.length > 160) errors.tagline = "Mô tả ngắn tối đa 160 ký tự.";
  if (description.length > 5000) errors.description = "Mô tả tối đa 5.000 ký tự.";
  const [categories, brands, series] = await Promise.all([listTaxonomy("categories"), listTaxonomy("brands"), listTaxonomy("series")]);
  if (!categories.some((item) => item.slug === category)) errors.category = "Vui lòng chọn danh mục.";
  if (brandId && !brands.some((item) => item.id === brandId)) errors.brandId = "Thương hiệu không hợp lệ.";
  if (seriesId && !series.some((item) => item.id === seriesId)) errors.seriesId = "Series không hợp lệ.";
  const type = PRODUCT_TYPES.find((value) => value === productType);
  if (!type) errors.productType = "Vui lòng chọn loại sản phẩm.";
  if (scale.length > 20) errors.scale = "Tối đa 20 ký tự.";
  if (grade.length > 20) errors.grade = "Tối đa 20 ký tự.";
  if (boxContents.length > 2000) errors.boxContents = "Tối đa 2.000 ký tự.";
  if (metaTitle.length > 70) errors.metaTitle = "Tối đa 70 ký tự.";
  if (metaDescription.length > 160) errors.metaDescription = "Tối đa 160 ký tự.";

  const price = parseMoney(priceInput);
  if (price === null) errors.price = "Giá bán phải là số nguyên không âm.";
  const compareAtPrice = compareInput ? parseMoney(compareInput) : null;
  if (compareInput && compareAtPrice === null) errors.compareAtPrice = "Giá gốc không hợp lệ.";
  else if (price !== null && compareAtPrice !== null && compareAtPrice <= price) {
    errors.compareAtPrice = "Giá gốc phải lớn hơn giá bán (để trống nếu không giảm giá).";
  }

  // SKU chỉ nhập khi tạo; sau đó giữ nguyên (YC-SP-03).
  if (!id && !/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(skuInput)) errors.sku = "SKU gồm 2–40 ký tự: chữ, số, dấu chấm, gạch nối.";
  const status = (["draft", "published", "archived"] as const).find((value) => value === statusInput);
  if (!status) errors.status = "Vui lòng chọn trạng thái.";
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
    !status ||
    !type ||
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
    brandId: brandId || null,
    seriesId: seriesId || null,
    productType: type,
    scale,
    grade,
    boxContents,
    sku: skuInput,
    price,
    compareAtPrice,
    model,
    modelUrl: modelUrl || null,
    colors,
    specs,
    isFeatured,
    metaTitle,
    metaDescription,
    status,
  };

  // YC-SP-05: xuất bản cần ít nhất một biến thể đang bật và ảnh đại diện (có sẵn hoặc vừa chụp).
  if (status === "published") {
    const ready = id ? await canPublish(id) : { activeVariant: true, image: false };
    if (!ready.activeVariant || (!ready.image && !poster)) {
      return {
        errors: { status: !ready.activeVariant ? "Cần ít nhất một biến thể đang bật." : "Cần ảnh đại diện trước khi xuất bản (chụp từ mô hình 3D hoặc tải ảnh)." },
        values,
        message: "Chưa xuất bản được.",
      };
    }
  }

  let productId = id;
  try {
    if (id) {
      const old = await findProductById(id);
      if (!old) return { message: "Sản phẩm không còn tồn tại.", values };
      const pick = (p: { price: number; compareAtPrice: number | null; status: ProductStatus }) => ({
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        status: p.status,
      });
      const detail = changes(pick(old), pick(input));
      const priceChanged = "price" in detail.after || "compareAtPrice" in detail.after;
      const entry = audit({
        action: priceChanged ? "product.price_change" : "product.update",
        entity: "products",
        summary: priceChanged ? `Đổi giá sản phẩm ${name}` : `Sửa sản phẩm ${name}`,
        detail,
      });
      if (!(await updateProduct(id, input, entry))) return { message: "Sản phẩm không còn tồn tại.", values };
    } else {
      productId = await insertProduct(
        input,
        audit({ action: "product.create", entity: "products", summary: `Tạo sản phẩm ${name}`, detail: { after: { sku: skuInput, price, status } } }),
      );
    }
  } catch (error) {
    if (isConstraintError(error)) {
      return { errors: { slug: "Đường dẫn hoặc SKU này đã được dùng cho sản phẩm khác." }, values };
    }
    throw error;
  }

  if (poster) await saveProductImage(productId, poster.data, poster.contentType);
  updateTag(PRODUCTS_TAG);

  if (!id) redirect(`/admin/san-pham/${productId}?moi=1`);
  return { ok: true, message: "Đã lưu thay đổi.", values };
}

// YC-SP-03: thêm, sửa biến thể. Đổi giá ghi nhật ký `product.price_change` (YC-SP-07).
export async function saveVariantAction(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(productId)) return { message: "Sản phẩm không hợp lệ." };
  const id = readText(form, "id");
  const input = {
    sku: readText(form, "sku").toUpperCase(),
    barcode: readText(form, "barcode") || null,
    name: readText(form, "name"),
    condition: readText(form, "condition") === "used" ? ("used" as const) : ("new" as const),
    conditionNote: readText(form, "conditionNote"),
    price: parseMoney(readText(form, "price")),
    compareAtPrice: readText(form, "compareAtPrice") ? parseMoney(readText(form, "compareAtPrice")) : null,
    colors: { primary: readText(form, "colorPrimary"), secondary: readText(form, "colorSecondary"), accent: readText(form, "colorAccent") },
  };
  const values = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  const product = await findProductById(productId);
  if (!product) return { message: "Sản phẩm không còn tồn tại.", values };
  const old = id ? product.variants.find((variant) => variant.id === id) : undefined;
  if (id && !old) return { message: "Biến thể không thuộc sản phẩm này.", values };

  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(input.sku)) errors.sku = "SKU gồm 2–40 ký tự: chữ, số, dấu chấm, gạch nối.";
  else if (old?.locked && old.sku !== input.sku) errors.sku = "Biến thể đã có sổ kho hoặc đơn hàng nên không đổi SKU được.";
  if (input.barcode && !/^[0-9A-Za-z-]{4,40}$/.test(input.barcode)) errors.barcode = "Mã vạch gồm 4–40 chữ, số.";
  if (input.name.length < 1 || input.name.length > 80) errors.name = "Tên phiên bản cần 1–80 ký tự.";
  if (input.conditionNote.length > 200) errors.conditionNote = "Tối đa 200 ký tự.";
  if (input.price === null) errors.price = "Giá bán phải là số nguyên không âm.";
  if (input.compareAtPrice === null && readText(form, "compareAtPrice")) errors.compareAtPrice = "Giá gốc không hợp lệ.";
  else if (input.price !== null && input.compareAtPrice !== null && input.compareAtPrice <= input.price) errors.compareAtPrice = "Giá gốc phải lớn hơn giá bán.";
  if (![input.colors.primary, input.colors.secondary, input.colors.accent].every(isHexColor)) errors.colors = "Màu phải ở dạng #rrggbb.";
  if (Object.keys(errors).length > 0 || input.price === null) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const priceChanged = old ? old.price !== input.price || old.compareAtPrice !== input.compareAtPrice : false;
  const entry = audit({
    action: !old ? "product_variant.create" : priceChanged ? "product.price_change" : "product_variant.update",
    entity: "product_variants",
    summary: `${old ? (priceChanged ? "Đổi giá" : "Sửa") : "Thêm"} biến thể ${input.sku} của ${product.name}`,
    detail: changes(old ? { sku: old.sku, name: old.name, price: old.price, compareAtPrice: old.compareAtPrice } : {}, { sku: input.sku, name: input.name, price: input.price, compareAtPrice: input.compareAtPrice }),
  });
  try {
    await saveVariant(productId, id || null, { ...input, price: input.price }, entry);
  } catch (error) {
    if (isConstraintError(error)) return { errors: { sku: "SKU hoặc mã vạch này đã được dùng." }, values };
    throw error;
  }
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: old ? "Đã lưu biến thể." : `Đã thêm biến thể ${input.sku}.` };
}

export async function variantAction(productId: string, variantId: string, action: "activate" | "deactivate" | "default"): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(productId) || !isId(variantId) || !["activate", "deactivate", "default"].includes(action)) return { message: "Yêu cầu không hợp lệ." };
  const entry = audit({ action: `product_variant.${action}`, entity: "product_variants", summary: { activate: "Bật", deactivate: "Tắt", default: "Đặt mặc định" }[action] + " biến thể" });
  const changed =
    action === "default" ? await setDefaultVariant(productId, variantId, entry) : await setVariantActive(productId, variantId, action === "activate", entry);
  updateTag(PRODUCTS_TAG);
  refresh();
  if (changed) return { ok: true };
  return { message: action === "deactivate" ? "Không tắt được biến thể mặc định; hãy đặt biến thể khác làm mặc định trước." : "Biến thể phải đang bật mới đặt làm mặc định được." };
}

// YC-SP-06: sửa chữ thay thế, đổi thứ tự, đặt ảnh đại diện, xoá ảnh. Tải ảnh lên đi qua /admin/api/anh.
export async function mediaAction(
  productId: string,
  mediaId: string,
  change: { alt: string } | { move: -1 | 1 } | { cover: true } | { remove: true },
): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const valid =
    isId(productId) &&
    isId(mediaId) &&
    typeof change === "object" &&
    change !== null &&
    (("alt" in change && typeof change.alt === "string") ||
      ("move" in change && (change.move === 1 || change.move === -1)) ||
      ("cover" in change && change.cover === true) ||
      ("remove" in change && change.remove === true));
  if (!valid) return { message: "Yêu cầu không hợp lệ." };
  const normalized = "alt" in change ? { alt: change.alt.trim().slice(0, 160) } : change;
  const result = await updateMedia(productId, mediaId, normalized);
  if (!result.ok) return { message: "Ảnh không còn thuộc sản phẩm này." };
  if ("remove" in change || "cover" in change) {
    await writeAudit(audit({ action: "remove" in change ? "product_media.delete" : "product_media.cover", entity: "product_media", entityId: mediaId, summary: "remove" in change ? "Xoá ảnh sản phẩm" : "Đổi ảnh đại diện" }));
  }
  // Xoá file trên Storage sau khi đã bỏ khỏi CSDL; file của dữ liệu mẫu (không nằm trong thư mục tải lên) giữ lại.
  if (result.removedUrl) {
    const path = /\/(products\/[a-f0-9]{20}-[a-f0-9]{12}\.(?:webp|png|jpg))$/.exec(result.removedUrl)?.[1];
    if (path) await deleteObject(path);
  }
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}

// YC-SP-10, Q18: tải mô hình .glb thẳng lên Storage bằng URL có chữ ký (file tới 25 MB vượt giới hạn Server
// Action và Route Handler), rồi máy chủ kiểm tra phần đầu file trước khi gắn vào sản phẩm.
export async function startModelUploadAction(productId: string): Promise<{ ok: true; path: string; uploadUrl: string } | { ok: false; message: string }> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return { ok: false, message: FORBIDDEN.message! };
  if (!isId(productId)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  return startModelUpload(productId);
}

export async function finishModelUploadAction(productId: string, path: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(productId) || typeof path !== "string") return { message: "Yêu cầu không hợp lệ." };
  const result = await finishModelUpload(productId, path, audit({ action: "product_media.model", entity: "products", entityId: productId, summary: "Tải mô hình 3D" }));
  if (!result.ok) return { message: result.message };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: "Đã tải mô hình 3D và gắn vào sản phẩm." };
}

// YC-KH-03: khoá, mở khoá tài khoản khách (quyền customers.manage); khoá thì mất mọi phiên ngay.
export async function setCustomerActiveAction(id: string, active: boolean): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || typeof active !== "boolean") return { message: "Yêu cầu không hợp lệ." };
  const changed = await setCustomerActive(id, active, audit({ action: active ? "customer.unlock" : "customer.lock", entity: "users", summary: `${active ? "Mở khoá" : "Khoá"} tài khoản khách` }));
  refresh();
  return changed ? { ok: true, message: active ? "Đã mở khoá tài khoản." : "Đã khoá tài khoản và đăng xuất mọi thiết bị." } : { message: "Tài khoản đã ở trạng thái này." };
}

export async function deleteProductAction(id: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Sản phẩm không hợp lệ." };
  const product = await findProductById(id);
  const entry = audit({ action: "product.delete", entity: "products", summary: `Xoá sản phẩm ${product?.name ?? id}` });
  if (!(await deleteProduct(id, entry))) {
    return { message: "Không xoá được vì sản phẩm đã có trong đơn hàng hoặc sổ kho. Hãy chuyển sang “Lưu trữ” để ẩn sản phẩm." };
  }
  updateTag(PRODUCTS_TAG);
  redirect("/admin/san-pham");
}

// Một action cho mọi thao tác L2–L14 (src/lib/order-flow.ts): quyền và điều kiện lấy từ cùng một bảng luật.
export async function orderAction(
  id: string,
  key: OrderActionKey,
  extra: { carrier?: string; code?: string; reference?: string } = {},
): Promise<FormState> {
  if (!isId(id) || !isOrderActionKey(key) || key === "customer_cancel" || typeof extra !== "object" || extra === null) {
    return { message: "Yêu cầu không hợp lệ." };
  }
  const action = ORDER_ACTIONS[key];
  if (!action.permission) return { message: "Yêu cầu không hợp lệ." };
  const audit = await staffWith(action.permission);
  if (!audit) return FORBIDDEN;

  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const carrier = text(extra.carrier, 60);
  const code = text(extra.code, 60);
  if (key === "hand_over" && (carrier.length < 2 || !/^[A-Za-z0-9-]{4,60}$/.test(code))) {
    return { message: "Nhập hãng vận chuyển và mã vận đơn (chữ, số, gạch nối) trước khi bàn giao." };
  }

  const order = await findOrderById(id);
  const current = { status: order?.status, payment: order?.paymentStatus, shipping: order?.shippingStatus };
  const entry = audit({
    action: `order.${key}`,
    entity: "orders",
    summary: `${action.rule} ${action.label}: đơn ${order?.code ?? id}`,
    // Chỉ các trường luật này đổi, dạng { before, after }.
    detail: { before: Object.fromEntries(Object.keys(action.set).map((field) => [field, current[field as keyof typeof current]])), after: action.set },
  });
  const changed = await applyOrderAction(id, key, entry, {
    tracking: key === "hand_over" ? { carrier, code } : undefined,
    reference: text(extra.reference, 120),
  });
  if (changed && "stock" in action) updateTag(PRODUCTS_TAG);
  refresh();
  return changed
    ? { ok: true, message: `Đã thực hiện: ${action.label}.` }
    : { message: "Đơn hàng không còn ở trạng thái cho phép thao tác này. Trang vừa được tải lại." };
}

export async function createStaffAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("staff.manage");
  if (!audit) return FORBIDDEN;

  const name = readText(form, "name");
  const email = readText(form, "email").toLowerCase();
  const role = readText(form, "role");
  // Mật khẩu không cắt khoảng trắng như các ô khác.
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const values = { name, email, role };

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Họ tên cần từ 2 đến 80 ký tự.";
  if (!isEmail(email)) errors.email = "Email không hợp lệ.";
  if (!isStaffRole(role)) errors.role = "Vui lòng chọn vai trò.";
  if (!isValidPassword(password)) errors.password = `Mật khẩu tạm cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.`;
  if (Object.keys(errors).length > 0 || !isStaffRole(role)) return { errors, values };

  try {
    await insertStaff(
      { email, name, role, passwordHash: await hashPassword(password) },
      audit({ action: "staff.create", entity: "users", summary: `Tạo tài khoản nhân viên ${email}`, detail: { after: { role } } }),
    );
  } catch (error) {
    if (isConstraintError(error)) return { errors: { email: "Email này đã được dùng cho tài khoản khác." }, values };
    throw error;
  }
  refresh();
  return { ok: true, message: `Đã tạo tài khoản ${email}. Gửi mật khẩu tạm cho nhân viên qua kênh riêng.` };
}

// Đổi vai trò (`role`) hoặc khoá, mở khoá (`isActive`) một nhân viên; mọi phiên của người đó bị xoá.
export async function updateStaffAction(id: string, change: { role: string } | { isActive: boolean }): Promise<FormState> {
  const user = await authorize("staff.manage");
  if (!user) return FORBIDDEN;
  const valid =
    isId(id) &&
    typeof change === "object" &&
    change !== null &&
    ("role" in change ? isStaffRole(change.role) : typeof change.isActive === "boolean");
  if (!valid) return { message: "Yêu cầu không hợp lệ." };

  const target = await findStaffById(id);
  if (!target) return { message: "Tài khoản nhân viên không tồn tại." };
  if (user.id === id) return { message: "Bạn không thể tự đổi vai trò hoặc tự khoá tài khoản của mình." };

  const actor = { id: user.id, role: user.role };
  let ok: boolean;
  if ("role" in change && isStaffRole(change.role)) {
    if (change.role === target.role) return { ok: true, message: "Vai trò không thay đổi." };
    ok = await updateStaff(user.id, id, { role: change.role }, {
      actor,
      entity: "users",
      action: "staff.role_change",
      summary: `Đổi vai trò ${target.email} từ ${ROLE_LABELS[target.role]} sang ${ROLE_LABELS[change.role]}`,
      detail: { before: { role: target.role }, after: { role: change.role } },
    });
  } else {
    const isActive = "isActive" in change && change.isActive;
    if (isActive === target.isActive) return { ok: true, message: "Trạng thái không thay đổi." };
    ok = await updateStaff(user.id, id, { isActive }, {
      actor,
      entity: "users",
      action: isActive ? "staff.unlock" : "staff.lock",
      summary: `${isActive ? "Mở khoá" : "Khoá"} tài khoản ${target.email}`,
      detail: { before: { isActive: target.isActive }, after: { isActive } },
    });
  }
  refresh();
  // Bước kiểm tra duy nhất còn lại ở CSDL là còn ít nhất một admin đang hoạt động.
  return ok
    ? { ok: true, message: "Đã cập nhật. Các phiên đăng nhập của tài khoản này đã bị đăng xuất." }
    : { message: "Không thực hiện được: phải còn ít nhất một quản trị viên đang hoạt động." };
}

const TAXONOMY_LABELS = { categories: "danh mục", brands: "thương hiệu", series: "series" } as const;
const TAXONOMY_PATHS = { categories: "/admin/danh-muc", brands: "/admin/thuong-hieu", series: "/admin/series" } as const;

// Tạo hoặc sửa danh mục, thương hiệu, series (`kind` gắn sẵn ở form bằng bind).
export async function saveTaxonomyAction(kind: TaxonomyKind, _prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isTaxonomyKind(kind)) return { message: "Yêu cầu không hợp lệ." };

  const id = readText(form, "id");
  const name = readText(form, "name");
  const slug = readText(form, "slug") || slugify(name);
  const description = kind === "categories" ? readText(form, "description") : "";
  const parentId = kind === "categories" ? readText(form, "parentId") : "";
  const sortInput = kind === "categories" ? readText(form, "sortOrder") || "0" : "0";
  const values = { id, name, slug, description, parentId, sortOrder: sortInput };

  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };
  const items = await listTaxonomy(kind);
  const old = id ? items.find((item) => item.id === id) : undefined;
  if (id && !old) return { message: `Không tìm thấy ${TAXONOMY_LABELS[kind]} này.`, values };

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Tên cần từ 2 đến 80 ký tự.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    errors.slug = "Đường dẫn chỉ gồm chữ thường không dấu, số và gạch nối (tối đa 80 ký tự).";
  } else if (old && old.slug !== slug && kind === "categories" && old.productCount > 0) {
    errors.slug = "Không đổi được đường dẫn khi danh mục còn sản phẩm.";
  }
  if (description.length > 500) errors.description = "Mô tả tối đa 500 ký tự.";
  if (!/^\d{1,4}$/.test(sortInput)) errors.sortOrder = "Thứ tự là số nguyên từ 0 đến 9999.";
  if (parentId) {
    const parent = items.find((item) => item.id === parentId);
    if (!parent || parent.parentId || parent.id === id) errors.parentId = "Danh mục cha phải là một danh mục gốc khác.";
    else if (id && items.some((item) => item.parentId === id)) errors.parentId = "Danh mục đang có danh mục con nên phải là danh mục gốc (tối đa 2 cấp).";
  }
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const input = { slug, name, description, parentId: parentId || null, sortOrder: Number(sortInput) };
  const label = TAXONOMY_LABELS[kind];
  const detail = changes(old ? { slug: old.slug, name: old.name, description: old.description, parentId: old.parentId, sortOrder: old.sortOrder } : {}, input);
  try {
    const saved = await saveTaxonomy(
      kind,
      id || null,
      input,
      audit({ action: `${kind}.${id ? "update" : "create"}`, entity: kind, summary: `${id ? "Sửa" : "Tạo"} ${label} ${name}`, detail }),
    );
    if (!saved) return { message: "Dữ liệu vừa thay đổi ở nơi khác, vui lòng tải lại trang và thử lại.", values };
  } catch (error) {
    if (isConstraintError(error)) return { errors: { slug: `Đường dẫn này đã được dùng cho ${label} khác.` }, values };
    throw error;
  }
  refresh();
  return { ok: true, message: id ? "Đã lưu thay đổi." : `Đã tạo ${label} ${name}.` };
}

export async function deleteTaxonomyAction(kind: TaxonomyKind, id: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isTaxonomyKind(kind) || !isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const item = (await listTaxonomy(kind)).find((value) => value.id === id);
  if (!item) return { message: "Mục này không còn tồn tại." };
  const entry = audit({ action: `${kind}.delete`, entity: kind, summary: `Xoá ${TAXONOMY_LABELS[kind]} ${item.name}` });
  if (!(await deleteTaxonomy(kind, id, entry))) {
    return { message: `Không xoá được vì ${TAXONOMY_LABELS[kind]} này còn sản phẩm${kind === "categories" ? " hoặc danh mục con" : ""}.` };
  }
  redirect(TAXONOMY_PATHS[kind]);
}
