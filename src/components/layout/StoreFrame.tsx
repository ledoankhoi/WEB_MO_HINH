import type { ReactNode } from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import { getAnnouncement } from "@/server/catalog";
import { Footer } from "./Footer";
import { Header } from "./Header";

// Phông của giao diện cửa hàng "Hộp mô hình"; phải có bộ ký tự "vietnamese" để chữ có dấu không rơi về phông hệ thống.
const barlow = Barlow({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

// Khung của cửa hàng. Khu quản trị (src/app/admin) có khung riêng nên không dùng component này.
// Thanh thông báo (YC-CMS-05): chỉ hiện khi bật và trong khung giờ.
async function AnnouncementBar() {
  const announcement = await getAnnouncement();
  if (!announcement) return null;
  const text = <span>{announcement.text}</span>;
  return (
    <div className="bg-ink px-4 py-2 text-center text-sm font-medium text-white">
      {!announcement.linkUrl ? text : announcement.linkUrl.startsWith("/") ? <Link href={announcement.linkUrl} className="underline">{text}</Link> : <a href={announcement.linkUrl} className="underline" target="_blank" rel="noopener noreferrer">{text}</a>}
    </div>
  );
}

// `.store-skin` (globals.css) đổi bảng màu, phông và dáng nút cho mọi trang bên trong. Đệm dưới trên điện thoại để
// thanh điều hướng dính đáy không che chân trang.
export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <div className={`${barlow.variable} ${barlowCondensed.variable} store-skin flex min-h-full flex-1 flex-col pb-20 font-sans lg:pb-0`}>
      <AnnouncementBar />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
