"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

type Message = { id: number; sender: "customer" | "staff"; body: string; createdAt: number };

const OPEN_POLL_MS = 5000;
const CLOSED_POLL_MS = 30000;
const time = (ms: number) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

// Chat với cửa hàng (nghiep-vu-ban-hang mục 16): nút nổi ở góc, khung trò chuyện mở tại chỗ. Mở khung thì hỏi tin mới mỗi
// 5 giây; đóng thì 30 giây một lần chỉ để hiện số tin chưa đọc. Nhân viên trả lời ở /admin/chat.
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id ?? 0;

  const poll = useCallback(async (after: number, reading: boolean) => {
    try {
      const response = await fetch(`/api/chat?after=${after}${reading ? "&open=1" : ""}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { messages: Message[]; unread: number };
      if (reading && data.messages.length > 0) setMessages((current) => [...current, ...data.messages.filter((m) => m.id > (current.at(-1)?.id ?? 0))]);
      setUnread(reading ? 0 : data.unread);
    } catch {
      // Mất mạng: lần hỏi sau thử lại.
    }
  }, []);

  // Tin cuối đã có, đọc qua ref để không dựng lại bộ hẹn giờ mỗi khi có tin mới.
  const lastIdRef = useRef(0);
  useEffect(() => {
    // Hỏi ngay một lần khi mở hoặc đóng khung, rồi định kỳ.
    const first = window.setTimeout(() => void poll(open ? lastIdRef.current : 0, open), 0);
    const id = window.setInterval(() => void poll(open ? lastIdRef.current : 0, open), open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [open, poll]);

  useEffect(() => {
    lastIdRef.current = lastId;
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lastId]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const data = (await response.json()) as { messages?: Message[]; error?: string };
      if (!response.ok || !data.messages) setError(data.error ?? "Không gửi được tin nhắn.");
      else {
        setMessages(data.messages);
        setText("");
      }
    } catch {
      setError("Không gửi được tin nhắn. Kiểm tra kết nối mạng.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed right-4 bottom-24 z-40 lg:bottom-6">
      {open && (
        <section
          aria-label="Chat với ROBOTICA"
          className="mb-3 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col border-3 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)]"
        >
          <header className="flex items-center justify-between bg-ink px-4 py-2.5 text-white">
            <p className="font-condensed text-lg font-extrabold uppercase">Chat với ROBOTICA</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng khung chat" className="rounded p-1 hover:bg-white/15">
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div ref={list} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">
            {messages.length === 0 && <p className="text-muted">Bạn cần tư vấn mẫu, kiểm tra đơn hay hỏi hàng sắp về? Nhắn cho cửa hàng, nhân viên trả lời trong giờ làm việc.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-line ${message.sender === "customer" ? "bg-brand text-white" : "bg-raised"}`}>
                  {message.body}
                  <span className={`mt-0.5 block text-[11px] ${message.sender === "customer" ? "text-white/75" : "text-muted"}`}>
                    {message.sender === "staff" ? "ROBOTICA · " : ""}
                    {time(message.createdAt)}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 border-t-3 border-ink p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Tin nhắn
            </label>
            <textarea
              id="chat-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Nhập tin nhắn"
              className="min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-2 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <button type="submit" disabled={sending || !text.trim()} aria-label="Gửi tin nhắn" className="grid size-10 place-items-center bg-brand text-white disabled:opacity-50">
              <Send className="size-4" aria-hidden />
            </button>
          </form>
          {error && (
            <p role="alert" className="px-3 pb-2 text-xs text-danger">
              {error}
            </p>
          )}
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Chat với cửa hàng, ${unread} tin chưa đọc` : "Chat với cửa hàng"}
        className="relative ml-auto grid size-14 place-items-center rounded-full border-3 border-ink bg-brand text-white shadow-[4px_4px_0_var(--color-ink)] transition hover:-translate-y-0.5"
      >
        <MessageCircle className="size-6" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-6 place-items-center rounded-full border-2 border-ink bg-surface px-1 text-xs font-bold text-ink">{unread}</span>
        )}
      </button>
    </div>
  );
}
