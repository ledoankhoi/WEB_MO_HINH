import { ButtonLink } from "@/components/ui/Button";

// Đặt trong nhóm (panel) để trang báo lỗi vẫn nằm trong khung quản trị, không rơi ra trang 404 của cửa hàng.
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Không tìm thấy</h1>
      <p className="text-sm text-muted">Sản phẩm hoặc đơn hàng này không tồn tại hoặc đã bị xoá.</p>
      <ButtonLink href="/admin">Về tổng quan</ButtonLink>
    </div>
  );
}
