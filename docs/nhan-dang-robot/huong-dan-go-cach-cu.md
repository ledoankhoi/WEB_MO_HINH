# Hướng dẫn gỡ cách tìm bằng ảnh cũ (B14)

Cách cũ: so ảnh khách với 12 góc dựng từ mô hình 3D bằng CLIP ViT-B/32 không huấn luyện (`docs/chuan/08-tich-hop-ai.md`). Cách mới: mô hình nhận dạng robot tự huấn luyện (B6–B9), trang `/tim-bang-anh` tự dùng khi có mô hình đang bật ở `/admin/nhan-dien`.

**Chưa gỡ.** Ngày 14/11/2026 chủ dự án quyết định giữ nguyên mã và bảng của cách cũ, chỉ viết sẵn hướng dẫn này (nhật ký, mục 4). Khi chưa gỡ, hai cách cùng tồn tại:
- Có mô hình nhận dạng đang bật: `/tim-bang-anh` dùng nhận dạng.
- Tắt mô hình nhận dạng: trang tự quay về cách cũ. Đây là đường lui nếu mô hình mới có vấn đề trên bản thật.

Nên gỡ khi thử nghiệm thực địa (B13) cho thấy cách mới dùng được, và đã chạy ổn trên bản thật một thời gian. Sau khi gỡ thì mất đường lui ở trên.

## 1. Trước khi gỡ

1. **Sao lưu.** Chạy `npm run backup` (chỉ đọc, ghi `data/backups/<thời điểm>/`). Kiểm tra trong đó có `image_search_index.json`, `image_search_logs.json`, `site_settings.json`.
2. **Kiểm tra mô hình nhận dạng đang bật.** Ở `/admin/nhan-dien`, mở `/tim-bang-anh` trên bản thật và thử vài ảnh.
3. **Ghi số liệu cuối của cách cũ cho luận văn.** Ở `/admin/tim-bang-anh` (nhật ký, tỉ lệ từ chối), vì sau khi gỡ trang này không còn.

## 2. Phần dùng chung: giữ lại, chuyển chỗ

Cách mới đang dùng lại các phần sau của cách cũ. **Không xoá**; nên chuyển sang `src/components/recognition/` (hoặc một thư mục chung) trước khi xoá phần còn lại:

| Phần | Cách mới dùng để làm gì |
| --- | --- |
| `public/image-search/worker.js` | Web Worker chạy ONNX Runtime Web, tải và lưu đệm file mô hình. `classifier.ts` gọi `/image-search/worker.js` |
| `public/image-search/ort/` và `scripts/copy-ort.mjs` | Thư viện ONNX Runtime Web chép vào lúc cài |
| `src/components/image-search/embedder.ts` | Chỉ phần `canRunModel`, kiểu `LoadInfo`, `LoadProgress` |
| `src/components/image-search/pixels.ts` | `readImageFile`, kiểu `Rect` (đọc ảnh, xoay theo EXIF) |
| `src/components/image-search/RegionPicker.tsx` | Khoanh vùng robot trong ảnh |

Nếu đổi đường dẫn worker thì sửa cả `classifier.ts` (đường dẫn Worker, hằng `CACHE_NAME` phải trùng với `worker.js`) và `scripts/copy-ort.mjs`, `.gitignore`, `eslint.config.mjs` (thư mục `ort/`).

## 3. Mã xoá được

| File | Ghi chú |
| --- | --- |
| `src/components/image-search/ImageSearch.tsx`, `SearchResults.tsx`, `indexer.ts`, `view-renderer.ts` | Giao diện khách và lập chỉ mục 12 góc |
| Phần còn lại của `embedder.ts` (lớp nhúng CLIP) | Giữ `canRunModel` và các kiểu ở mục 2 |
| `src/components/admin/ImageSearchWorkbench.tsx`, `src/app/admin/(panel)/tim-bang-anh/` | Trang quản trị lập chỉ mục, hiệu chỉnh |
| Mục "Tìm bằng ảnh (AI)" trong `src/components/admin/AdminNav.tsx` | |
| `src/app/actions/image-search.ts` | Server Action lập chỉ mục, hiệu chỉnh |
| `src/app/api/tim-bang-anh/route.ts` | API nhận vector; xoá cả dòng của nó trong `docs/chuan/06-api.md` |
| `src/server/repo/image-search.ts`, `src/server/image-search.ts` | Truy vấn, cache `IMAGE_SEARCH_TAG` |
| `src/lib/image-search.ts`, `src/lib/image-search-eval.ts` | `IMAGE_SEARCH_MODEL`, luật τ/δ, hiệu chỉnh |
| `test/image-search.test.ts` | |
| Biến môi trường `NEXT_PUBLIC_IMAGE_SEARCH_MODEL_*` | Trong `.env.example` và trên Netlify |

