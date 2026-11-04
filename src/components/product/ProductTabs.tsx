"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/animate/Tabs";

export type ProductTab = { value: string; label: string; content: ReactNode };

// Các tab trượt (Animate UI). Nội dung từng tab được dựng ở máy chủ rồi truyền vào; chỉ một tab thì hiện
// thẳng, không có thanh tab. Liên kết tới `#<value>` (ví dụ "#danh-gia") mở đúng tab đó.
export function ProductTabs({ tabs, id, action }: { tabs: ProductTab[]; id?: string; action?: ReactNode }) {
  const [value, setValue] = useState(tabs[0]?.value ?? "");

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.slice(1);
      if (tabs.some((tab) => tab.value === hash)) setValue(hash);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [tabs]);

  if (tabs.length === 0) return null;
  if (tabs.length === 1) return <div id={id}>{tabs[0].content}</div>;

  return (
    <Tabs value={value} onValueChange={setValue} id={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Thông tin sản phẩm">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {action}
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
