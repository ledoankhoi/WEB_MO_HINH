"use client";

import { useActionState, useState, useTransition } from "react";
import { Briefcase, Download, House, MonitorSmartphone, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  deleteAccountAction,
  deleteAddressAction,
  logoutOtherDevicesAction,
  saveAddressAction,
  setDefaultAddressAction,
  updateNotificationsAction,
} from "@/app/actions/account";
import { Checkbox } from "@/components/animate/Checkbox";
import { RadioGroup, RadioGroupItem, radioCardClass } from "@/components/animate/RadioGroup";
import { Switch } from "@/components/animate/Switch";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/button-style";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ADDRESS_LABELS, DELETE_CONFIRM_PHRASE, MAX_ADDRESSES, type Address } from "@/lib/account";
import { PROVINCES } from "@/lib/catalog";
import type { FormState } from "@/lib/types";
import { Result, card } from "./AccountForms";

const INITIAL: FormState = {};

// Form thêm hoặc sửa một địa chỉ. `address` null là thêm mới.
function AddressForm({ address, first, onDone }: { address: Address | null; first: boolean; onDone: (result?: FormState) => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await saveAddressAction(prev, form);
    if (next.ok) onDone(next);
    return next;
  }, INITIAL);
  const value = (name: "label" | "recipientName" | "phone" | "address" | "city") => state.values?.[name] ?? address?.[name] ?? "";

  return (
    <form action={action} className="space-y-4 rounded-xl border border-brand/40 bg-raised/40 p-4 sm:p-5">
      <p className="font-semibold">{address ? "Sửa địa chỉ" : "Thêm địa chỉ mới"}</p>
      {!state.ok && <Result state={state} />}
      {address && <input type="hidden" name="id" value={address.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ tên người nhận" name="recipientName" required autoComplete="name" defaultValue={value("recipientName")} error={state.errors?.recipientName} />
        <Field label="Số điện thoại" name="phone" type="tel" required autoComplete="tel" defaultValue={value("phone")} error={state.errors?.phone} />
      </div>
      <Field
        label="Địa chỉ"
        name="address"
        required
        autoComplete="street-address"
        placeholder="Số nhà, đường, phường/xã"
        defaultValue={value("address")}
        error={state.errors?.address}
      />
      <SelectField label="Tỉnh / Thành phố" name="city" required defaultValue={value("city")} error={state.errors?.city}>
        <option value="">Chọn tỉnh, thành phố</option>
        {PROVINCES.map((province) => (
          <option key={province}>{province}</option>
        ))}
      </SelectField>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Loại địa chỉ</legend>
        <RadioGroup name="label" defaultValue={value("label") || "home"} className="grid grid-cols-2 gap-2">
          {Object.entries(ADDRESS_LABELS).map(([key, text]) => (
            <label key={key} className={radioCardClass}>
              <RadioGroupItem value={key} />
              {text}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      {!first && !address?.isDefault && (
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox name="isDefault" />
          Đặt làm địa chỉ mặc định
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {address ? "Lưu địa chỉ" : "Thêm địa chỉ"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}

// Cài đặt > Sổ địa chỉ (YC-TKH-03). Địa chỉ mặc định được điền sẵn ở trang thanh toán.
export function AddressBook({ addresses }: { addresses: Address[] }) {
  // "new": đang thêm; id: đang sửa địa chỉ đó; null: chỉ xem danh sách.
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<FormState>(INITIAL);
  const [busy, startTransition] = useTransition();
  const run = (task: () => Promise<FormState>) => startTransition(async () => setNotice(await task()));

  return (
    <section className={card} aria-labelledby="so-dia-chi">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="so-dia-chi" className="text-lg font-semibold">
          Sổ địa chỉ
        </h2>
        {editing !== "new" && addresses.length < MAX_ADDRESSES && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Thêm địa chỉ mới
          </Button>
        )}
      </div>
      <Result state={notice} />
      {editing === "new" && (
        <AddressForm
          address={null}
          first={addresses.length === 0}
          onDone={(result) => {
            setEditing(null);
            setNotice(result ?? INITIAL);
          }}
        />
      )}

      {addresses.length === 0 && editing !== "new" ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
          Chưa có địa chỉ nào. Thêm địa chỉ để trang thanh toán tự điền sẵn.
        </p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((item) =>
            editing === item.id ? (
              <li key={item.id}>
                <AddressForm
                  address={item}
                  first={false}
                  onDone={(result) => {
                    setEditing(null);
                    setNotice(result ?? INITIAL);
                  }}
                />
              </li>
            ) : (
              <li key={item.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-line p-4">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.recipientName}</span>
                    <span className="text-muted">{item.phone}</span>
                  </p>
                  <p>
                    {item.address}, {item.city}
                  </p>
                  <p className="flex flex-wrap gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium">
                      {item.label === "office" ? <Briefcase className="size-3.5" aria-hidden /> : <House className="size-3.5" aria-hidden />}
                      {ADDRESS_LABELS[item.label]}
                    </span>
                    {item.isDefault && (
                      <span className="rounded-full border border-brand px-2.5 py-0.5 text-xs font-semibold text-brand-strong">Mặc định</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(item.id)} aria-label={`Sửa địa chỉ của ${item.recipientName}`}>
                    <Pencil className="size-4" aria-hidden />
                    Sửa
                  </Button>
                  {!item.isDefault && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setDefaultAddressAction(item.id))}>
                      <Star className="size-4" aria-hidden />
                      Đặt mặc định
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Xoá địa chỉ "${item.address}, ${item.city}"?`)) run(() => deleteAddressAction(item.id));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Xoá
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <p className="text-xs text-muted">
        Tối đa {MAX_ADDRESSES} địa chỉ. Địa chỉ mặc định được điền sẵn khi đặt hàng; ở trang thanh toán bạn vẫn chọn được địa chỉ khác trong sổ.
      </p>
    </section>
  );
}

// Cài đặt > Tài khoản & Bảo mật: các thiết bị đang đăng nhập.
export function DevicesCard({ sessions }: { sessions: number }) {
  const [state, setState] = useState<FormState>(INITIAL);
  const [pending, startTransition] = useTransition();
  const others = Math.max(sessions - 1, 0);

  return (
    <section className={card} aria-labelledby="thiet-bi">
      <h2 id="thiet-bi" className="text-lg font-semibold">
        Thiết bị đang đăng nhập
      </h2>
      <Result state={state} />
      <p className="flex items-start gap-3 text-sm">
        <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <span>
          Tài khoản đang đăng nhập trên <b>{sessions}</b> thiết bị, trình duyệt (kể cả thiết bị này).
          {others > 0 ? " Nếu có thiết bị bạn không nhận ra, hãy đăng xuất chúng và đổi mật khẩu." : ""}
        </span>
      </p>
      <Button variant="secondary" pending={pending} disabled={others === 0} onClick={() => startTransition(async () => setState(await logoutOtherDevicesAction()))}>
        Đăng xuất mọi thiết bị khác
      </Button>
    </section>
  );
}

// Cài đặt > Thông báo. Cửa hàng chưa gửi email đơn hàng tự động; trạng thái đơn xem ở trang Tài khoản.
export function NotificationsForm({ marketingConsent }: { marketingConsent: boolean }) {
  const [state, action, pending] = useActionState(updateNotificationsAction, INITIAL);
  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-semibold">Thông báo</h2>
      <Result state={state} />
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 text-sm">
        <span>
          <span className="block font-medium">Khuyến mãi và hàng mới qua email</span>
          <span className="text-muted">Mã giảm giá, mẫu mới về kệ, sự kiện của cửa hàng. Tắt bất cứ lúc nào.</span>
        </span>
        <Switch name="marketingConsent" defaultChecked={marketingConsent} />
      </label>
      <p className="text-xs text-muted">Cập nhật đơn hàng luôn hiện ở trang Tài khoản và trang tra cứu đơn, không phụ thuộc cài đặt này.</p>
      <Button type="submit" pending={pending}>
        Lưu cài đặt
      </Button>
    </form>
  );
}

// Cài đặt > Quyền riêng tư: tải dữ liệu cá nhân.
export function DataExportCard() {
  return (
    <section className={card} aria-labelledby="tai-du-lieu">
      <h2 id="tai-du-lieu" className="text-lg font-semibold">
        Tải dữ liệu cá nhân
      </h2>
      <p className="text-sm text-muted">
        Tải về một file JSON gồm hồ sơ, sổ địa chỉ, đơn hàng, đánh giá, yêu thích, yêu cầu báo có hàng, xu, lượt quay gacha, mảnh ghép, bài đăng và bình luận cộng đồng của bạn. File không chứa
        mật khẩu.
      </p>
      <a href="/api/tai-khoan/du-lieu" download className={buttonClass({ variant: "secondary" })}>
        <Download className="size-4" aria-hidden />
        Tải dữ liệu của tôi
      </a>
    </section>
  );
}

// Cài đặt > Quyền riêng tư: xoá tài khoản. Hiện điều khoản trước, xác minh bằng mật khẩu và câu xác nhận.
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await deleteAccountAction(prev, form);
    // Tải lại toàn bộ trang (không dùng router) để xoá mọi trạng thái còn giữ của tài khoản vừa xoá, như nút Đăng xuất.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (next.ok) window.location.assign("/");
    return next;
  }, INITIAL);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-danger/40 bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-danger">Xoá tài khoản</h2>
      <Result state={state} />
      <Notice tone="error">
        <p className="font-semibold">Xoá tài khoản là vĩnh viễn, không khôi phục được:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Họ tên, số điện thoại, sổ địa chỉ, danh sách yêu thích và yêu cầu báo có hàng bị xoá.</li>
          <li>Bạn không đăng nhập được nữa; email này có thể dùng để đăng ký tài khoản mới.</li>
          <li>Đánh giá và bài đăng cộng đồng vẫn hiển thị, tên người viết đổi thành &ldquo;Tài khoản đã xoá&rdquo;. Xu và mã giảm giá chưa dùng bị huỷ.</li>
          <li>Đơn hàng cũ được cửa hàng giữ lại để đối soát sổ sách, bảo hành theo quy định.</li>
          <li>Chỉ xoá được khi mọi đơn hàng đã hoàn tất hoặc đã huỷ.</li>
        </ul>
      </Notice>
      <Field label="Mật khẩu" name="password" type="password" required autoComplete="current-password" error={state.errors?.password} />
      <Field
        label={`Gõ "${DELETE_CONFIRM_PHRASE}" để xác nhận`}
        name="confirm"
        required
        autoComplete="off"
        spellCheck={false}
        error={state.errors?.confirm}
      />
      <Button type="submit" variant="danger" pending={pending}>
        Xoá vĩnh viễn tài khoản
      </Button>
    </form>
  );
}
