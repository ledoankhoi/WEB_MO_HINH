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
  isFeatured: boolean;
  // status = published.
  isActive: boolean;
  status: ProductStatus;
  variants: ProductVariant[];
  createdAt: number;
  updatedAt: number;
};

// Phần dữ liệu đủ để vẽ thẻ sản phẩm.
export type ProductSummary = Pick<
  Product,
  "id" | "variantId" | "slug" | "name" | "tagline" | "category" | "price" | "compareAtPrice" | "stock" | "image" | "isFeatured"
>;

// Dữ liệu mới nhất của một dòng trong giỏ hàng (giá, tồn kho) do máy chủ trả về. `id` là mã biến thể.
export type CartProduct = Pick<Product, "id" | "slug" | "name" | "price" | "compareAtPrice" | "stock" | "image"> & {
  productId: string;
  available: boolean;
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
};

export type OrderItem = {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  slug: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
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
  createdAt: number;
  updatedAt: number;
  items: OrderItem[];
  events: OrderEvent[];
  payments: OrderPayment[];
};

// Một lần đổi trạng thái (bảng order_events).
export type OrderEvent = {
  field: "status" | "payment_status" | "shipping_status";
  from: string;
  to: string;
  note: string;
  actorName: string | null;
  createdAt: number;
};

export type OrderPayment = { kind: "charge" | "refund"; amount: number; reference: string; createdAt: number };

export type OrderSummary = Omit<Order, "items" | "events" | "payments"> & { itemCount: number };

// Kết quả trả về cho form dùng useActionState.
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};
