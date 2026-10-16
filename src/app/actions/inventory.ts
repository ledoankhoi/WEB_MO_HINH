"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { parseVnDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { DOCUMENT_REASONS, DOCUMENT_TYPE_LABELS, MAX_LINE_QTY, isDocumentType, type StockDocumentType } from "@/lib/stock";
import type { FormState } from "@/lib/types";
import { isEmail, readText } from "@/lib/validation";
import { PRODUCTS_TAG } from "@/server/catalog";
import { findOrderIdByCode } from "@/server/repo/orders";
import { isConstraintError } from "@/server/db";
import {
  changeDocumentStatus,
  createDocument,
  findDocument,
  locationsInOpenStocktakes,
  postDocument,
  saveDraft,
  startStocktake,
  type DraftInput,
} from "@/server/repo/stock-documents";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";
import {
  listLocations,
  listQuarantineStock,
  listSuppliers,
  saveLocation,
  saveSupplier,
  setLocationActive,
  setSupplierActive,
  type LocationType,
} from "@/server/repo/warehouse";

const CODE = /^[A-Z0-9][A-Z0-9-]{0,29}$/;

// YC-KHO-01: vị trí trong kho KHO-01.
export async function saveLocationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("inventory.setup");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const code = readText(form, "code").toUpperCase();
  const name = readText(form, "name");
  const type = readText(form, "type");
  const values = { id, code, name, type };
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };

  const errors: Record<string, string> = {};
  if (!CODE.test(code)) errors.code = "Mã gồm 1–30 ký tự: chữ in hoa, số, gạch nối (ví dụ A-01-02-03).";
  if (name.length > 80) errors.name = "Tên tối đa 80 ký tự.";
  if (type !== "storage" && type !== "quarantine") errors.type = "Vui lòng chọn loại vị trí.";
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const old = id ? (await listLocations()).find((location) => location.id === id) : undefined;
  if (id && !old) return { message: "Vị trí không còn tồn tại.", values };
  const input = { code, name, type: type as LocationType };
  try {
    const saved = await saveLocation(
      id || null,
      input,
      audit({
        action: id ? "location.update" : "location.create",
        entity: "locations",
        summary: `${id ? "Sửa" : "Tạo"} vị trí ${code}`,
        detail: changes(old ? { code: old.code, name: old.name, type: old.type } : {}, input),
      }),
    );
    if (!saved) return { errors: { type: "Vị trí đang có hàng nên không đổi loại được. Chuyển hết hàng đi trước." }, values };
  } catch (error) {
    if (isConstraintError(error)) return { errors: { code: "Mã vị trí này đã có trong kho." }, values };
    throw error;
  }
  refresh();
  return { ok: true, message: id ? "Đã lưu thay đổi." : `Đã tạo vị trí ${code}.` };
}

export async function setLocationActiveAction(id: string, active: boolean): Promise<FormState> {
  const audit = await staffWith("inventory.setup");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || typeof active !== "boolean") return { message: "Yêu cầu không hợp lệ." };
  const location = (await listLocations()).find((item) => item.id === id);
  if (!location) return { message: "Vị trí không còn tồn tại." };
  const changed = await setLocationActive(
    id,
    active,
    audit({ action: active ? "location.activate" : "location.deactivate", entity: "locations", summary: `${active ? "Dùng lại" : "Ngừng dùng"} vị trí ${location.code}` }),
  );
  refresh();
  if (!changed) return { message: active ? "Vị trí đang được dùng." : "Vị trí còn hàng nên không ngừng dùng được." };
  return { ok: true, message: active ? `Đã dùng lại vị trí ${location.code}.` : `Đã ngừng dùng vị trí ${location.code}.` };
}

