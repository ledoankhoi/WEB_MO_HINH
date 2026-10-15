import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

// Khung của cửa hàng. Khu quản trị (src/app/admin) có khung riêng nên không dùng component này.
export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
