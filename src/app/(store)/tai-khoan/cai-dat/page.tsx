import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PasswordForm, ProfileForm } from "@/components/account/AccountForms";
import { AddressBook, DataExportCard, DeleteAccountForm, DevicesCard, NotificationsForm } from "@/components/account/SettingsForms";
import { SETTINGS_SECTIONS, isSettingsSection, type SettingsSection } from "@/lib/account";
import { LinkedAccounts } from "@/components/account/LinkedAccounts";
import { PROVIDER_LABELS, enabledProviders } from "@/server/auth/oauth";
import { requireUser } from "@/server/auth/session";
import { listIdentities } from "@/server/repo/oauth";
import { listAddresses } from "@/server/repo/addresses";
import { countActiveSessions } from "@/server/repo/users";

export const metadata: Metadata = { title: "Cài đặt tài khoản", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

// Cài đặt tài khoản khách, tham khảo mục "Tài khoản của tôi" của Shopee: Hồ sơ, Sổ địa chỉ, Tài khoản & Bảo mật,
// Thông báo, Quyền riêng tư. Mục đang mở nằm trên URL (?muc=), mặc định Hồ sơ.
async function Settings({ searchParams }: { searchParams: PageProps<"/tai-khoan/cai-dat">["searchParams"] }) {
  const query = await searchParams;
  const param = first(query.muc);
  const section: SettingsSection = isSettingsSection(param) ? param : "ho-so";
  const user = await requireUser(`/tai-khoan/cai-dat${section === "ho-so" ? "" : `?muc=${section}`}`);

  let content: React.ReactNode;
  if (section === "dia-chi") content = <AddressBook addresses={await listAddresses(user.id)} />;
  else if (section === "bao-mat") {
    content = (
      <>
        <PasswordForm />
        <LinkedAccounts
          result={first(query["lien-ket"])}
          providers={await (async () => {
            const linked = await listIdentities(user.id);
            return enabledProviders().map((key) => ({ key, label: PROVIDER_LABELS[key], linked: linked.find((item) => item.provider === key) ?? null }));
          })()}
        />
        <DevicesCard sessions={await countActiveSessions(user.id)} />
      </>
    );
  } else if (section === "thong-bao") content = <NotificationsForm marketingConsent={user.marketingConsent} />;
  else if (section === "rieng-tu") {
    content = (
      <>
        <DataExportCard />
        <DeleteAccountForm />
      </>
    );
  } else content = <ProfileForm user={user} />;

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
      <nav aria-label="Mục cài đặt" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-2 md:flex-col">
        {SETTINGS_SECTIONS.map((item) => {
          const current = item.slug === section;
          return (
            <Link
              key={item.slug}
              href={item.slug === "ho-so" ? "/tai-khoan/cai-dat" : `/tai-khoan/cai-dat?muc=${item.slug}`}
              aria-current={current ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                current ? "bg-brand/10 font-semibold text-brand-strong" : "text-fg hover:bg-raised"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 space-y-6">{content}</div>
    </div>
  );
}

export default function SettingsPage({ searchParams }: PageProps<"/tai-khoan/cai-dat">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-1">
        <Link href="/tai-khoan" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ChevronLeft className="size-4" aria-hidden />
          Tài khoản
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt</h1>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải cài đặt...</p>}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
