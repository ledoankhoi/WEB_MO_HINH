import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductSpec,
  RobotColors,
  RobotModelKey,
} from "./catalog";

export type Product = {
  id: string;
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
  isActive: boolean;
  sold: number;
  createdAt: number;
  updatedAt: number;
};

// Phần dữ liệu đủ để vẽ thẻ sản phẩm.
export type ProductSummary = Pick<
  Product,
  "id" | "slug" | "name" | "tagline" | "category" | "price" | "compareAtPrice" | "stock" | "image" | "isFeatured"
>;

// Dữ liệu mới nhất của một dòng trong giỏ hàng (giá, tồn kho) do máy chủ trả về.
export type CartProduct = Pick<Product, "id" | "slug" | "name" | "price" | "compareAtPrice" | "stock" | "image"> & {
  available: boolean;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  role: "customer" | "admin";
};

export type OrderItem = {
  productId: string;
  name: string;
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
