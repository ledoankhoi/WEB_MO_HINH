// Nhãn và mã lý do của phiếu kho, dùng chung cho máy chủ và trình duyệt (docs/chuan/10 mục 4.2).
export const DOCUMENT_TYPES = ["receipt", "issue", "transfer", "adjustment", "stocktake", "return"] as const;
export type StockDocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<StockDocumentType, string> = {
  receipt: "Phiếu nhập",
  issue: "Phiếu xuất",
  transfer: "Phiếu chuyển vị trí",
  adjustment: "Phiếu điều chỉnh",
  stocktake: "Phiếu kiểm kê",
  return: "Phiếu nhập hàng trả",
};

// Tham số `loai` trên URL tạo phiếu.
export const DOCUMENT_TYPE_SLUGS: Record<StockDocumentType, string> = {
  receipt: "nhap",
  issue: "xuat",
  transfer: "chuyen",
  adjustment: "dieu-chinh",
  stocktake: "kiem-ke",
  return: "hang-tra",
};

export const DOCUMENT_STATUSES = ["draft", "submitted", "posted", "cancelled"] as const;
export type StockDocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<StockDocumentStatus, string> = {
  draft: "Nháp",
  submitted: "Chờ ghi sổ",
  posted: "Đã ghi sổ",
  cancelled: "Đã huỷ",
};

// Mã lý do theo loại phiếu. Phiếu không có trong bảng thì không cần lý do.
export const DOCUMENT_REASONS: Partial<Record<StockDocumentType, Record<string, string>>> = {
  receipt: { purchase: "Nhập mua", other_in: "Nhập khác" },
  issue: { sample: "Hàng mẫu", damaged: "Hư hỏng", internal: "Dùng nội bộ", return_to_supplier: "Trả nhà cung cấp", lost: "Thất lạc" },
  adjustment: { count_gain: "Kiểm đếm thừa", count_loss: "Kiểm đếm thiếu", damaged: "Hư hỏng", found: "Tìm thấy", correction: "Sửa sai chứng từ" },
};

export const isDocumentType = (value: unknown): value is StockDocumentType =>
  typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
export const isDocumentStatus = (value: unknown): value is StockDocumentStatus =>
  typeof value === "string" && (DOCUMENT_STATUSES as readonly string[]).includes(value);

// Số lượng trên một dòng phiếu (QT-17).
export const MAX_LINE_QTY = 9999;