## 4. Chỗ đang đọc trạng thái của cách cũ: sửa trước khi xoá

| File | Hiện tại | Sửa thành |
| --- | --- | --- |
| `src/app/(store)/tim-bang-anh/page.tsx` | Có mô hình thì `RobotRecognition`, không thì `ImageSearch` | Không có mô hình thì báo "chưa mở" (hoặc trả 404) |
| `src/components/layout/Header.tsx` | Nút máy ảnh hiện khi chỉ mục cũ có sản phẩm **hoặc** có mô hình nhận dạng | Chỉ xét `getActiveRecognitionModel()` |
| `src/app/(store)/page.tsx` | Khối "Tìm bằng ảnh" trên trang chủ, cùng điều kiện như đầu trang | Chỉ xét mô hình nhận dạng; bỏ câu chữ của cách cũ |
| `src/app/(store)/gioi-thieu/page.tsx`, `src/data/landing.ts` | Số liệu và câu chữ về CLIP ViT-B/32 và 12 góc | Số liệu của mô hình đang bật (`metrics` trong model card) |

## 5. Bảng và dữ liệu trên CSDL

CSDL Supabase dùng chung với một nơi khác, migration lỗi làm mọi trang lỗi. Trước khi viết migration:

1. Kiểm tra bảng `meta` và tên bảng trên CSDL thật (chỉ đọc).
2. Chọn mã migration chưa có, ví dụ `nd_02_go_tim_anh_cu`, đặt sau `nd_01` trong `src/server/db/migrations.ts`.
3. Chỉ dùng câu có `IF EXISTS`:

```sql
DROP TABLE IF EXISTS image_search_logs;
DROP TABLE IF EXISTS image_search_index;
DELETE FROM site_settings WHERE key = 'image_search';
```

Migration cũ `016_image_search` **giữ nguyên** (CSDL mới vẫn chạy nó rồi chạy bước xoá). Thêm test vào `test/db-init.test.ts` hoặc test của migration: sau khi khởi tạo trên PGlite, không còn hai bảng trên.

File mô hình CLIP ViT-B/32 tải từ Hugging Face (`Xenova/clip-vit-base-patch32`), không nằm trên Storage của dự án, nên không có gì để xoá ở Storage. Ảnh 12 góc dựng trong trình duyệt lúc lập chỉ mục, không lưu lại.

## 6. Kiểm tra sau khi gỡ

1. `grep -rn "image-search\|image_search\|ImageSearch\|IMAGE_SEARCH" src test scripts`: chỉ còn các phần giữ lại ở mục 2 (hoặc không còn gì nếu đã chuyển chỗ).
2. Chạy `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`.
3. Trên bản thật, mở `/tim-bang-anh`, nút máy ảnh ở đầu trang, trang chủ, `/gioi-thieu`, `/admin/nhan-dien`.
4. Cập nhật tài liệu:
   - `CLAUDE.md`: đoạn "Tìm kiếm bằng ảnh".
   - `docs/chuan/08-tich-hop-ai.md`: ghi cách cũ đã gỡ, ngày gỡ.
   - `docs/giaithich/noi-luu-du-lieu.md`.
   - Nhật ký: `docs/nhan-dang-robot/nhat-ky.md`.

## 7. Nếu cần khôi phục

- **Mã:** `git revert` commit gỡ.
- **Dữ liệu:** chưa có lệnh khôi phục vào CSDL thật. Cách khôi phục từ thư mục sao lưu được diễn tập trong `test/backup.test.ts`.
- **Cách khác:** chỉ chạy lại lập chỉ mục ở `/admin/tim-bang-anh` (76 sản phẩm, vài phút trong trình duyệt). Bảng chỉ mục sinh lại được từ mô hình 3D, chỉ nhật ký cũ là mất hẳn nếu không khôi phục.
