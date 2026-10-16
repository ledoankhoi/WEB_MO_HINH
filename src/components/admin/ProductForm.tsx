"use client";

import { startTransition, useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import dynamic from "next/dynamic";
import type { RootState } from "@react-three/fiber";
import { deleteProductAction, saveProductAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, ROBOT_MODELS, isRobotModelKey, type RobotColors } from "@/lib/catalog";
import type { FormState, Product } from "@/lib/types";

// Three.js chỉ tải ở trình duyệt, và chỉ khi mở form sản phẩm.
const PosterCanvas = dynamic(() => import("@/components/three/PosterCanvas"), {
  ssr: false,
  loading: () => <p className="grid size-full place-items-center text-sm text-muted">Đang tải mô hình 3D...</p>,
});

const INITIAL: FormState = {};
const PREVIEW_SIZE = 280;
const card = "space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6";
const check = "flex items-center gap-2.5 text-sm";

const COLOR_FIELDS = [
  { key: "primary", name: "colorPrimary", label: "Màu chính" },
  { key: "secondary", name: "colorSecondary", label: "Màu phụ" },
  { key: "accent", name: "colorAccent", label: "Màu nhấn" },
] as const;

const DEFAULT_COLORS: RobotColors = { primary: "#d9dde3", secondary: "#2b2f36", accent: "#00a6c7" };

function DeleteProductButton({ id }: { id: string }) {
  const [pending, startDelete] = useTransition();
  const [error, setError] = useState("");

  return (
    <>
      <Button
        variant="danger"
        pending={pending}
        onClick={() => {
          if (!window.confirm("Xoá hẳn sản phẩm này? Thao tác không thể hoàn tác.")) return;
          startDelete(async () => {
            // Xoá thành công thì máy chủ chuyển về danh sách, không có kết quả trả về.
            const result = await deleteProductAction(id);
            setError(result?.message ?? "");
          });
        }}
      >
        Xoá sản phẩm
      </Button>
      {error && (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}

export type ProductFormOptions = {
  categories: { slug: string; name: string; parentId: string | null }[];
  brands: { id: string; name: string }[];
  series: { id: string; name: string }[];
};

export function ProductForm({ product, options }: { product?: Product; options: ProductFormOptions }) {
  const [state, formAction, pending] = useActionState(saveProductAction, INITIAL);
  const canvasState = useRef<RootState | null>(null);
  // Các ô quyết định hình dáng mô hình được theo dõi để khung xem trước đổi theo ngay.
  const [model, setModel] = useState(product?.model ?? "humanoid");
  const [colors, setColors] = useState(product?.colors ?? DEFAULT_COLORS);
  const [modelUrl, setModelUrl] = useState(product?.modelUrl ?? "");
  const errors = state.errors ?? {};

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("capture")) {
      const { capturePoster } = await import("@/components/three/PosterCanvas");
      const blob = await capturePoster(canvasState.current);
      if (blob) form.set("poster", blob, "poster.webp");
    }
    startTransition(() => formAction(form));
  }

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1fr_21rem]">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className={card}>
        {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
        <Field label="Tên sản phẩm" name="name" required maxLength={120} defaultValue={product?.name} error={errors.name} />
        <Field
          label="Đường dẫn"
          name="slug"
          maxLength={80}
          defaultValue={product?.slug}
          error={errors.slug}
          hint="Chữ thường không dấu, số và gạch nối. Để trống thì tự tạo từ tên."
        />
        <Field label="Mô tả ngắn" name="tagline" maxLength={160} defaultValue={product?.tagline} error={errors.tagline} />
        <TextAreaField label="Mô tả" name="description" rows={6} maxLength={5000} defaultValue={product?.description} error={errors.description} />
        <SelectField label="Danh mục" name="category" required defaultValue={product?.category ?? ""} error={errors.category}>
          <option value="">Chọn danh mục</option>
          {options.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.parentId ? `└ ${category.name}` : category.name}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Thương hiệu" name="brandId" defaultValue={state.values?.brandId ?? product?.brandId ?? ""} error={errors.brandId}>
            <option value="">Không chọn</option>
            {options.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Series" name="seriesId" defaultValue={state.values?.seriesId ?? product?.seriesId ?? ""} error={errors.seriesId}>
            <option value="">Không chọn</option>
            {options.series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Loại sản phẩm" name="productType" required defaultValue={state.values?.productType ?? product?.productType ?? "figure"} error={errors.productType}>
            {PRODUCT_TYPES.map((value) => (
              <option key={value} value={value}>
                {PRODUCT_TYPE_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tỷ lệ" name="scale" maxLength={20} placeholder="1/144" defaultValue={state.values?.scale ?? product?.scale} error={errors.scale} />
            <Field label="Cấp độ" name="grade" maxLength={20} placeholder="HG, RG, MG" defaultValue={state.values?.grade ?? product?.grade} error={errors.grade} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Giá bán (₫)" name="price" required inputMode="numeric" defaultValue={product?.price} error={errors.price} />
          <Field
            label="Giá gốc (₫)"
            name="compareAtPrice"
            inputMode="numeric"
            defaultValue={product?.compareAtPrice ?? ""}
            error={errors.compareAtPrice}
            hint="Để trống nếu không giảm giá."
          />
          {product ? (
            <Field label="SKU" name="sku" defaultValue={product.variants.find((v) => v.isDefault)?.sku} readOnly hint={`Có thể bán: ${product.stock}. Tồn kho đổi qua phiếu kho.`} />
          ) : (
            <Field label="SKU" name="sku" required maxLength={40} error={errors.sku} hint="Mã quản lý kho, không đổi được sau khi tạo." />
          )}
        </div>

        <TextAreaField
          label="Thông số"
          name="specs"
          rows={5}
          defaultValue={product?.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n")}
          error={errors.specs}
          hint="Mỗi dòng một thông số, dạng “Nhãn: giá trị”."
        />
        <TextAreaField label="Nội dung hộp" name="boxContents" rows={3} maxLength={2000} defaultValue={state.values?.boxContents ?? product?.boxContents} error={errors.boxContents} hint="Phụ kiện, sách hướng dẫn, đế trưng bày... đi kèm." />

        <fieldset className="space-y-3 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">SEO</legend>
          <Field label="Tiêu đề trang" name="metaTitle" maxLength={70} defaultValue={state.values?.metaTitle ?? product?.metaTitle} error={errors.metaTitle} hint="Tối đa 70 ký tự. Để trống thì dùng tên sản phẩm." />
          <TextAreaField label="Mô tả meta" name="metaDescription" rows={2} maxLength={160} defaultValue={state.values?.metaDescription ?? product?.metaDescription} error={errors.metaDescription} hint="Tối đa 160 ký tự, hiện trong kết quả tìm kiếm. Để trống thì dùng mô tả ngắn." />
        </fieldset>

        <SelectField label="Trạng thái" name="status" required defaultValue={product?.status ?? "draft"} error={errors.status}>
          <option value="draft">Nháp (chưa hiện trên cửa hàng)</option>
          <option value="published">Xuất bản</option>
          <option value="archived">Lưu trữ (ẩn)</option>
        </SelectField>
        <label className={check}>
          <input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured} className="size-4 accent-brand" />
          Sản phẩm nổi bật
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" pending={pending}>
            {product ? "Lưu thay đổi" : "Tạo sản phẩm"}
          </Button>
          {product && <DeleteProductButton id={product.id} />}
        </div>
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold">Mô hình 3D</h2>
        <div className="mx-auto overflow-hidden rounded-lg bg-raised" style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}>
          <PosterCanvas source={{ model, colors, modelUrl: modelUrl || null }} stateRef={canvasState} displaySize={PREVIEW_SIZE} />
        </div>

        <SelectField
          label="Kiểu dáng"
          name="model"
          value={model}
          onChange={(event) => isRobotModelKey(event.target.value) && setModel(event.target.value)}
          error={errors.model}
          hint="Dùng khi không có file .glb hoặc file bị lỗi."
        >
          {Object.entries(ROBOT_MODELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <Field
          label="File mô hình (.glb)"
          name="modelUrl"
          defaultValue={modelUrl}
          // Chỉ tải mô hình khi gõ xong, không tải theo từng ký tự.
          onBlur={(event) => setModelUrl(event.target.value.trim())}
          error={errors.modelUrl}
          hint="Dạng /models/ten-file.glb hoặc đường dẫn đầy đủ trên kho media."
        />

        <div className="grid grid-cols-3 gap-3">
          {COLOR_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              name={field.name}
              type="color"
              value={colors[field.key]}
              onChange={(event) => setColors({ ...colors, [field.key]: event.target.value })}
            />
          ))}
        </div>
        {errors.colors && (
          <p role="alert" className="text-xs text-danger">
            {errors.colors}
          </p>
        )}

        <label className={check}>
          <input type="checkbox" name="capture" defaultChecked={!product?.image} className="size-4 accent-brand" />
          Chụp khung xem trước làm ảnh đại diện
        </label>
        <p className={`text-xs ${errors.poster ? "text-danger" : "text-muted"}`} role={errors.poster ? "alert" : undefined}>
          {errors.poster ?? "Ảnh mới sẽ thay ảnh đại diện hiện tại. Chờ mô hình hiện đủ rồi mới bấm lưu."}
        </p>
      </div>
    </form>
  );
}
