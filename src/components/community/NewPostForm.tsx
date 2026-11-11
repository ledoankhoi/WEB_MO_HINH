"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { COMMUNITY_TOPICS, MAX_POST_IMAGES, MAX_POST_IMAGE_BYTES, POST_MAX, POST_MIN } from "@/lib/community";

const CONTROL = "w-full border-3 border-ink bg-surface px-3 text-sm focus:border-brand focus:outline-none";

// Đăng bài Cộng đồng: chủ đề, nội dung, gắn sản phẩm, tối đa 4 ảnh (xem trước). Gửi tới POST /api/cong-dong/bai-viet.
export function NewPostForm({ products }: { products: { slug: string; name: string }[] }) {
  const router = useRouter();
  // Ảnh đã chọn kèm địa chỉ xem trước (blob:), thu hồi khi bỏ ảnh hoặc rời trang.
  const [items, setItems] = useState<{ file: File; url: string }[]>([]);
  const urls = useRef<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_POST_IMAGES - items.length);
    const tooBig = picked.find((file) => file.size > MAX_POST_IMAGE_BYTES);
    setErrors((current) => ({ ...current, images: tooBig ? `Ảnh "${tooBig.name}" lớn hơn 3 MB.` : "" }));
    const added = picked.filter((file) => file.size <= MAX_POST_IMAGE_BYTES).map((file) => ({ file, url: URL.createObjectURL(file) }));
    urls.current.push(...added.map((item) => item.url));
    setItems((current) => [...current, ...added]);
  };

  const removeAt = (index: number) =>
    setItems((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.delete("images");
    for (const item of items) data.append("images", item.file);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/cong-dong/bai-viet", { method: "POST", body: data });
      const result = (await response.json()) as { ok: boolean; message: string; errors?: Record<string, string> };
      if (result.ok) {
        router.push("/cong-dong?da-gui=1");
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message);
    } catch {
      setMessage("Không gửi được bài. Kiểm tra kết nối mạng rồi thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 border-3 border-ink bg-surface p-5 shadow-[6px_6px_0_var(--color-ink)] sm:p-7">
      {message && (
        <p className="border-2 border-danger px-3 py-2 text-sm text-danger" role="alert">
          {message}
        </p>
      )}
      <label className="block space-y-1.5 text-sm font-semibold">
        Chủ đề
        <select name="topic" defaultValue="chia-se" className={`${CONTROL} h-11`}>
          {Object.entries(COMMUNITY_TOPICS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {errors.topic && <span className="block text-xs text-danger">{errors.topic}</span>}
      </label>
      <label className="block space-y-1.5 text-sm font-semibold">
        Nội dung
        <textarea
          name="body"
          required
          minLength={POST_MIN}
          maxLength={POST_MAX}
          rows={7}
          placeholder="Khoe góc trưng bày, kể chuyện lắp ráp, hỏi kinh nghiệm sơn, góp ý cho cửa hàng..."
          className={`${CONTROL} py-2.5 font-normal`}
        />
        {errors.body && <span className="block text-xs text-danger">{errors.body}</span>}
      </label>
      <label className="block space-y-1.5 text-sm font-semibold">
        Gắn sản phẩm (không bắt buộc)
        <select name="product" defaultValue="" className={`${CONTROL} h-11 font-normal`}>
          <option value="">Không gắn</option>
          {products.map((product) => (
            <option key={product.slug} value={product.slug}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Ảnh (tối đa {MAX_POST_IMAGES}, mỗi ảnh 3 MB, WebP, PNG hoặc JPEG)
        </p>
        <div className="flex flex-wrap gap-3">
          {items.map(({ url }, index) => (
            <span key={url} className="relative size-24 border-3 border-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Ảnh ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Bỏ ảnh ${index + 1}`}
                className="absolute -top-2 -right-2 grid size-6 place-items-center border-2 border-ink bg-brand text-white"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          {items.length < MAX_POST_IMAGES && (
            <label className="grid size-24 cursor-pointer place-items-center border-3 border-dashed border-ink text-muted hover:text-brand">
              <ImagePlus className="size-7" aria-hidden />
              <span className="sr-only">Thêm ảnh</span>
              <input type="file" accept="image/webp,image/png,image/jpeg" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
            </label>
          )}
        </div>
        {errors.images && <p className="text-xs text-danger">{errors.images}</p>}
      </div>
      <p className="text-xs text-muted">Bài viết hiện công khai sau khi nhân viên ROBOTICA duyệt (thường trong ngày). Vui lòng không đăng thông tin cá nhân.</p>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center border-3 border-ink bg-brand px-6 font-condensed text-lg font-extrabold text-white uppercase shadow-[4px_4px_0_var(--color-ink)] disabled:opacity-60"
      >
        {pending ? "Đang gửi..." : "Gửi bài"}
      </button>
    </form>
  );
}
