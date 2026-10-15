// Mỗi migration chạy đúng một lần, trong một giao dịch (PostgreSQL). Chỉ THÊM migration mới vào cuối mảng,
// không sửa migration đã phát hành.
export type Migration = { id: string; statements: string[] };

export const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    statements: [
      `CREATE TABLE products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        price BIGINT NOT NULL,
        compare_at_price BIGINT,
        stock INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        model_url TEXT,
        color_primary TEXT NOT NULL,
        color_secondary TEXT NOT NULL,
        color_accent TEXT NOT NULL,
        specs TEXT NOT NULL DEFAULT '[]',
        image TEXT,
        search_text TEXT NOT NULL DEFAULT '',
        is_featured INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sold INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT price_non_negative CHECK (price >= 0),
        CONSTRAINT stock_non_negative CHECK (stock >= 0)
      )`,
      `CREATE INDEX idx_products_category ON products (category)`,
      `CREATE INDEX idx_products_active_created ON products (is_active, created_at)`,

      // Ảnh đại diện do trang quản trị chụp từ mô hình 3D, lưu thẳng trong CSDL để chạy được trên mọi nền tảng.
      `CREATE TABLE product_images (
        product_id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        updated_at BIGINT NOT NULL
      )`,

      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        created_at BIGINT NOT NULL,
        CONSTRAINT role_valid CHECK (role IN ('customer', 'admin'))
      )`,

      // id là SHA-256 của token trong cookie: lộ CSDL cũng không dùng lại được phiên đăng nhập.
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      `CREATE INDEX idx_sessions_user ON sessions (user_id)`,

      `CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT NOT NULL DEFAULT '',
        shipping_address TEXT NOT NULL,
        shipping_city TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        subtotal BIGINT NOT NULL,
        shipping_fee BIGINT NOT NULL,
        total BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT status_valid CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
        CONSTRAINT payment_method_valid CHECK (payment_method IN ('cod', 'bank')),
        CONSTRAINT payment_status_valid CHECK (payment_status IN ('unpaid', 'paid', 'refunded'))
      )`,
      `CREATE INDEX idx_orders_user ON orders (user_id, created_at)`,
      `CREATE INDEX idx_orders_status ON orders (status, created_at)`,
      `CREATE INDEX idx_orders_created ON orders (created_at)`,

      // Lưu lại tên và giá tại thời điểm đặt để đơn cũ không đổi khi sản phẩm bị sửa hoặc xoá.
      `CREATE TABLE order_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_slug TEXT NOT NULL,
        product_image TEXT,
        unit_price BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        CONSTRAINT quantity_positive CHECK (quantity > 0)
      )`,
      `CREATE INDEX idx_order_items_order ON order_items (order_id)`,

      `CREATE TABLE rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at BIGINT NOT NULL
      )`,
    ],
  },
  {
    // Supabase tự mở mọi bảng trong schema public qua API REST. Bật RLS mà không khai báo policy nào
    // thì các khoá API (anon, authenticated) không đọc ghi được gì. Ứng dụng nối bằng vai trò chủ sở hữu
    // bảng nên không bị ảnh hưởng. Bảng mới thêm sau này cũng phải bật RLS.
    id: "002_enable_rls",
    statements: ["meta", "products", "product_images", "users", "sessions", "orders", "order_items", "rate_limits"].map(
      (table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    ),
  },
];
