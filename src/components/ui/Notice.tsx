import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

type Tone = "success" | "error" | "info";

const TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  success: { box: "border-success/40 bg-success/10 text-success", icon: CircleCheck },
  error: { box: "border-danger/40 bg-danger/10 text-danger", icon: CircleAlert },
  info: { box: "border-brand/30 bg-brand/10 text-brand-strong", icon: Info },
};

// Khung thông báo kết quả của form. role="status"/"alert" để trình đọc màn hình đọc lên ngay.
export function Notice({ tone = "info", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${box} ${className}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
