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
  {
    // Menu và cài đặt hiển thị (YC-CMS-03, 05, 06). Nạp sẵn menu đang có trong mã để cửa hàng không đổi.
    // Lớp CSDL đổi mọi dấu ? thành tham số, nên URL viết | rồi thay bằng chr(63).
    id: "010_nav_settings",
    statements: [
      `CREATE TABLE nav_items (
        id TEXT PRIMARY KEY,
        menu TEXT NOT NULL,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT menu_valid CHECK (menu IN ('header', 'footer'))
      )`,
      "CREATE INDEX idx_nav_items_menu ON nav_items (menu, sort_order)",
      `INSERT INTO nav_items (id, menu, label, url, sort_order)
       SELECT substr(md5(v.menu || v.url), 1, 20), v.menu, v.label, replace(v.url, '|', chr(63)), v.sort_order FROM (VALUES
         ('header', 'Trang chủ', '/', 0),
         ('header', 'Cửa hàng', '/san-pham', 1),
         ('header', 'Transformers', '/san-pham|loai=transformers', 2),
         ('header', 'Super Sentai', '/san-pham|loai=super-sentai', 3),
         ('header', 'Model Kits', '/san-pham|loai=model-kits', 4),
         ('header', 'Hàng mới về', '/san-pham|sap-xep=moi-nhat', 5),
         ('footer', 'Tra cứu đơn hàng', '/tra-cuu-don-hang', 0),
         ('footer', 'Giỏ hàng', '/gio-hang', 1),
         ('footer', 'Tài khoản', '/tai-khoan', 2)
       ) AS v (menu, label, url, sort_order)`,
      `CREATE TABLE site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT REFERENCES users (id),
        updated_at BIGINT NOT NULL
      )`,
      "ALTER TABLE nav_items ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Trang thông tin (YC-CMS-04). Nạp sẵn các trang cần có ở trạng thái nháp, nội dung ghi rõ là mẫu:
    // chủ dự án thay bằng nội dung thật rồi mới xuất bản.
    id: "011_pages",
    statements: [
      `CREATE TABLE pages (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        meta_description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        published_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT status_valid CHECK (status IN ('draft', 'published'))
      )`,
      `CREATE TABLE page_revisions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages (id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by TEXT REFERENCES users (id),
        created_at BIGINT NOT NULL
      )`,
      "CREATE INDEX idx_page_revisions_page ON page_revisions (page_id, id)",
      `INSERT INTO pages (id, slug, title, body, created_at, updated_at)
       SELECT substr(md5(v.slug), 1, 20), v.slug, v.title,
              'NỘI DUNG MẪU, chưa phải chính sách thật của cửa hàng. Thay bằng nội dung thật trước khi xuất bản.' || chr(10) || chr(10) || v.body,
              (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
       FROM (VALUES
         ('gioi-thieu', 'Giới thiệu', 'ROBOTICA là cửa hàng mô hình robot sưu tầm, cho khách xem và xoay mô hình 3D trước khi mua.'),
         ('lien-he', 'Liên hệ', 'Điện thoại, email, địa chỉ và giờ làm việc của cửa hàng.'),
         ('cau-hoi-thuong-gap', 'Câu hỏi thường gặp', 'Cách đặt hàng, thanh toán, thời gian giao hàng, tình trạng hộp và phụ kiện.'),
         ('van-chuyen', 'Chính sách vận chuyển', 'Phí vận chuyển, khu vực giao hàng và thời gian dự kiến.'),
         ('doi-tra', 'Chính sách đổi trả và bảo hành', 'Thời hạn, điều kiện và cách thức đổi trả, bảo hành.'),
         ('bao-mat', 'Chính sách bảo mật', 'Dữ liệu cá nhân được thu thập, mục đích sử dụng và quyền của khách hàng.'),
         ('dieu-khoan', 'Điều khoản sử dụng', 'Quy định khi sử dụng website và đặt hàng.')
       ) AS v (slug, title, body)`,
      "ALTER TABLE pages ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE page_revisions ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mã giảm giá (YC-BH-05, 06; QT-21). Lượt dùng tăng trong giao dịch đặt hàng; huỷ đơn thì trả lại.
    id: "012_coupons",
    statements: [
      `CREATE TABLE coupons (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        value BIGINT NOT NULL,
        max_discount BIGINT,
        min_subtotal BIGINT NOT NULL DEFAULT 0,
        category_id TEXT REFERENCES categories (id),
        starts_at BIGINT,
        ends_at BIGINT,
        usage_limit INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT kind_valid CHECK (kind IN ('fixed', 'percent')),
        CONSTRAINT value_valid CHECK (value > 0 AND (kind = 'fixed' OR value <= 100)),
        CONSTRAINT usage_valid CHECK (used_count >= 0 AND (usage_limit IS NULL OR used_count <= usage_limit)),
        CONSTRAINT window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
      )`,
      `CREATE TABLE coupon_redemptions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        coupon_id TEXT NOT NULL REFERENCES coupons (id),
        order_id TEXT NOT NULL UNIQUE REFERENCES orders (id),
        amount BIGINT NOT NULL,
        released_at BIGINT,
        created_at BIGINT NOT NULL
      )`,
      "ALTER TABLE coupons ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Đánh giá (YC-DG-01, 02; YC-KH-05; 04 mục 7): mỗi dòng đơn đã hoàn tất một đánh giá.
    id: "013_reviews",
    statements: [
      `CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        order_item_id BIGINT NOT NULL UNIQUE REFERENCES order_items (id),
        product_id TEXT NOT NULL REFERENCES products (id),
        user_id TEXT NOT NULL REFERENCES users (id),
        rating SMALLINT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT rating_valid CHECK (rating BETWEEN 1 AND 5),
        CONSTRAINT status_valid CHECK (status IN ('pending', 'approved', 'hidden'))
      )`,
      "CREATE INDEX idx_reviews_product ON reviews (product_id, status, created_at)",
      "CREATE INDEX idx_reviews_status ON reviews (status, created_at)",
      "ALTER TABLE reviews ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Yêu thích (YC-DG-03; YC-KH-06). Khoá chính chống trùng.
    id: "014_wishlist",
    statements: [
      `CREATE TABLE wishlist_items (
        user_id TEXT NOT NULL REFERENCES users (id),
        product_id TEXT NOT NULL REFERENCES products (id),
        created_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, product_id)
      )`,
      "CREATE INDEX idx_wishlist_product ON wishlist_items (product_id)",
      "ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Slug cũ của sản phẩm (YC-SP-09): trỏ tới sản phẩm chứ không tới slug, nên đổi nhiều lần vẫn về slug hiện tại.
    id: "015_slug_redirects",
    statements: [
      `CREATE TABLE slug_redirects (
        old_slug TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL
      )`,
      "ALTER TABLE slug_redirects ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Tìm kiếm bằng ảnh (YC-AI-01..08, docs/chuan/08-tich-hop-ai.md). Mỗi sản phẩm một dòng cho mỗi dạng
    // (`default`: dáng đứng/dạng robot, `alt`: dạng biến hình) và mỗi mô hình trích đặc trưng: vector đại diện
    // (trung bình các góc nhìn, đã chuẩn hoá) và vector của từng góc, lưu float32 nối liền trong BYTEA
    // (4 byte mỗi số). `source_url` là products.model_url lúc lập chỉ mục, để biết khi nào cần lập lại.
    // Nhật ký tìm kiếm chỉ ghi điểm và quyết định, không lưu ảnh của khách.
    id: "016_image_search",
    statements: [
      `CREATE TABLE image_search_index (
        product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        form TEXT NOT NULL,
        form_label TEXT NOT NULL DEFAULT '',
        dim SMALLINT NOT NULL,
        views SMALLINT NOT NULL,
        embedding BYTEA NOT NULL,
        view_embeddings BYTEA NOT NULL,
        consistency REAL NOT NULL,
        source_url TEXT NOT NULL DEFAULT '',
        created_by TEXT REFERENCES users (id),
        created_at BIGINT NOT NULL,
        PRIMARY KEY (product_id, model, form),
        CONSTRAINT form_valid CHECK (form IN ('default', 'alt')),
        CONSTRAINT dim_valid CHECK (dim > 0),
        CONSTRAINT views_valid CHECK (views BETWEEN 1 AND 24),
        CONSTRAINT embedding_size CHECK (octet_length(embedding) = 4 * dim),
        CONSTRAINT view_embeddings_size CHECK (octet_length(view_embeddings) = 4 * dim * views)
      )`,
      "CREATE INDEX idx_image_search_index_model ON image_search_index (model)",
      `CREATE TABLE image_search_logs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        model TEXT NOT NULL,
        top_product_id TEXT REFERENCES products (id) ON DELETE SET NULL,
        top_score REAL NOT NULL,
        second_score REAL NOT NULL,
        accepted BOOLEAN NOT NULL,
        reason TEXT NOT NULL,
        tau REAL NOT NULL,
        delta REAL NOT NULL,
        candidates SMALLINT NOT NULL,
        client_ms INTEGER,
        created_at BIGINT NOT NULL,
        CONSTRAINT reason_valid CHECK (reason IN ('match', 'low-score', 'ambiguous', 'empty'))
      )`,
      "CREATE INDEX idx_image_search_logs_created ON image_search_logs (created_at)",
      "ALTER TABLE image_search_index ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE image_search_logs ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // "Báo khi có hàng": khách để lại email hoặc số điện thoại cho một phiên bản đang hết hàng; nhân viên xem danh
    // sách ở /admin/khach-hang/cho-hang và đánh dấu đã báo (chưa có gửi email tự động). Mỗi liên hệ chỉ có một yêu
    // cầu đang chờ cho mỗi phiên bản.
    id: "017_stock_alerts",
    statements: [
      `CREATE TABLE stock_alerts (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
        contact TEXT NOT NULL,
        contact_kind TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        notified_at BIGINT,
        notified_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT contact_kind_valid CHECK (contact_kind IN ('email', 'phone'))
      )`,
      "CREATE UNIQUE INDEX idx_stock_alerts_pending ON stock_alerts (variant_id, contact) WHERE notified_at IS NULL",
      "CREATE INDEX idx_stock_alerts_created ON stock_alerts (created_at)",
      "ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Cài đặt tài khoản khách (/tai-khoan/cai-dat). Sổ địa chỉ (YC-TKH-03): nhiều địa chỉ giao hàng, nhãn Nhà riêng/
    // Văn phòng, tối đa một địa chỉ mặc định cho mỗi tài khoản. Địa chỉ đang lưu trong hồ sơ (users.address, city)
    // được chép sang làm địa chỉ mặc định; từ nay users.address, city là bản sao của địa chỉ mặc định.
    // Khách tự xoá tài khoản: ẩn danh hoá dòng users (giữ dòng vì đơn hàng, đánh giá tham chiếu tới), ghi deleted_at.
    // Tên bảng là customer_addresses: CSDL Supabase dùng chung đã có bảng addresses, user_addresses và cột
    // users.deleted_at do một nơi khác tạo (migration 019_addresses, 019_account_settings, không có trong mã này); không
    // đọc ghi các bảng đó. deleted_at dùng lại nếu đã có.
    id: "018_customer_addresses",
    statements: [
      `CREATE TABLE customer_addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'home',
        recipient_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT label_valid CHECK (label IN ('home', 'office'))
      )`,
      "CREATE INDEX idx_customer_addresses_user ON customer_addresses (user_id, created_at)",
      "CREATE UNIQUE INDEX idx_customer_addresses_default ON customer_addresses (user_id) WHERE is_default",
      "ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY",
      `INSERT INTO customer_addresses (id, user_id, label, recipient_name, phone, address, city, is_default, created_at, updated_at)
       SELECT substr(md5(u.id || 'dia-chi'), 1, 20), u.id, 'home', u.name, u.phone, u.address, u.city, true, u.created_at, u.created_at
       FROM users u WHERE u.role = 'customer' AND u.address <> '' AND u.city <> ''`,
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at BIGINT",
    ],
  },
  {
    // Mở rộng cửa hàng (docs/ke-hoach/mo-rong-cua-hang.md). Mã "ext_..." để không trùng số với migration của nơi khác
    // chạy trên CSDL Supabase dùng chung. Xu: sổ cộng trừ chỉ thêm dòng, số dư là tổng; khoá duy nhất (user, reason, ref)
    // để một phần thưởng chỉ nhận một lần. Gacha chỉ quay bằng xu (không nạp tiền).
    id: "ext_01_xu_nhiem_vu_gacha",
    statements: [
      `CREATE TABLE coin_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        CONSTRAINT amount_nonzero CHECK (amount <> 0)
      )`,
      "CREATE UNIQUE INDEX idx_coin_ledger_once ON coin_ledger (user_id, reason, ref)",
      "CREATE INDEX idx_coin_ledger_user ON coin_ledger (user_id, created_at)",
      "ALTER TABLE coin_ledger ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE comic_reads (
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        chapter TEXT NOT NULL,
        read_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, chapter)
      )`,
      "ALTER TABLE comic_reads ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE gacha_pulls (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        series TEXT NOT NULL,
        card TEXT NOT NULL,
        rarity TEXT NOT NULL,
        duplicate BOOLEAN NOT NULL DEFAULT false,
        coupon_code TEXT,
        created_at BIGINT NOT NULL,
        CONSTRAINT rarity_valid CHECK (rarity IN ('common', 'rare', 'super', 'secret'))
      )`,
      "CREATE INDEX idx_gacha_pulls_user ON gacha_pulls (user_id, created_at)",
      "ALTER TABLE gacha_pulls ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Cộng đồng (/cong-dong): bài đăng của khách kèm tối đa 4 ảnh, chờ nhân viên duyệt mới hiện; bình luận hiện ngay,
    // nhân viên ẩn được; thả tim; báo cáo vi phạm cho bài hoặc bình luận.
    id: "ext_02_cong_dong",
    statements: [
      `CREATE TABLE community_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        topic TEXT NOT NULL DEFAULT 'chia-se',
        body TEXT NOT NULL,
        product_id TEXT REFERENCES products (id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        moderation_note TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        reviewed_at BIGINT,
        created_at BIGINT NOT NULL,
        CONSTRAINT status_valid CHECK (status IN ('pending', 'approved', 'hidden')),
        CONSTRAINT topic_valid CHECK (topic IN ('chia-se', 'hoi-dap', 'trung-bay', 'cua-hang'))
      )`,
      "CREATE INDEX idx_community_posts_status ON community_posts (status, created_at)",
      "CREATE INDEX idx_community_posts_user ON community_posts (user_id, created_at)",
      `CREATE TABLE community_post_images (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      "CREATE INDEX idx_community_post_images_post ON community_post_images (post_id, sort_order)",
      `CREATE TABLE community_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'visible',
        created_at BIGINT NOT NULL,
        CONSTRAINT status_valid CHECK (status IN ('visible', 'hidden'))
      )`,
      "CREATE INDEX idx_community_comments_post ON community_comments (post_id, created_at)",
      `CREATE TABLE community_likes (
        post_id TEXT NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`,
      `CREATE TABLE community_reports (
        id TEXT PRIMARY KEY,
        post_id TEXT REFERENCES community_posts (id) ON DELETE CASCADE,
        comment_id TEXT REFERENCES community_comments (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        resolved_at BIGINT,
        resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT target_valid CHECK ((post_id IS NULL) <> (comment_id IS NULL))
      )`,
      "CREATE INDEX idx_community_reports_open ON community_reports (resolved_at, created_at)",
      "ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE community_post_images ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Xưởng (src/lib/workshop.ts): dòng đơn mang cấu hình tuỳ biến. unit_price đã gồm giá tuỳ chọn; options_price là phần
    // của tuỳ chọn trong unit_price, options là mô tả để in phiếu, options_config là chuỗi cấu hình gốc. Cột có giá trị mặc
    // định nên không ảnh hưởng nơi khác ghi vào bảng này trên CSDL dùng chung.
    id: "ext_03_xuong",
    statements: [
      "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options_price BIGINT NOT NULL DEFAULT 0",
      "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options_config TEXT NOT NULL DEFAULT ''",
    ],
  },
  {
    // Nghiệp vụ bán hàng (docs/ke-hoach/nghiep-vu-ban-hang.md), mục 1–2. Tiền tố "sale_" để không trùng với migration của
    // nơi khác trên CSDL dùng chung; tên bảng đã kiểm tra chưa có trên CSDL thật (08/11/2026).
    // email_outbox: mọi thư gửi đi (cả khi chưa cấu hình SMTP: trạng thái 'logged', xem ở /admin/hop-thu).
    // password_resets: token đặt lại mật khẩu, chỉ lưu SHA-256, dùng một lần, có hạn.
    id: "sale_01_email_mat_khau",
    statements: [
      `CREATE TABLE IF NOT EXISTS email_outbox (
        id TEXT PRIMARY KEY,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        html TEXT NOT NULL,
        text_body TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL,
        ref TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        sent_at BIGINT,
        CONSTRAINT email_status_valid CHECK (status IN ('queued', 'sent', 'failed', 'logged'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox (created_at)",
      "CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status, created_at)",
      "ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        used_at BIGINT,
        created_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id, created_at)",
      "ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mục 4: khách yêu cầu trả hàng sau khi nhận (src/lib/returns.ts). Tên bảng đã kiểm tra chưa có trên CSDL thật (08/11/2026).
    // Mỗi đơn tối đa một yêu cầu đang mở hoặc đã hoàn tiền (chỉ mục duy nhất có điều kiện), khớp với payments chỉ có một
    // dòng hoàn tiền mỗi đơn. Hàng nhận về đi qua phiếu hàng trả gắn đơn (document_id), không ghi kho trực tiếp.
    id: "sale_02_tra_hang",
    statements: [
      `CREATE TABLE IF NOT EXISTS return_requests (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL REFERENCES orders (id),
        status TEXT NOT NULL DEFAULT 'requested',
        reason TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        images TEXT NOT NULL DEFAULT '[]',
        refund_account TEXT NOT NULL DEFAULT '',
        refund_amount BIGINT NOT NULL,
        staff_note TEXT NOT NULL DEFAULT '',
        document_id TEXT REFERENCES stock_documents (id),
        decided_by TEXT REFERENCES users (id),
        decided_at BIGINT,
        refunded_by TEXT REFERENCES users (id),
        refunded_at BIGINT,
        refund_reference TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT return_status_valid CHECK (status IN ('requested', 'approved', 'rejected', 'refunded', 'cancelled')),
        CONSTRAINT return_amount_valid CHECK (refund_amount >= 0)
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_open ON return_requests (order_id)
         WHERE status IN ('requested', 'approved', 'refunded')`,
      "CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests (status, created_at)",
      "ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS return_request_items (
        request_id TEXT NOT NULL REFERENCES return_requests (id) ON DELETE CASCADE,
        order_item_id BIGINT NOT NULL,
        variant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit_price BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (request_id, order_item_id),
        CONSTRAINT return_item_quantity_positive CHECK (quantity > 0)
      )`,
      "ALTER TABLE return_request_items ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Gacha bản 2 (/gacha): máy quay viên nang và gói thẻ 5 lá, lượt miễn phí mỗi ngày, mảnh ghép, thưởng đủ bộ.
    // gacha_pulls.source: machine | free | pack | craft. free_day (ngày giờ Việt Nam) chỉ có ở lượt miễn phí; chỉ mục
    // duy nhất bảo đảm mỗi người một lượt miễn phí mỗi ngày kể cả khi bấm dồn. gacha_shards: sổ mảnh ghép như sổ xu
    // (chỉ thêm dòng, số dư là tổng, khoá duy nhất (user, reason, ref)). gacha_rewards: thưởng đủ bộ, một lần mỗi series.
    id: "ext_04_gacha_v2",
    statements: [
      "ALTER TABLE gacha_pulls ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'machine'",
      "ALTER TABLE gacha_pulls ADD COLUMN IF NOT EXISTS free_day TEXT",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_pulls_free_day ON gacha_pulls (user_id, free_day) WHERE free_day IS NOT NULL",
      `CREATE TABLE IF NOT EXISTS gacha_shards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        CONSTRAINT shard_amount_nonzero CHECK (amount <> 0)
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_shards_once ON gacha_shards (user_id, reason, ref)",
      "ALTER TABLE gacha_shards ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS gacha_rewards (
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        series TEXT NOT NULL,
        coupon_code TEXT,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, series)
      )`,
      "ALTER TABLE gacha_rewards ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Thanh toán online, chạy sandbox VNPay (docs/ke-hoach/thanh-toan-va-van-chuyen.md). Đã kiểm trên CSDL thật (08/11/2026):
    // chưa có bảng payment_attempts, payment_callbacks; ràng buộc cũ payment_method_valid, method_valid chỉ nhận cod, bank.
    // Mở rộng ràng buộc (dữ liệu cũ vẫn hợp lệ), thêm sẵn 'momo' để sau không phải sửa lại.
    // payment_attempts: mỗi lần khách bấm thanh toán là một lượt, mã `ref` gửi cổng (vnp_TxnRef), duy nhất.
    // payment_callbacks: nguyên văn mọi kết quả cổng gửi về (IPN, trả về, tra cứu), để đối soát và tra lỗi.
    id: "sale_03_vnpay",
    statements: [
      "ALTER TABLE orders DROP CONSTRAINT IF EXISTS payment_method_valid",
      "ALTER TABLE orders ADD CONSTRAINT payment_method_valid CHECK (payment_method IN ('cod', 'bank', 'vnpay', 'momo'))",
      "ALTER TABLE payments DROP CONSTRAINT IF EXISTS method_valid",
      "ALTER TABLE payments ADD CONSTRAINT method_valid CHECK (method IN ('cod', 'bank', 'vnpay', 'momo'))",
      "ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_txn TEXT NOT NULL DEFAULT ''",
      `CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders (id),
        gateway TEXT NOT NULL,
        ref TEXT NOT NULL UNIQUE,
        amount BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        gateway_txn TEXT NOT NULL DEFAULT '',
        bank_code TEXT NOT NULL DEFAULT '',
        response_code TEXT NOT NULL DEFAULT '',
        expires_at BIGINT NOT NULL,
        paid_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT attempt_gateway_valid CHECK (gateway IN ('vnpay', 'momo')),
        CONSTRAINT attempt_status_valid CHECK (status IN ('pending', 'paid', 'failed')),
        CONSTRAINT attempt_amount_positive CHECK (amount > 0)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts (order_id, created_at)",
      "ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS payment_callbacks (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        gateway TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        signature_ok BOOLEAN NOT NULL,
        result TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_payment_callbacks_ref ON payment_callbacks (ref, created_at)",
      "ALTER TABLE payment_callbacks ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Hộp mù (/gacha, chế độ "Hộp mù"): mỗi khách một kệ 12 hộp chứa đủ 12 thẻ của series theo thứ tự ngẫu nhiên (máy
    // chủ xếp sẵn, trình duyệt không biết). Mở hộp ghi một dòng gacha_pulls source 'box' kèm kệ và vị trí; chỉ mục duy
    // nhất chặn mở một hộp hai lần. Mỗi khách chỉ có một kệ đang mở.
    id: "ext_05_hop_mu",
    statements: [
      `CREATE TABLE IF NOT EXISTS gacha_box_cases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        series TEXT NOT NULL,
        contents TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        finished_at BIGINT
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_box_cases_open ON gacha_box_cases (user_id) WHERE finished_at IS NULL",
      "ALTER TABLE gacha_box_cases ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE gacha_pulls ADD COLUMN IF NOT EXISTS box_case TEXT",
      "ALTER TABLE gacha_pulls ADD COLUMN IF NOT EXISTS box_slot INTEGER",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_pulls_box ON gacha_pulls (box_case, box_slot) WHERE box_case IS NOT NULL",
    ],
  },
  {
    // Tin tức (/tin-tuc): bài do nhân viên nội dung (content.edit) viết ở /admin/noi-dung/tin-tuc. Văn bản thuần như trang
    // thông tin; ảnh bìa là đường dẫn (tải lên kho media như ảnh banner). Khách chỉ thấy bài đã xuất bản.
    id: "ext_06_tin_tuc",
    statements: [
      `CREATE TABLE IF NOT EXISTS news_posts (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        cover_image TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        published_at BIGINT,
        created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT news_status_valid CHECK (status IN ('draft', 'published'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_news_posts_published ON news_posts (status, published_at DESC)",
      "ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Gacha có nhiều series (Series 2: Đội Khủng Long): mỗi khách một kệ hộp mù đang mở cho mỗi series.
    id: "ext_07_gacha_series",
    statements: [
      "DROP INDEX IF EXISTS idx_gacha_box_cases_open",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_box_cases_open_series ON gacha_box_cases (user_id, series) WHERE finished_at IS NULL",
    ],
  },
  {
    // Mục 10: hàng sắp về và đặt trước (src/lib/preorder.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng, cột nào tên
    // preorder_*, deposit_*; các ràng buộc CHECK dưới đây đang mang đúng tên này và chỉ được nới thêm giá trị mới.
    // preorder_offers: đợt đặt trước của một phiên bản; mỗi phiên bản tối đa một đợt chưa kết thúc.
    // order_items.preorder_offer_id: dòng đặt trước (không giữ tồn lúc đặt). Đã phân bổ = có dòng sổ kho 'reserve' của đơn
    // và phiên bản đó. orders.preorder_status: none | waiting (còn dòng chưa phân bổ) | ready (đã phân bổ đủ).
    // orders.deposit_amount: tiền cọc phải trả trước (0 là không cọc); payment_status 'deposit_paid' = đã nhận cọc,
    // payments.kind 'deposit' là dòng tiền cọc.
    id: "sale_04_dat_truoc",
    statements: [
      `CREATE TABLE IF NOT EXISTS preorder_offers (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        status TEXT NOT NULL DEFAULT 'open',
        expected_at BIGINT NOT NULL,
        deposit_percent INTEGER NOT NULL,
        max_qty INTEGER,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        ended_at BIGINT,
        CONSTRAINT preorder_status_valid CHECK (status IN ('open', 'closed', 'ended')),
        CONSTRAINT preorder_deposit_valid CHECK (deposit_percent BETWEEN 0 AND 100),
        CONSTRAINT preorder_max_valid CHECK (max_qty IS NULL OR max_qty > 0)
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_preorder_offers_live ON preorder_offers (variant_id) WHERE status <> 'ended'",
      "CREATE INDEX IF NOT EXISTS idx_preorder_offers_status ON preorder_offers (status, expected_at)",
      "ALTER TABLE preorder_offers ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS preorder_offer_id TEXT REFERENCES preorder_offers (id)",
      "CREATE INDEX IF NOT EXISTS idx_order_items_preorder ON order_items (preorder_offer_id) WHERE preorder_offer_id IS NOT NULL",
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS preorder_status TEXT NOT NULL DEFAULT 'none'",
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount BIGINT NOT NULL DEFAULT 0",
      "ALTER TABLE orders DROP CONSTRAINT IF EXISTS preorder_status_valid",
      "ALTER TABLE orders ADD CONSTRAINT preorder_status_valid CHECK (preorder_status IN ('none', 'waiting', 'ready'))",
      "ALTER TABLE orders DROP CONSTRAINT IF EXISTS deposit_valid",
      "ALTER TABLE orders ADD CONSTRAINT deposit_valid CHECK (deposit_amount = 0 OR (deposit_amount > 0 AND deposit_amount < total))",
      "ALTER TABLE orders DROP CONSTRAINT IF EXISTS payment_status_valid",
      "ALTER TABLE orders ADD CONSTRAINT payment_status_valid CHECK (payment_status IN ('unpaid', 'deposit_paid', 'paid', 'refunded'))",
      "CREATE INDEX IF NOT EXISTS idx_orders_preorder ON orders (preorder_status, created_at) WHERE preorder_status = 'waiting'",
      "ALTER TABLE payments DROP CONSTRAINT IF EXISTS kind_valid",
      "ALTER TABLE payments ADD CONSTRAINT kind_valid CHECK (kind IN ('deposit', 'charge', 'refund'))",
      "ALTER TABLE order_events DROP CONSTRAINT IF EXISTS field_valid",
      "ALTER TABLE order_events ADD CONSTRAINT field_valid CHECK (field IN ('status', 'payment_status', 'shipping_status', 'preorder_status'))",
    ],
  },
  {
    // Mục 8: "Đã xem gần đây" của khách đã đăng nhập (khách vãng lai lưu ở trình duyệt). Mỗi khách, mỗi sản phẩm một dòng,
    // giữ 30 sản phẩm gần nhất (src/server/repo/recently-viewed.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng này.
    // Bảng events của nơi khác (ghi hành vi) không đọc ghi.
    id: "sale_05_da_xem",
    statements: [
      `CREATE TABLE IF NOT EXISTS recently_viewed (
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        viewed_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, product_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed (user_id, viewed_at DESC)",
      "ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mục 9: flash sale (src/lib/flash-sale.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng flash_*, cột order_items.flash_*.
    // flash_sale_items: giá sale, tổng suất, tối đa mỗi đơn của một phiên bản trong chương trình. order_items.flash_sale_id: dòng
    // bán bằng giá sale; số đã bán = tổng số lượng các dòng đó ở đơn chưa huỷ (huỷ đơn trả suất).
    id: "sale_06_flash_sale",
    statements: [
      `CREATE TABLE IF NOT EXISTS flash_sales (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        starts_at BIGINT NOT NULL,
        ends_at BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT flash_window_valid CHECK (ends_at > starts_at)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_flash_sales_window ON flash_sales (ends_at, starts_at) WHERE is_active",
      "ALTER TABLE flash_sales ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS flash_sale_items (
        sale_id TEXT NOT NULL REFERENCES flash_sales (id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL REFERENCES product_variants (id),
        sale_price BIGINT NOT NULL,
        qty_limit INTEGER NOT NULL,
        max_per_order INTEGER,
        PRIMARY KEY (sale_id, variant_id),
        CONSTRAINT flash_price_positive CHECK (sale_price > 0),
        CONSTRAINT flash_qty_positive CHECK (qty_limit > 0),
        CONSTRAINT flash_per_order_valid CHECK (max_per_order IS NULL OR max_per_order > 0)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_flash_sale_items_variant ON flash_sale_items (variant_id)",
      "ALTER TABLE flash_sale_items ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS flash_sale_id TEXT REFERENCES flash_sales (id)",
      "CREATE INDEX IF NOT EXISTS idx_order_items_flash ON order_items (flash_sale_id, variant_id) WHERE flash_sale_id IS NOT NULL",
    ],
  },
  {
    // Mục 11: hỏi đáp trên trang sản phẩm (src/server/repo/questions.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng này.
    // Câu hỏi, câu trả lời của khách chờ duyệt (pending); nhân viên trả lời thì câu trả lời hiện ngay và câu hỏi được duyệt.
    // is_buyer: người trả lời đã mua sản phẩm (đơn hoàn tất) lúc trả lời.
    id: "sale_07_hoi_dap",
    statements: [
      `CREATE TABLE IF NOT EXISTS product_questions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        moderated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT question_status_valid CHECK (status IN ('pending', 'approved', 'hidden'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions (product_id, status, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_product_questions_status ON product_questions (status, created_at)",
      "ALTER TABLE product_questions ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS product_answers (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL REFERENCES product_questions (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        is_staff BOOLEAN NOT NULL DEFAULT false,
        is_buyer BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'pending',
        moderated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT answer_status_valid CHECK (status IN ('pending', 'approved', 'hidden'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_product_answers_question ON product_answers (question_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_product_answers_status ON product_answers (status, created_at)",
      "ALTER TABLE product_answers ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mục 12: combo giảm giá khi mua đủ bộ (src/lib/bundles.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng bundle_*,
    // cột orders.bundle_discount. orders.discount gồm cả giảm combo lẫn mã giảm giá (giữ ràng buộc total_valid); bundle_discount
    // là phần của combo.
    id: "sale_08_combo",
    statements: [
      `CREATE TABLE IF NOT EXISTS bundle_deals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        percent INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT bundle_percent_valid CHECK (percent BETWEEN 1 AND 50)
      )`,
      "ALTER TABLE bundle_deals ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS bundle_deal_items (
        deal_id TEXT NOT NULL REFERENCES bundle_deals (id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        PRIMARY KEY (deal_id, product_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_bundle_deal_items_product ON bundle_deal_items (product_id)",
      "ALTER TABLE bundle_deal_items ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS bundle_discount BIGINT NOT NULL DEFAULT 0",
    ],
  },
  {
    // Mục 14: đăng nhập Google, Facebook (src/server/auth/oauth.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng này.
    // Một danh tính (nhà cung cấp, mã người dùng của nhà cung cấp) gắn với một tài khoản; một tài khoản có thể liên kết nhiều.
    id: "sale_09_oauth",
    statements: [
      `CREATE TABLE IF NOT EXISTS oauth_identities (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        email TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        PRIMARY KEY (provider, subject),
        CONSTRAINT oauth_provider_valid CHECK (provider IN ('google', 'facebook'))
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities (user_id, provider)",
      "ALTER TABLE oauth_identities ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mục 15: mã OTP qua email (src/server/repo/otp.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng otp_*, chưa có cột
    // xác thực email trong users (nơi khác đã thêm birth_date, gender, review_name_style, deleted_at: không đụng tới).
    // otp_codes chỉ lưu SHA-256 của mã; mỗi mã có hạn, số lần nhập sai tối đa, dùng một lần.
    id: "sale_10_otp",
    statements: [
      `CREATE TABLE IF NOT EXISTS otp_codes (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        target TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at BIGINT NOT NULL,
        used_at BIGINT,
        created_at BIGINT NOT NULL,
        CONSTRAINT otp_purpose_valid CHECK (purpose IN ('verify_email', 'cod_order'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_otp_codes_target ON otp_codes (purpose, target, created_at DESC)",
      "ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at BIGINT",
    ],
  },
  {
    // Mục 16: chat với cửa hàng (src/server/repo/chat.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng chat_*.
    // Khách đăng nhập: một cuộc trò chuyện theo tài khoản; khách vãng lai: theo token ngẫu nhiên trong cookie httpOnly (CSDL chỉ
    // lưu SHA-256). customer_read_at, staff_read_at: mốc đã đọc của hai bên để đếm tin chưa đọc.
    id: "sale_11_chat",
    statements: [
      `CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
        visitor_hash TEXT UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        last_message_at BIGINT NOT NULL,
        last_sender TEXT NOT NULL DEFAULT 'customer',
        customer_read_at BIGINT NOT NULL DEFAULT 0,
        staff_read_at BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        CONSTRAINT chat_status_valid CHECK (status IN ('open', 'closed')),
        CONSTRAINT chat_owner_valid CHECK ((user_id IS NULL) <> (visitor_hash IS NULL))
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads (user_id) WHERE user_id IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS idx_chat_threads_recent ON chat_threads (status, last_message_at DESC)",
      "ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY",
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
        sender TEXT NOT NULL,
        staff_id TEXT REFERENCES users (id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        CONSTRAINT chat_sender_valid CHECK (sender IN ('customer', 'staff'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, id)",
      "ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY",
    ],
  },
  {
    // Mục 17: yêu cầu xuất hoá đơn VAT của đơn (src/server/repo/invoices.ts). Đã kiểm trên CSDL thật (08/11/2026): chưa có bảng.
    // Số hoá đơn nội bộ HDyyyy-nnnnnn cấp khi kế toán xuất; chưa nối nhà cung cấp hoá đơn điện tử.
    id: "sale_12_hoa_don",
    statements: [
      `CREATE TABLE IF NOT EXISTS order_invoices (
        order_id TEXT PRIMARY KEY REFERENCES orders (id),
        company_name TEXT NOT NULL,
        tax_code TEXT NOT NULL,
        company_address TEXT NOT NULL,
        invoice_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        invoice_no TEXT UNIQUE,
        issued_by TEXT REFERENCES users (id) ON DELETE SET NULL,
        issued_at BIGINT,
        created_at BIGINT NOT NULL,
        CONSTRAINT invoice_status_valid CHECK (status IN ('requested', 'issued'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_order_invoices_status ON order_invoices (status, created_at)",
      "ALTER TABLE order_invoices ENABLE ROW LEVEL SECURITY",
    ],
  },
];