// YC-KHO-02.
export async function saveSupplierAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("inventory.setup");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const input = {
    code: readText(form, "code").toUpperCase(),
    name: readText(form, "name"),
    contactName: readText(form, "contactName"),
    phone: readText(form, "phone"),
    email: readText(form, "email").toLowerCase(),
    address: readText(form, "address"),
    note: readText(form, "note"),
  };
  const values = { id, ...input };
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };

  const errors: Record<string, string> = {};
  if (!CODE.test(input.code)) errors.code = "Mã gồm 1–30 ký tự: chữ in hoa, số, gạch nối.";
  if (input.name.length < 2 || input.name.length > 120) errors.name = "Tên cần từ 2 đến 120 ký tự.";
  if (input.contactName.length > 80) errors.contactName = "Tối đa 80 ký tự.";
  if (input.phone && !/^[0-9+ .()-]{6,20}$/.test(input.phone)) errors.phone = "Số điện thoại không hợp lệ.";
  if (input.email && !isEmail(input.email)) errors.email = "Email không hợp lệ.";
  if (input.address.length > 200) errors.address = "Tối đa 200 ký tự.";
  if (input.note.length > 500) errors.note = "Tối đa 500 ký tự.";
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const old = id ? (await listSuppliers()).find((supplier) => supplier.id === id) : undefined;
  if (id && !old) return { message: "Nhà cung cấp không còn tồn tại.", values };
  try {
    await saveSupplier(
      id || null,
      input,
      audit({
        action: id ? "supplier.update" : "supplier.create",
        entity: "suppliers",
        summary: `${id ? "Sửa" : "Tạo"} nhà cung cấp ${input.name}`,
        detail: changes(old ?? {}, input),
      }),
    );
  } catch (error) {
    if (isConstraintError(error)) return { errors: { code: "Mã nhà cung cấp này đã được dùng." }, values };
    throw error;
  }
  refresh();
  return { ok: true, message: id ? "Đã lưu thay đổi." : `Đã tạo nhà cung cấp ${input.name}.` };
}

export async function setSupplierActiveAction(id: string, active: boolean): Promise<FormState> {
  const audit = await staffWith("inventory.setup");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || typeof active !== "boolean") return { message: "Yêu cầu không hợp lệ." };
  const supplier = (await listSuppliers()).find((item) => item.id === id);
  if (!supplier) return { message: "Nhà cung cấp không còn tồn tại." };
  await setSupplierActive(
    id,
    active,
    audit({ action: active ? "supplier.activate" : "supplier.deactivate", entity: "suppliers", summary: `${active ? "Giao dịch lại với" : "Ngừng giao dịch với"} ${supplier.name}` }),
  );
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------
// Phiếu kho (docs/chuan/04 mục 6.1, K1–K5).

type LineInput = {
  variantId?: unknown;
  locationId?: unknown;
  toLocationId?: unknown;
  qtyExpected?: unknown;
  qty?: unknown;
  qtyQuarantined?: unknown;
  unitCost?: unknown;
  note?: unknown;
};

export type DraftPayload = {
  supplierId?: unknown;
  reference?: unknown;
  note?: unknown;
  expectedAt?: unknown;
  reasonCode?: unknown;
  orderCode?: unknown;
  lines?: unknown;
};

const intOrNull = (value: unknown, max: number) =>
  value === null || value === undefined || value === ""
    ? null
    : Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max
      ? Number(value)
      : NaN;
// Số nguyên có dấu, khác 0 hoặc null (phiếu điều chỉnh).
const signedInt = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : Number.isInteger(Number(value)) && Math.abs(Number(value)) <= MAX_LINE_QTY ? Number(value) : NaN;
const textOf = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function createDocumentAction(type: StockDocumentType): Promise<FormState> {
  const audit = await staffWith("inventory.draft");
  if (!audit) return FORBIDDEN;
  if (!isDocumentType(type)) return { message: "Yêu cầu không hợp lệ." };
  const id = await createDocument(
    type,
    audit({ action: "stock_document.create", entity: "stock_documents", summary: `Tạo ${DOCUMENT_TYPE_LABELS[type].toLowerCase()}` }),
  );
  redirect(`/admin/kho/phieu/${id}`);
}

// Người tạo được sửa, gửi, huỷ phiếu của mình; người có quyền ghi sổ được làm với mọi phiếu (K1, K5).
async function documentFor(id: string, permission: "inventory.draft" | "inventory.post") {
  const audit = await staffWith(permission);
  if (!audit || !isId(id)) return null;
  const document = await findDocument(id);
  if (!document) return null;
  const canPost = can(audit.user.role, "inventory.post");
  if (permission === "inventory.draft" && !canPost && document.createdBy !== audit.user.id) return null;
  return { audit, document };
}

