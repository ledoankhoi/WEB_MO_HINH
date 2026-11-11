import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { NewsButtons, NewsForm } from "@/components/admin/NewsForms";
import { BADGE, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { NewsArticle } from "@/components/content/NewsArticle";
import { site } from "@/config/site";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listNews } from "@/server/repo/news";

// Tin tức (/tin-tuc): viết, xuất bản, gỡ, xoá bài. `?sua=<id>` mở bài để sửa và xem trước.
export default function NewsAdminPage(props: PageProps<"/admin/noi-dung/tin-tuc">) {
  return (
    <AdminSuspense>
      <NewsAdminContent {...props} />
    </AdminSuspense>
  );
}

async function NewsAdminContent({ searchParams }: PageProps<"/admin/noi-dung/tin-tuc">) {
  await requireStaff("content.edit", "/admin/noi-dung/tin-tuc");
  const [posts, params] = await Promise.all([listNews(), searchParams]);
  const editing = posts.find((post) => post.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Tin tức</h1>
      {posts.length === 0 ? (
        <p className="text-sm text-muted">Chưa có bài nào. Viết bài đầu tiên ở khung bên dưới; bài mới là bản nháp, khách chưa thấy cho tới khi xuất bản.</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Bài viết</th>
                <th scope="col">Đường dẫn</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Sửa lần cuối</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td className="font-medium">{post.title}</td>
                  <td className="font-mono text-xs">
                    {post.status === "published" ? (
                      <a href={`${site.url}/tin-tuc/${post.slug}`} className="hover:underline">
                        /tin-tuc/{post.slug}
                      </a>
                    ) : (
                      `/tin-tuc/${post.slug}`
                    )}
                  </td>
                  <td>
                    <span className={BADGE}>{post.status === "published" ? `Đã đăng ${post.publishedAt ? formatDate(post.publishedAt) : ""}` : "Nháp"}</span>
                  </td>
                  <td className="text-sm text-muted">{formatDateTime(post.updatedAt)}</td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`/admin/noi-dung/tin-tuc?sua=${post.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                        Sửa, xem trước
                      </Link>
                      <NewsButtons id={post.id} status={post.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewsForm key={editing?.id ?? "new"} post={editing} />

      {editing && (
        <section aria-label="Xem trước" className="space-y-3 rounded-2xl border border-dashed border-line p-4 sm:p-6">
          <p className="text-sm text-muted">Xem trước theo dữ liệu đã lưu{editing.status === "draft" ? " (bản nháp, khách chưa thấy)" : ""}:</p>
          <NewsArticle post={editing} />
        </section>
      )}
    </>
  );
}
