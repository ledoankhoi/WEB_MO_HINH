import modelCredits from "@/data/model-credits.json";
import { modelKey } from "@/lib/model-features";

type Credit = { title: string; author: string; authorUrl: string; license: string; licenseUrl: string; sourceUrl: string };
const credits: Record<string, Credit | undefined> = modelCredits;

const LINK = "underline hover:text-fg";

// Ghi nguồn mô hình 3D (CC BY bắt buộc ghi tác giả, giấy phép) dưới mọi khung 3D dùng file .glb tải từ Sketchfab.
// Mô hình không có trong src/data/model-credits.json thì không hiện gì.
export function ModelCredit({ modelUrl, className = "text-xs text-muted" }: { modelUrl: string | null; className?: string }) {
  const credit = credits[modelKey(modelUrl) ?? ""];
  if (!credit) return null;
  return (
    <p className={className}>
      Mô hình 3D:{" "}
      <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        {credit.title}
      </a>{" "}
      của{" "}
      <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        {credit.author}
      </a>
      , giấy phép{" "}
      <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        {credit.license}
      </a>
      .
    </p>
  );
}