export async function saveDraftAction(id: string, payload: DraftPayload): Promise<FormState> {
  const found = await documentFor(id, "inventory.draft");
  if (!found) return FORBIDDEN;
  const { document } = found;
  if (document.status !== "draft") return { message: "Chỉ sửa được phiếu nháp." };
  if (typeof payload !== "object" || payload === null || !Array.isArray(payload.lines) || payload.lines.length > 200) {
    return { message: "Dữ liệu phiếu không hợp lệ." };
  }

  const [locations, suppliers] = await Promise.all([listLocations(), listSuppliers()]);
  const errors: string[] = [];
  const supplierId = textOf(payload.supplierId, 20) || null;
  if (supplierId && !suppliers.some((s) => s.id === supplierId && s.isActive)) errors.push("Nhà cung cấp không hợp lệ hoặc đã ngừng giao dịch.");
  const expectedText = textOf(payload.expectedAt, 10);
  const expectedAt = expectedText ? parseVnDate(expectedText) : null;
  if (expectedText && expectedAt === null) errors.push("Ngày dự kiến không hợp lệ.");
  const reasons = DOCUMENT_REASONS[document.type];
  const reasonCode = textOf(payload.reasonCode, 40) || (reasons ? Object.keys(reasons)[0] : "");
  if (reasons && !(reasonCode in reasons)) errors.push("Lý do không hợp lệ.");
  // Phiếu hàng trả gắn với đơn (nếu có) bằng mã đơn.
  const orderCode = textOf(payload.orderCode, 20).toUpperCase();
  const orderId = document.type === "return" && orderCode ? await findOrderIdByCode(orderCode) : null;
  if (document.type === "return" && orderCode && !orderId) errors.push(`Không có đơn hàng mã ${orderCode}.`);

  const type = document.type;
  if (type === "stocktake" && !document.snapshotAt) return { message: "Chọn vị trí và chụp số sổ sách trước khi đếm." };
  // Số sổ sách của phiếu kiểm kê do máy chủ chụp; không nhận từ trình duyệt.
  const snapshot = new Map(document.lines.map((line) => [`${line.variantId}:${line.locationId}`, line.systemQty ?? 0]));
  const lines: DraftInput["lines"] = [];
  const seen = new Set<string>();
  for (const [index, raw] of (payload.lines as LineInput[]).entries()) {
    const label = `Dòng ${index + 1}`;
    const variantId = textOf(raw?.variantId, 20);
    const locationId = textOf(raw?.locationId, 20);
    const toLocationId = type === "transfer" ? textOf(raw?.toLocationId, 20) : "";
    const location = locations.find((l) => l.id === locationId);
    const toLocation = locations.find((l) => l.id === toLocationId);
    const qtyExpected = type === "receipt" ? intOrNull(raw?.qtyExpected, MAX_LINE_QTY) : null;
    const qty = type === "adjustment" ? signedInt(raw?.qty) : intOrNull(raw?.qty, MAX_LINE_QTY);
    const qtyQuarantined = type === "receipt" ? intOrNull(raw?.qtyQuarantined, MAX_LINE_QTY) : null;
    const unitCost = type === "receipt" ? intOrNull(raw?.unitCost, 1_000_000_000) : null;
    if (!isId(variantId)) errors.push(`${label}: chưa chọn sản phẩm.`);
    if (!location || !location.isActive) errors.push(`${label}: vị trí không hợp lệ hoặc đã ngừng dùng.`);
    else if (type === "receipt" && location.type !== "storage") errors.push(`${label}: hàng nhận tốt phải vào kệ hàng; phần lỗi ghi ở cột cách ly.`);
    else if (type === "return" && location.type !== "quarantine") errors.push(`${label}: hàng trả phải nhận vào khu cách ly.`);
    else if (type === "stocktake" && !document.countLocations.includes(locationId)) errors.push(`${label}: vị trí không thuộc phiếu kiểm kê này.`);
    if (type === "transfer" && (!toLocation || !toLocation.isActive || toLocationId === locationId)) errors.push(`${label}: chọn vị trí đích khác vị trí nguồn.`);
    for (const [name, value] of [["SL dự kiến", qtyExpected], ["Số lượng", qty], ["SL cách ly", qtyQuarantined], ["Đơn giá", unitCost]] as const) {
      if (Number.isNaN(value)) errors.push(`${label}: ${name} phải là số nguyên không âm.`);
    }
    if (type === "adjustment" && !qty) errors.push(`${label}: số lượng điều chỉnh phải khác 0 (số âm là giảm).`);
    else if (type !== "receipt" && type !== "stocktake" && type !== "adjustment" && !((qty ?? 0) > 0)) errors.push(`${label}: số lượng phải lớn hơn 0.`);
    if (type === "receipt" && (qtyQuarantined ?? 0) > (qty ?? 0)) errors.push(`${label}: SL cách ly không được lớn hơn SL thực nhận.`);
    if (type === "receipt" && (qty ?? 0) > 0 && unitCost === null) errors.push(`${label}: cần nhập đơn giá nhập.`);
    const key = `${variantId}:${locationId}`;
    if (seen.has(key)) errors.push(`${label}: trùng sản phẩm và vị trí với một dòng khác.`);
    seen.add(key);
    const systemQty = type === "stocktake" ? (snapshot.get(key) ?? 0) : null;
    lines.push({ variantId, locationId, toLocationId: toLocationId || null, qtyExpected, qty, qtyQuarantined, systemQty, unitCost, note: textOf(raw?.note, 200) });
  }
  // YC-KHO-06: điều chỉnh giảm bắt buộc ghi chú.
  if (type === "adjustment" && lines.some((line) => (line.qty ?? 0) < 0) && !textOf(payload.note, 500)) errors.push("Điều chỉnh giảm cần ghi chú lý do cụ thể.");
  if (errors.length > 0) return { message: errors.slice(0, 8).join(" ") };

  try {
    const saved = await saveDraft(id, {
      supplierId: type === "receipt" ? supplierId : null,
      orderId,
      reasonCode,
      reference: textOf(payload.reference, 60),
      note: textOf(payload.note, 500),
      expectedAt,
      lines,
    });
    if (!saved) return { message: "Phiếu vừa được gửi hoặc huỷ ở nơi khác. Trang vừa được tải lại." };
  } catch (error) {
    if (isConstraintError(error)) return { message: "Có sản phẩm không còn tồn tại. Vui lòng tải lại trang." };
    throw error;
  }
  refresh();
  return { ok: true, message: "Đã lưu nháp." };
}

