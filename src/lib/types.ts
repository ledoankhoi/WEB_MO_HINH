import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductSpec,
  ShippingStatus,
  RobotColors,
  RobotModelKey,
} from "./catalog";
import type { Role } from "./permissions";
import type { FlashOffer } from "./flash-sale";
import type { OrderPreorderStatus, PreorderOffer } from "./preorder";

// Phiên bản bán được (docs/chuan/03 mục 3): có SKU, giá, tồn và màu mô hình 3D riêng.
export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  condition: "new" | "used";
  conditionNote: string;
  price: number;
  compareAtPrice: number | null;
  // Số có thể bán = on_hand − reserved.
  stock: number;
  colors: RobotColors;
  isDefault: boolean;
  isActive: boolean;
  // Đã có sổ kho hoặc đơn hàng: SKU không đổi được nữa (YC-SP-03).
  locked: boolean;
  // Đợt đặt trước chưa kết thúc (src/lib/preorder.ts): phiên bản chỉ bán dạng đặt trước.
  preorder: PreorderOffer | null;
  // Flash sale đang chạy hoặc sắp chạy (src/lib/flash-sale.ts); trình duyệt tự so giờ để hiện giá sale.
  flash: FlashOffer | null;
};

export type ProductStatus = "draft" | "published" | "archived";

// Giá, tồn, màu ở cấp sản phẩm là của biến thể mặc định (view product_list).
export type Product = {
  id: string;
  variantId: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  brandId: string | null;
  seriesId: string | null;
  productType: "figure" | "model_kit" | "combiner" | "accessory";
  scale: string;
  grade: string;
  boxContents: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  model: RobotModelKey;
  // Đường dẫn file .glb trong public/models (nếu có) sẽ thay cho mô hình dựng bằng hình học.
  modelUrl: string | null;
  colors: RobotColors;
  specs: ProductSpec[];
  image: string | null;
  // Ảnh trong thư viện (product_media loại image), theo thứ tự hiển thị; ảnh thật của sản phẩm đứng trước khung 3D.
  images: { url: string; alt: string }[];
  isFeatured: boolean;
  // SEO (YC-SP-09): trống thì dùng tên và mô tả ngắn.
  metaTitle: string;
  metaDescription: string;
  // status = published.
  isActive: boolean;
  status: ProductStatus;
  variants: ProductVariant[];
  createdAt: number;
  updatedAt: number;
};

// Phần dữ liệu đủ để vẽ thẻ sản phẩm. `modelUrl` để biết mô hình 3D có clip biến hình hay hợp thể (nhãn trên thẻ).
export type ProductSummary = Pick<
  Product,
  "id" | "variantId" | "slug" | "name" | "tagline" | "category" | "price" | "compareAtPrice" | "stock" | "image" | "isFeatured" | "modelUrl"
> & {
  // Đợt đặt trước của biến thể mặc định (nhãn "Đặt trước" trên thẻ).
  preorder: PreorderOffer | null;
  // Flash sale đang chạy hoặc sắp chạy của biến thể mặc định.
  flash: FlashOffer | null;
};

// Dữ liệu mới nhất của một dòng trong giỏ hàng (giá, tồn kho) do máy chủ trả về. `id` là mã biến thể.
export type CartProduct = Pick<Product, "id" | "slug" | "name" | "price" | "compareAtPrice" | "stock" | "image"> & {
  productId: string;
  available: boolean;
  // Slug danh mục: quyết định tuỳ chọn Xưởng nào áp dụng (src/lib/workshop.ts).
  category: string;
  // Đang trong đợt đặt trước: dòng giỏ là hàng đặt trước, giới hạn theo suất còn lại thay vì tồn kho.
  preorder: PreorderOffer | null;
  // `price` là giá bán lúc máy chủ trả lời (giá flash sale nếu đang chạy), `basePrice` là giá thường; `flash` chỉ có khi đang chạy.
  basePrice: number;
  flash: FlashOffer | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  role: Role;
  marketingConsent: boolean;
  // Đã xác thực email bằng mã OTP (hoặc đăng nhập Google), nghiep-vu-ban-hang mục 15.
  emailVerified: boolean;
};

export type OrderItem = {
  // id dòng trong order_items (dùng khi khách chọn dòng để trả hàng).
  lineId: number;
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  slug: string;
  image: string | null;
  // Đã gồm giá tuỳ chọn Xưởng (optionsPrice).
  unitPrice: number;
  quantity: number;
  // Tuỳ biến ở Xưởng: mô tả để in phiếu, phần giá của tuỳ chọn trong unitPrice; rỗng, 0 nếu nguyên hộp.
  options: string;
  optionsPrice: number;
  // Chuỗi cấu hình Xưởng gốc (cfg, src/lib/workshop.ts) để "Mua lại" đúng tuỳ biến cũ; rỗng nếu nguyên hộp.
  optionsConfig: string;
  // Mã chương trình flash sale nếu dòng được bán bằng giá sale.
  flashSaleId: string | null;
  // Dòng đặt trước: ngày dự kiến về lúc đặt và đã được phân bổ hàng chưa; null nếu là hàng có sẵn.
  preorder: { offerId: string; expectedAt: number; allocated: boolean } | null;
};

export type Order = {
  id: string;
  code: string;
  token: string;
  userId: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  trackingCarrier: string | null;
  trackingCode: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shippingFee: number;
  total: number;
  // Đặt trước (src/lib/preorder.ts): tiền cọc phải trả trước (0: không cọc), trạng thái hàng đặt trước của đơn.
  depositAmount: number;
  preorderStatus: OrderPreorderStatus;
  // Phần giảm của combo trong `discount` (phần còn lại là mã giảm giá).
  bundleDiscount: number;
  createdAt: number;
  updatedAt: number;
  items: OrderItem[];
  events: OrderEvent[];
  payments: OrderPayment[];
  // Yêu cầu hoá đơn VAT (nghiep-vu-ban-hang mục 17), null nếu khách không yêu cầu.
  invoice: {
    companyName: string;
    taxCode: string;
    companyAddress: string;
    invoiceEmail: string;
    status: "requested" | "issued";
    invoiceNo: string | null;
    issuedAt: number | null;
  } | null;
};

// Một lần đổi trạng thái (bảng order_events).
export type OrderEvent = {
  field: "status" | "payment_status" | "shipping_status" | "preorder_status";
  from: string;
  to: string;
  note: string;
  actorName: string | null;
  createdAt: number;
};

// deposit: tiền cọc đặt trước; charge: tiền thu (phần còn lại nếu đã cọc); refund: tiền hoàn.
export type OrderPayment = { kind: "deposit" | "charge" | "refund"; amount: number; reference: string; createdAt: number };

export type OrderSummary = Omit<Order, "items" | "events" | "payments" | "invoice"> & { itemCount: number };

// Kết quả trả về cho form dùng useActionState.
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

// Số đơn cần xử lý và đơn mới nhất, cho thanh bên quản trị hỏi định kỳ (src/app/admin/api/don-hang).
export type OrderPulse = {
  needsAction: number;
  latest: { id: string; code: string; customerName: string; total: number; createdAt: number } | null;
};
