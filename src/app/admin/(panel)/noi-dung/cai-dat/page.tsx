import { SettingsForm } from "@/components/admin/ContentForms";
import { site } from "@/config/site";
import { toVnDateTimeInput } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { getSettings } from "@/server/repo/content";

// YC-CMS-05, 06. Liên hệ và chính sách chưa lưu thì điền sẵn giá trị mẫu trong src/config/site.ts; cửa hàng chỉ
// hiện liên hệ sau khi đã lưu ở đây.
export default async function SettingsPage() {
  await requireStaff("content.edit", "/admin/noi-dung/cai-dat");
  const { contact, announcement, policy } = await getSettings();
  const contactValue = contact ?? site.contact;
  const policyValue = policy ?? site.policy;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Cài đặt hiển thị</h1>
      <SettingsForm
        settingKey="announcement"
        title="Thanh thông báo trên đầu trang"
        fields={[
          { name: "enabled", label: "Bật thanh thông báo", checkbox: true, defaultValue: announcement?.enabled ? "on" : "" },
          { name: "text", label: "Nội dung", defaultValue: announcement?.text ?? "", hint: "Ví dụ: Miễn phí giao hàng cho đơn từ 1.000.000 ₫." },
          { name: "linkUrl", label: "Liên kết (không bắt buộc)", defaultValue: announcement?.linkUrl ?? "" },
          { name: "startsAt", label: "Bắt đầu (giờ Việt Nam)", type: "datetime-local", defaultValue: announcement?.startsAt ? toVnDateTimeInput(announcement.startsAt) : "" },
          { name: "endsAt", label: "Kết thúc (giờ Việt Nam)", type: "datetime-local", defaultValue: announcement?.endsAt ? toVnDateTimeInput(announcement.endsAt) : "" },
        ]}
      />
      <SettingsForm
        settingKey="contact"
        title={contact ? "Thông tin liên hệ (đang hiện ở chân trang)" : "Thông tin liên hệ (chưa hiện; đang điền sẵn nội dung mẫu)"}
        fields={[
          { name: "phone", label: "Điện thoại", defaultValue: contactValue.phone },
          { name: "email", label: "Email", type: "email", defaultValue: contactValue.email },
          { name: "address", label: "Địa chỉ", defaultValue: contactValue.address },
          { name: "hours", label: "Giờ làm việc", defaultValue: contactValue.hours },
        ]}
      />
      <SettingsForm
        settingKey="policy"
        title="Chính sách"
        fields={[
          { name: "returnDays", label: "Số ngày đổi trả", type: "number", defaultValue: String(policyValue.returnDays) },
          { name: "warrantyMonths", label: "Số tháng bảo hành", type: "number", defaultValue: String(policyValue.warrantyMonths) },
        ]}
      />
    </>
  );
}