const STATUS_ACTIONS = {
  submit: { permission: "inventory.draft", label: "Gửi ghi sổ" },
  return: { permission: "inventory.post", label: "Trả lại để sửa" },
  cancel: { permission: "inventory.draft", label: "Huỷ phiếu" },
  post: { permission: "inventory.post", label: "Ghi sổ" },
} as const;

export type DocumentActionKey = keyof typeof STATUS_ACTIONS;

export async function documentAction(id: string, action: DocumentActionKey): Promise<FormState> {
  if (typeof action !== "string" || !Object.hasOwn(STATUS_ACTIONS, action)) return { message: "Yêu cầu không hợp lệ." };
  const found = await documentFor(id, STATUS_ACTIONS[action].permission);
  if (!found) return FORBIDDEN;
  const { audit, document } = found;
  const entry = audit({
    action: `stock_document.${action}`,
    entity: "stock_documents",
    summary: `${STATUS_ACTIONS[action].label} ${document.code}`,
    detail: { before: { status: document.status } },
  });
  if (action === "post") {
    // Q10: điều chỉnh, kiểm kê có chênh lệch thì người ghi sổ phải khác người tạo; quản trị viên được tự ghi sổ.
    const hasDifference = document.type === "adjustment" || document.lines.some((line) => line.qty !== null && line.qty !== line.systemQty);
    const dualControl = (document.type === "adjustment" || document.type === "stocktake") && hasDifference;
    if (dualControl && document.createdBy === audit.user.id && audit.user.role !== "admin") {
      return { message: "Phiếu điều chỉnh, kiểm kê có chênh lệch phải do người khác ghi sổ (kiểm soát kép)." };
    }
    const result = await postDocument(id, entry);
    refresh();
    if (result.ok) {
      updateTag(PRODUCTS_TAG);
      return { ok: true, message: `Đã ghi sổ ${document.code}.` };
    }
    if (result.reason === "stock") return { message: "Không ghi sổ được: số lượng vượt tồn ở vị trí, hoặc phiếu vừa được ghi sổ ở nơi khác." };
    return { message: result.message ?? "Phiếu không còn ở trạng thái ghi sổ được." };
  }
  const changed = await changeDocumentStatus(id, action, entry);
  refresh();
  return changed
    ? { ok: true, message: `Đã thực hiện: ${STATUS_ACTIONS[action].label}.` }
    : { message: "Phiếu không còn ở trạng thái cho phép (hoặc chưa có dòng nào)." };
}

