import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { Empty, first, isId } from "@/components/admin/parts";
import { ChatAutoRefresh, ChatReplyForm, ChatStatusButton } from "@/components/admin/ChatPanel";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { findThread, listMessages, listThreads } from "@/server/repo/chat";

// Chat với khách (nghiep-vu-ban-hang mục 16): danh sách cuộc trò chuyện (chờ trả lời lên đầu) và cuộc đang mở (?id=).
export default function ChatPage(props: PageProps<"/admin/chat">) {
  return (
    <AdminSuspense>
      <ChatPageContent {...props} />
    </AdminSuspense>
  );
}

async function ChatPageContent({ searchParams }: PageProps<"/admin/chat">) {
  await requireStaff("customers.manage", "/admin/chat");
  const params = await searchParams;
  const status = first(params["trang-thai"]) === "da-xong" ? "closed" : "open";
  const threads = await listThreads(status);
  const selectedId = first(params.id);
  const selected = isId(selectedId) ? await findThread(selectedId) : null;
  const messages = selected ? await listMessages(selected.id, 0, "staff") : [];
  const tab = (key: "open" | "closed", label: string) => (
    <Link
      href={key === "open" ? "/admin/chat" : "/admin/chat?trang-thai=da-xong"}
      className={`rounded-full px-3 py-1 text-sm font-medium ${status === key ? "bg-fg text-bg" : "bg-raised"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <ChatAutoRefresh />
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Chat với khách</h1>
        <p className="text-sm text-muted">Khách nhắn từ nút chat ở góc trang cửa hàng. Trang tự tải lại mỗi 10 giây.</p>
      </div>
      <div className="flex gap-2">
        {tab("open", "Đang mở")}
        {tab("closed", "Đã xong")}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {threads.length === 0 ? (
          <Empty>Chưa có cuộc trò chuyện nào.</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/admin/chat?${status === "closed" ? "trang-thai=da-xong&" : ""}id=${thread.id}`}
                  className={`block space-y-0.5 px-4 py-3 hover:bg-raised ${thread.id === selected?.id ? "bg-raised" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{thread.name}</span>
                    {thread.unread > 0 && <span className="rounded-full bg-danger px-2 text-xs font-bold text-white">{thread.unread}</span>}
                  </span>
                  <span className="block truncate text-muted">
                    {thread.lastSender === "staff" ? "Bạn: " : ""}
                    {thread.preview}
                  </span>
                  <span className="block text-xs text-muted">{formatDateTime(thread.lastMessageAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{selected.name}</p>
                <p className="text-xs text-muted">
                  {selected.email ?? "Khách vãng lai"}
                  {selected.userId && (
                    <>
                      {" · "}
                      <Link href={`/admin/khach-hang/${selected.userId}`} className="text-brand-strong hover:underline">
                        Hồ sơ khách
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <ChatStatusButton threadId={selected.id} status={selected.status} />
            </div>
            <ol className="max-h-[28rem] space-y-2 overflow-y-auto text-sm">
              {messages.map((message) => (
                <li key={message.id} className={`flex ${message.sender === "staff" ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-line ${message.sender === "staff" ? "bg-brand text-white" : "bg-raised"}`}>
                    {message.body}
                    <span className={`mt-0.5 block text-[11px] ${message.sender === "staff" ? "text-white/75" : "text-muted"}`}>
                      {message.sender === "staff" ? `${message.staffName ?? "Nhân viên"} · ` : ""}
                      {formatDateTime(message.createdAt)}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
            <ChatReplyForm threadId={selected.id} />
          </section>
        ) : (
          <Empty>Chọn một cuộc trò chuyện để xem và trả lời.</Empty>
        )}
      </div>
    </>
  );
}
