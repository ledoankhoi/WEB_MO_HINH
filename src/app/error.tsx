"use client";

import { Button } from "@/components/ui/Button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Đã có lỗi xảy ra</h1>
      <p className="text-sm text-muted">Vui lòng thử lại sau ít phút.</p>
      <Button onClick={() => retry()}>Thử lại</Button>
    </div>
  );
}
