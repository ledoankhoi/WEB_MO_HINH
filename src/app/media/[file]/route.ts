import { findProductImage } from "@/server/repo/products";

// Ảnh đại diện sản phẩm lưu trong CSDL. Tên file có dạng <id sản phẩm>-<phiên bản>; mỗi lần lưu ảnh
// mới sinh đường dẫn mới nên trình duyệt có thể cache vĩnh viễn.
export async function GET(_request: Request, context: RouteContext<"/media/[file]">) {
  const { file } = await context.params;
  const match = /^([a-f0-9]{20})-\d{1,15}$/.exec(file);
  const image = match ? await findProductImage(match[1]) : null;
  if (!image) return new Response("Không tìm thấy ảnh", { status: 404 });

  return new Response(image.data, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
