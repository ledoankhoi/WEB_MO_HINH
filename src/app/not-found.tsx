import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-24 text-center">
      <p className="text-sm font-semibold tracking-[0.2em] text-brand-strong">404</p>
      <h1 className="text-3xl font-bold tracking-tight">Không tìm thấy trang</h1>
      <p className="text-sm text-muted">Trang bạn tìm không tồn tại hoặc đã được chuyển đi.</p>
      <ButtonLink href="/san-pham">Về cửa hàng</ButtonLink>
    </div>
  );
}
