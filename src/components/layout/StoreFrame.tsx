import type { ReactNode } from "react";
import Link from "next/link";
import { getAnnouncement } from "@/server/catalog";
import { Footer } from "./Footer";
import { Header } from "./Header";

// Khung của cửa hàng. Khu quản trị (src/app/admin) có khung riêng nên không dùng component này.
// Thanh thông báo (YC-CMS-05): chỉ hiện khi bật và trong khung giờ.
async function AnnouncementBar() {
  const announcement = await getAnnouncement();
  if (!announcement) return null;
  const text = <span>{announcement.text}</span>;
  return (
    <div className="bg-fg px-4 py-2 text-center text-sm text-bg">
      {!announcement.linkUrl ? text : announcement.linkUrl.startsWith("/") ? <Link href={announcement.linkUrl} className="underline">{text}</Link> : <a href={announcement.linkUrl} className="underline" target="_blank" rel="noopener noreferrer">{text}</a>}
    </div>
  );
}

export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
