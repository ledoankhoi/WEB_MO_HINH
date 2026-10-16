"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { isEmail, readText } from "@/lib/validation";
import { isConstraintError } from "@/server/db";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";
import {
  listLocations,
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