// YC-KHO-09: xử lý hàng cách ly bằng phiếu nháp điền sẵn. "Bán lại được" = chuyển sang kệ hàng đầu tiên;
// "Huỷ hàng" = phiếu xuất lý do hư hỏng. Nhân viên kiểm tra phiếu rồi gửi ghi sổ như mọi phiếu khác.
export async function resolveQuarantineAction(variantId: string, locationId: string, decision: "resell" | "scrap"): Promise<FormState> {
  const audit = await staffWith("inventory.draft");
  if (!audit) return FORBIDDEN;
  if (!isId(variantId) || !isId(locationId) || (decision !== "resell" && decision !== "scrap")) return { message: "Yêu cầu không hợp lệ." };
  const locations = await listLocations();
  const quarantine = locations.find((l) => l.id === locationId && l.type === "quarantine");
  const storage = locations.find((l) => l.type === "storage" && l.isActive);
  const held = quarantine ? (await listQuarantineStock()).find((row) => row.variantId === variantId && row.locationId === locationId)?.qty : 0;
  if (!quarantine || !held || (decision === "resell" && !storage)) return { message: "Không còn hàng cách ly này hoặc kho chưa có kệ hàng." };

  const type = decision === "resell" ? "transfer" : "issue";
  const id = await createDocument(
    type,
    audit({ action: "stock_document.create", entity: "stock_documents", summary: `${decision === "resell" ? "Bán lại hàng cách ly" : "Huỷ hàng cách ly"}:` }),
  );
  await saveDraft(id, {
    supplierId: null,
    orderId: null,
    reasonCode: decision === "scrap" ? "damaged" : "",
    reference: "",
    note: decision === "resell" ? "Hàng cách ly đã kiểm tra, bán lại được" : "Huỷ hàng cách ly hư hỏng",
    expectedAt: null,
    lines: [
      {
        variantId,
        locationId,
        toLocationId: decision === "resell" ? storage!.id : null,
        qtyExpected: null,
        qty: held,
        qtyQuarantined: null,
        systemQty: null,
        unitCost: null,
        note: "",
      },
    ],
  });
  redirect(`/admin/kho/phieu/${id}`);
}

// YC-KHO-07: chọn vị trí và chụp số sổ sách để bắt đầu đếm.
export async function startStocktakeAction(id: string, locationIds: string[]): Promise<FormState> {
  const found = await documentFor(id, "inventory.draft");
  if (!found) return FORBIDDEN;
  const { audit, document } = found;
  if (document.type !== "stocktake" || document.status !== "draft" || document.snapshotAt) return { message: "Phiếu này đã bắt đầu kiểm kê hoặc không phải phiếu kiểm kê." };
  if (!Array.isArray(locationIds) || locationIds.length === 0 || locationIds.length > 200 || !locationIds.every(isId)) return { message: "Chọn ít nhất một vị trí." };
  const locations = await listLocations();
  const chosen = [...new Set(locationIds)];
  if (!chosen.every((locationId) => locations.some((l) => l.id === locationId && l.isActive))) return { message: "Có vị trí không hợp lệ hoặc đã ngừng dùng." };
  const busy = await locationsInOpenStocktakes(id);
  const conflict = locations.filter((l) => chosen.includes(l.id) && busy.has(l.id)).map((l) => l.code);
  if (conflict.length > 0) return { message: `Vị trí ${conflict.join(", ")} đang thuộc một phiếu kiểm kê khác chưa ghi sổ (QT-16).` };
  const started = await startStocktake(
    id,
    chosen,
    audit({ action: "stock_document.snapshot", entity: "stock_documents", summary: `Chụp số sổ sách để kiểm kê ${document.code}`, detail: { after: { locations: chosen.length } } }),
  );
  refresh();
  return started ? { ok: true, message: "Đã chụp số sổ sách. Bắt đầu đếm." } : { message: "Phiếu vừa được bắt đầu ở nơi khác. Trang vừa được tải lại." };
}
