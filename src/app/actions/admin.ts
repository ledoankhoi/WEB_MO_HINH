"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  isCategorySlug,
  isPaymentStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  isRobotModelKey,
  type OrderStatus,
  type PaymentStatus,
  type ProductSpec,
} from "@/lib/catalog";
import { slugify } from "@/lib/format";
import { ROLE_LABELS, isStaffRole, type Permission } from "@/lib/permissions";
import type { FormState, ProductStatus } from "@/lib/types";
import { isEmail, isHexColor, parseMoney, readText } from "@/lib/validation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hashPassword, isValidPassword } from "@/server/auth/password";
import { authorize } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { isConstraintError } from "@/server/db";
import type { AuditEntry } from "@/server/repo/audit";
import { advanceOrder, cancelOrder, findOrderById, setPaymentStatus } from "@/server/repo/orders";
import {
  deleteProduct,
  findProductById,
  insertProduct,
  saveProductImage,
  updateProduct,
  type ProductInput,
} from "@/server/repo/products";
import { findStaffById, insertStaff, updateStaff } from "@/server/repo/staff";
import { deleteTaxonomy, isTaxonomyKind, listTaxonomy, saveTaxonomy, type TaxonomyKind } from "@/server/repo/taxonomy";

const MAX_POSTER_BYTES = 800 * 1024;
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{20}$/.test(value);
const FORBIDDEN: FormState = { message: "Bạn không có quyền thực hiện thao tác này." };

// Kiểm tra phiên và quyền trước mọi thao tác; trả về hàm tạo dòng nhật ký mang người làm và vai trò.
async function staffWith(permission: Permission) {
  const user = await authorize(permission);
  if (!user) return null;
  return (entry: Omit<AuditEntry, "actor">): AuditEntry => ({ actor: { id: user.id, role: user.role }, ...entry });
}

// Chỉ giữ các trường có đổi, dạng { before, after }.
function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Object.keys(after).filter((key) => before[key] !== after[key]);
  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])),
    after: Object.fromEntries(keys.map((key) => [key, after[key]])),
  };
}

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
  const statusInput = readText(form, "status");

  const values = {
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
  if (!isCategorySlug(category)) errors.category = "Vui lòng chọn danh mục.";

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
    sku: skuInput,
    price,
    compareAtPrice,
    model,
    modelUrl: modelUrl || null,
    colors,
    specs,
    isFeatured,
    status,
  };

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

// Bàn giao vận chuyển thuộc nhóm thực hiện đơn (L6); xác nhận và hoàn tất thuộc nhóm xử lý đơn.
const ADVANCE_PERMISSION = { confirmed: "orders.process", shipping: "orders.fulfil", completed: "orders.process" } as const;

export async function advanceOrderAction(id: string, to: OrderStatus): Promise<FormState> {
  if (!isId(id) || (to !== "confirmed" && to !== "shipping" && to !== "completed")) {
    return { message: "Yêu cầu không hợp lệ." };
  }
  const audit = await staffWith(ADVANCE_PERMISSION[to]);
  if (!audit) return FORBIDDEN;
  const order = await findOrderById(id);
  const entry = audit({
    action: `order.${to}`,
    entity: "orders",
    summary: `Chuyển đơn ${order?.code ?? id} sang ${ORDER_STATUS_LABELS[to]}`,
    detail: { before: { status: order?.status }, after: { status: to } },
  });
  const changed = await advanceOrder(id, to, entry);
  refresh();
  return changed
    ? { ok: true, message: "Đã cập nhật trạng thái đơn hàng." }
    : { message: "Đơn hàng đã thay đổi trạng thái trước đó. Trang vừa được tải lại." };
}

export async function cancelOrderAsAdminAction(id: string): Promise<FormState> {
  const audit = await staffWith("orders.process");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const order = await findOrderById(id);
  const entry = audit({
    action: "order.cancel",
    entity: "orders",
    summary: `Huỷ đơn ${order?.code ?? id}`,
    detail: { before: { status: order?.status }, after: { status: "cancelled" } },
  });
  const cancelled = await cancelOrder(id, ["pending", "confirmed"], entry);
  if (cancelled) updateTag(PRODUCTS_TAG);
  refresh();
  return cancelled
    ? { ok: true, message: "Đã huỷ đơn và trả hàng đang giữ về kho." }
    : { message: "Không thể huỷ đơn ở trạng thái hiện tại." };
}

export async function setPaymentStatusAction(id: string, status: PaymentStatus): Promise<FormState> {
  const audit = await staffWith("payments.manage");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || typeof status !== "string" || !isPaymentStatus(status)) {
    return { message: "Yêu cầu không hợp lệ." };
  }
  const order = await findOrderById(id);
  const entry = audit({
    action: `payment.${status}`,
    entity: "orders",
    summary: `Đổi thanh toán đơn ${order?.code ?? id} sang ${PAYMENT_STATUS_LABELS[status]}`,
    detail: { before: { paymentStatus: order?.paymentStatus }, after: { paymentStatus: status } },
  });
  const changed = await setPaymentStatus(id, status, entry);
  refresh();
  return changed ? { ok: true, message: "Đã cập nhật thanh toán." } : { message: "Không tìm thấy đơn hàng." };
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
