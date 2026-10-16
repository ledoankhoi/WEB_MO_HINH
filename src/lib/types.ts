import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductSpec,
  RobotColors,
  RobotModelKey,
} from "./catalog";
import type { Role } from "./permissions";

// Phiên bản bán được (docs/chuan/03 mục 3): có SKU, giá, tồn và màu mô hình 3D riêng.
export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  condition: "new" | "used";
  price: number;
  compareAtPrice: number | null;
  // Số có thể bán = on_hand − reserved.
  stock: number;
  colors: RobotColors;
  isDefault: boolean;
  isActive: boolean;
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
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  createdAt: number;
  updatedAt: number;
  items: OrderItem[];
};

export type OrderSummary = Omit<Order, "items"> & { itemCount: number };

// Kết quả trả về cho form dùng useActionState.
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};
