"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/animate/Tabs";

export type ProductTab = { value: string; label: string; content: ReactNode };

// Mô tả và thông số của trang sản phẩm gom vào các tab trượt (Animate UI). Nội dung từng tab được
// dựng ở máy chủ rồi truyền vào; chỉ một tab thì hiện thẳng, không có thanh tab.
export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  if (tabs.length === 0) return null;
  if (tabs.length === 1) return <div>{tabs[0].content}</div>;

  return (
    <Tabs defaultValue={tabs[0].value}>
      <TabsList aria-label="Thông tin sản phẩm">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
