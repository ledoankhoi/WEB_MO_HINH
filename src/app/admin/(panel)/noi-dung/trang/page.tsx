import Link from "next/link";
import { PageButtons, PageForm, RestoreRevisionButton } from "@/components/admin/ContentForms";
import { BADGE, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { InfoPageView } from "@/components/content/InfoPageView";
import { site } from "@/config/site";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listPageRevisions, listPages } from "@/server/repo/content";

// YC-CMS-04, 07: trang thông tin, phiên bản và xem trước (Q20). `?sua=<id>` mở trang để sửa.
export default async function InfoPagesPage({ searchParams }: PageProps<"/admin/noi-dung/trang">) {
  await requireStaff("content.edit", "/admin/noi-dung/trang");
  const [pages, params] = await Promise.all([listPages(), searchParams]);
  const editing = pages.find((page) => page.id === first(params.sua));
  const revisions = editing ? await listPageRevisions(editing.id) : [];

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Trang thông tin ({pages.length})</h1>
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col">Trang</th>
              <th scope="col">Đường dẫn</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td className="font-medium">{page.title}</td>
                <td className="font-mono text-xs">
                  {page.status === "published" ? (
                    <a href={`${site.url}/trang/${page.slug}`} className="hover:underline">
                      /trang/{page.slug}
                    </a>
                  ) : (
                    `/trang/${page.slug}`
                  )}
                </td>
                <td>
                  <span className={BADGE}>{page.status === "published" ? "Đã xuất bản" : "Nháp"}</span>
                </td>
                <td>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link href={`/admin/noi-dung/trang?sua=${page.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                      Sửa, xem trước
                    </Link>
                    <PageButtons id={page.id} status={page.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PageForm key={editing?.id ?? "new"} page={editing} />

      {editing && (
        <>
          <section aria-label="Xem trước" className="space-y-3 rounded-2xl border border-dashed border-line p-4 sm:p-6">
            <p className="text-sm text-muted">Xem trước theo dữ liệu đã lưu{editing.status === "draft" ? " (bản nháp, khách chưa thấy)" : ""}:</p>
            <InfoPageView page={editing} />
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Phiên bản đã xuất bản</h2>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted">Chưa xuất bản lần nào.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
                {revisions.map((revision) => (
                  <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span>
                      {formatDateTime(revision.createdAt)} · {revision.authorName ?? "Hệ thống"} · {revision.title} ({revision.body.length} ký tự)
                    </span>
                    <RestoreRevisionButton pageId={editing.id} revisionId={revision.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
