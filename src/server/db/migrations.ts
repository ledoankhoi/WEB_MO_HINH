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
  {
    // Vai trò nhân viên theo mục 3 của docs/chuan/10 (danh sách khớp ROLES trong src/lib/permissions.ts),
    // khoá tài khoản, đồng ý nhận tin và nhật ký thao tác (chỉ thêm, QT-19).
    id: "003_roles_audit",
    statements: [
      "ALTER TABLE users DROP CONSTRAINT role_valid",
      `ALTER TABLE users ADD CONSTRAINT role_valid CHECK (role IN (
        'customer', 'admin', 'product_manager', 'warehouse_manager', 'warehouse',
        'order_staff', 'support', 'marketing', 'accountant', 'viewer'
      ))`,
      "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true",
      "ALTER TABLE users ADD COLUMN marketing_consent BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE users ADD COLUMN marketing_consent_at BIGINT",
      `CREATE TABLE audit_logs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_id TEXT REFERENCES users (id),
        actor_role TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL
      )`,
      "CREATE INDEX idx_audit_entity ON audit_logs (entity, entity_id)",
      "CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at)",
      "CREATE INDEX idx_audit_created ON audit_logs (created_at)",
      "ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Danh mục (tối đa 2 cấp, kiểm tra ở src/server/repo/taxonomy.ts), thương hiệu, series theo mục 3 của
    // docs/chuan/03. Bảng `products` cũ vẫn nối danh mục qua cột `category` (slug) cho tới T04.
    id: "004_taxonomy",
    statements: [
      `CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        parent_id TEXT REFERENCES categories (id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT parent_not_self CHECK (parent_id <> id)
      )`,
      "CREATE INDEX idx_categories_parent ON categories (parent_id)",
      "CREATE TABLE brands (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL)",
      "CREATE TABLE series (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL)",
      ...["categories", "brands", "series"].map((table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
    ],
  },
  {
    // Biến thể và lõi kho theo docs/chuan/03 (mục 3, 4, 6 và 12), xoá và tạo lại theo Q1. Đơn hàng giữ tạm dãy
    // trạng thái cũ, các cột khách và `token` (T05 đổi sang ba trạng thái). Kho `KHO-01` và hai vị trí `A-01`,
    // `CACH-LY` có id cố định (md5 của mã). `stock_documents.created_by` NULL là phiếu do hệ thống tạo (`PN-SEED`).
    id: "005_variants_inventory",
    statements: [
      "DROP TABLE order_items, orders, products",
      "DELETE FROM product_images",
      `CREATE TABLE products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category_id TEXT NOT NULL REFERENCES categories (id),
        brand_id TEXT REFERENCES brands (id),
        series_id TEXT REFERENCES series (id),
        product_type TEXT NOT NULL DEFAULT 'figure',
        scale TEXT,
        grade TEXT,
        specs TEXT NOT NULL DEFAULT '[]',
        box_contents TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        model_url TEXT,
        image TEXT,
        search_text TEXT NOT NULL DEFAULT '',
        meta_title TEXT NOT NULL DEFAULT '',
        meta_description TEXT NOT NULL DEFAULT '',
        is_featured BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'draft',
        published_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT product_type_valid CHECK (product_type IN ('figure', 'model_kit', 'combiner', 'accessory')),
        CONSTRAINT status_valid CHECK (status IN ('draft', 'published', 'archived'))
      )`,
      "CREATE INDEX idx_products_status_created ON products (status, created_at)",
      "CREATE INDEX idx_products_category ON products (category_id)",
      "CREATE INDEX idx_products_brand ON products (brand_id)",
      "CREATE INDEX idx_products_series ON products (series_id)",
      `CREATE TABLE product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products (id),
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        condition TEXT NOT NULL DEFAULT 'new',
        condition_note TEXT NOT NULL DEFAULT '',
        price BIGINT NOT NULL,
        compare_at_price BIGINT,
        color_primary TEXT NOT NULL,
        color_secondary TEXT NOT NULL,
        color_accent TEXT NOT NULL,
        image TEXT,
        weight_grams INTEGER,
        length_mm INTEGER,
        width_mm INTEGER,
        height_mm INTEGER,
        is_default BOOLEAN NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT condition_valid CHECK (condition IN ('new', 'used')),
        CONSTRAINT price_non_negative CHECK (price >= 0)
      )`,
      "CREATE INDEX idx_variants_product ON product_variants (product_id)",
      "CREATE UNIQUE INDEX idx_variants_one_default ON product_variants (product_id) WHERE is_default",
      `CREATE TABLE product_media (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products (id),
        variant_id TEXT REFERENCES product_variants (id),
        kind TEXT NOT NULL,
        url TEXT NOT NULL,
        alt TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        CONSTRAINT kind_valid CHECK (kind IN ('image', 'model'))
      )`,
      "CREATE INDEX idx_media_product ON product_media (product_id, sort_order)",
      `CREATE TABLE suppliers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        contact_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE warehouses (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE locations (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT NOT NULL REFERENCES warehouses (id),
        code TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        UNIQUE (warehouse_id, code),
        CONSTRAINT type_valid CHECK (type IN ('storage', 'quarantine'))
      )`,
      `INSERT INTO warehouses (id, code, name, address, created_at)
       VALUES (substr(md5('KHO-01'), 1, 20), 'KHO-01', 'Kho chính', '', (extract(epoch FROM now()) * 1000)::bigint)`,
      `INSERT INTO locations (id, warehouse_id, code, name, type, created_at)
       SELECT substr(md5(v.code), 1, 20), w.id, v.code, v.name, v.type, w.created_at
       FROM warehouses w, (VALUES ('A-01', 'Kệ A-01', 'storage'), ('CACH-LY', 'Khu cách ly', 'quarantine')) AS v (code, name, type)
       WHERE w.code = 'KHO-01'`,
      `CREATE TABLE stock_levels (
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        location_id TEXT NOT NULL REFERENCES locations (id),
        on_hand INTEGER NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (variant_id, location_id),
        CONSTRAINT on_hand_non_negative CHECK (on_hand >= 0)
      )`,
      "CREATE INDEX idx_stock_levels_location ON stock_levels (location_id)",
      `CREATE TABLE inventory (
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses (id),
        on_hand INTEGER NOT NULL DEFAULT 0,
        quarantined INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER NOT NULL DEFAULT 3,
        avg_cost BIGINT NOT NULL DEFAULT 0,
        last_received_at BIGINT,
        PRIMARY KEY (variant_id, warehouse_id),
        CONSTRAINT on_hand_non_negative CHECK (on_hand >= 0),
        CONSTRAINT quarantined_non_negative CHECK (quarantined >= 0),
        CONSTRAINT reserved_valid CHECK (reserved >= 0 AND reserved <= on_hand)
      )`,
      `CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        user_id TEXT REFERENCES users (id),
        idempotency_key TEXT UNIQUE,
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
        discount BIGINT NOT NULL DEFAULT 0,
        coupon_code TEXT,
        shipping_fee BIGINT NOT NULL,
        total BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT status_valid CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
        CONSTRAINT payment_method_valid CHECK (payment_method IN ('cod', 'bank')),
        CONSTRAINT payment_status_valid CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
        CONSTRAINT total_valid CHECK (total = subtotal - discount + shipping_fee)
      )`,
      "CREATE INDEX idx_orders_user ON orders (user_id, created_at)",
      "CREATE INDEX idx_orders_status ON orders (status, created_at)",
      "CREATE INDEX idx_orders_created ON orders (created_at)",
      `CREATE TABLE order_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders (id),
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        sku TEXT NOT NULL,
        product_slug TEXT NOT NULL,
        image TEXT,
        unit_price BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        CONSTRAINT quantity_positive CHECK (quantity > 0)
      )`,
      "CREATE INDEX idx_order_items_order ON order_items (order_id)",
      "CREATE INDEX idx_order_items_variant ON order_items (variant_id)",
      `CREATE TABLE stock_documents (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        warehouse_id TEXT NOT NULL REFERENCES warehouses (id),
        supplier_id TEXT REFERENCES suppliers (id),
        order_id TEXT REFERENCES orders (id),
        reason_code TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        expected_at BIGINT,
        created_by TEXT REFERENCES users (id),
        submitted_at BIGINT,
        posted_by TEXT REFERENCES users (id),
        posted_at BIGINT,
        cancelled_by TEXT REFERENCES users (id),
        cancelled_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT type_valid CHECK (type IN ('receipt', 'issue', 'adjustment', 'transfer', 'stocktake', 'return')),
        CONSTRAINT status_valid CHECK (status IN ('draft', 'submitted', 'posted', 'cancelled'))
      )`,
      "CREATE INDEX idx_stock_documents_status ON stock_documents (status, type, created_at)",
      `CREATE TABLE stock_document_lines (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES stock_documents (id),
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        location_id TEXT NOT NULL REFERENCES locations (id),
        to_location_id TEXT REFERENCES locations (id),
        qty_expected INTEGER,
        qty INTEGER,
        qty_quarantined INTEGER,
        system_qty INTEGER,
        unit_cost BIGINT,
        note TEXT NOT NULL DEFAULT '',
        UNIQUE (document_id, variant_id, location_id)
      )`,
      // Sổ kho chỉ thêm. Khoá duy nhất NULLS NOT DISTINCT chặn ghi trùng một biến động ở mức CSDL (Q16).
      `CREATE TABLE stock_movements (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses (id),
        location_id TEXT REFERENCES locations (id),
        type TEXT NOT NULL,
        qty_delta INTEGER NOT NULL,
        reserved_delta INTEGER NOT NULL DEFAULT 0,
        unit_cost BIGINT,
        document_id TEXT REFERENCES stock_documents (id),
        order_id TEXT REFERENCES orders (id),
        reason TEXT NOT NULL DEFAULT '',
        actor_id TEXT REFERENCES users (id),
        created_at BIGINT NOT NULL,
        CONSTRAINT type_valid CHECK (type IN (
          'receive', 'reserve', 'release', 'ship', 'return_in', 'issue', 'transfer_out', 'transfer_in', 'adjust_in', 'adjust_out'
        )),
        CONSTRAINT delta_not_zero CHECK (qty_delta <> 0 OR reserved_delta <> 0),
        CONSTRAINT movement_unique UNIQUE NULLS NOT DISTINCT (document_id, order_id, variant_id, location_id, type)
      )`,
      "CREATE INDEX idx_movements_variant ON stock_movements (variant_id, created_at)",
      "CREATE INDEX idx_movements_location ON stock_movements (location_id, created_at)",
      "CREATE INDEX idx_movements_document ON stock_movements (document_id)",
      "CREATE INDEX idx_movements_order ON stock_movements (order_id)",
      ...[
        "products", "product_variants", "product_media", "suppliers", "warehouses", "locations", "stock_levels",
        "inventory", "orders", "order_items", "stock_documents", "stock_document_lines", "stock_movements",
      ].map((table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
    ],
  },
  {
    // Sản phẩm ghép với biến thể mặc định và số có thể bán, giữ tên cột như bảng `products` cũ để trang
    // danh sách và thẻ sản phẩm đọc thẳng. security_invoker: view tuân theo RLS của bảng gốc.
    id: "006_product_list",
    statements: [
      `CREATE VIEW product_list WITH (security_invoker = true) AS
       SELECT p.*, c.slug AS category, v.id AS variant_id, v.sku, v.price, v.compare_at_price,
              v.color_primary, v.color_secondary, v.color_accent, p.status = 'published' AS is_active,
              COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = v.id), 0)::int AS stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN product_variants v ON v.product_id = p.id AND v.is_default`,
    ],
  },
  {
    // Ba trạng thái độc lập và luật L1–L14 (docs/chuan/04). Đơn cũ: "shipping" thành đang xử lý + đang giao,
    // "completed" thành hoàn tất + đã giao.
    id: "007_order_lifecycle",
    statements: [
      "ALTER TABLE orders DROP CONSTRAINT status_valid",
      "ALTER TABLE orders ADD COLUMN shipping_status TEXT NOT NULL DEFAULT 'not_created'",
      "ALTER TABLE orders ADD COLUMN tracking_carrier TEXT",
      "ALTER TABLE orders ADD COLUMN tracking_code TEXT",
      `UPDATE orders SET
         shipping_status = CASE status WHEN 'shipping' THEN 'in_transit' WHEN 'completed' THEN 'delivered' ELSE 'not_created' END,
         status = CASE status WHEN 'shipping' THEN 'processing' ELSE status END`,
      "ALTER TABLE orders ADD CONSTRAINT status_valid CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled'))",
      `ALTER TABLE orders ADD CONSTRAINT shipping_status_valid
         CHECK (shipping_status IN ('not_created', 'ready', 'in_transit', 'delivered', 'failed', 'returned'))`,
      "CREATE INDEX idx_orders_shipping ON orders (shipping_status, created_at)",
      `CREATE TABLE order_events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders (id),
        field TEXT NOT NULL,
        from_value TEXT NOT NULL,
        to_value TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        actor_id TEXT REFERENCES users (id),
        created_at BIGINT NOT NULL,
        CONSTRAINT field_valid CHECK (field IN ('status', 'payment_status', 'shipping_status'))
      )`,
      "CREATE INDEX idx_order_events_order ON order_events (order_id, id)",
      `CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders (id),
        kind TEXT NOT NULL,
        method TEXT NOT NULL,
        amount BIGINT NOT NULL,
        reference TEXT NOT NULL DEFAULT '',
        confirmed_by TEXT REFERENCES users (id),
        created_at BIGINT NOT NULL,
        CONSTRAINT kind_valid CHECK (kind IN ('charge', 'refund')),
        CONSTRAINT method_valid CHECK (method IN ('cod', 'bank')),
        CONSTRAINT amount_positive CHECK (amount > 0),
        UNIQUE (order_id, kind)
      )`,
      "ALTER TABLE order_events ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE payments ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Kiểm kê (YC-KHO-07): các vị trí được đếm và thời điểm chụp số sổ sách. Có biến động sau lúc chụp thì
    // không ghi sổ (WH-06). Dòng điều chỉnh mang số có dấu trong `qty`.
    id: "008_stocktake",
    statements: [
      "ALTER TABLE stock_documents ADD COLUMN snapshot_at BIGINT",
      "ALTER TABLE stock_documents ADD COLUMN count_locations TEXT NOT NULL DEFAULT '[]'",
    ],
  },
  {
    // Banner trang chủ (YC-CMS-01, docs/chuan/03 mục 12.3).
    id: "009_banners",
    statements: [
      `CREATE TABLE banners (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL,
        image_mobile_url TEXT,
        link_url TEXT NOT NULL DEFAULT '',
        placement TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        starts_at BIGINT,
        ends_at BIGINT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT placement_valid CHECK (placement IN ('home_hero', 'home_strip')),
        CONSTRAINT status_valid CHECK (status IN ('draft', 'published')),
        CONSTRAINT window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
      )`,
      "CREATE INDEX idx_banners_placement ON banners (placement, status, sort_order)",
      "ALTER TABLE banners ENABLE ROW LEVEL SECURITY",
    ],
  },
];
