"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Flag, Heart } from "lucide-react";
import { addCommentAction, reportAction, toggleLikeAction } from "@/app/actions/community";
import { COMMENT_MAX, REPORT_REASONS } from "@/lib/community";
import type { FormState } from "@/lib/types";

// Thả tim một bài. Khách chưa đăng nhập: dẫn tới đăng nhập.
export function LikeButton({ postId, liked, likes, signedIn }: { postId: string; liked: boolean; likes: number; signedIn: boolean }) {
  const [state, setState] = useState({ liked, likes });
  const [pending, startTransition] = useTransition();
  const className = `inline-flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-condensed text-base font-extrabold transition ${
    state.liked ? "bg-brand text-white" : "bg-surface hover:bg-raised"
  }`;
  if (!signedIn) {
    return (
      <Link href="/dang-nhap?next=/cong-dong" className={className} aria-label="Đăng nhập để thả tim">
        <Heart className="size-4" strokeWidth={2.6} aria-hidden /> {state.likes}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={state.liked}
      aria-label={state.liked ? "Bỏ tim" : "Thả tim"}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleLikeAction(postId);
          if (result.ok && result.liked !== undefined && result.likes !== undefined) setState({ liked: result.liked, likes: result.likes });
        })
      }
      className={className}
    >
      <Heart className="size-4" strokeWidth={2.6} fill={state.liked ? "currentColor" : "none"} aria-hidden /> {state.likes}
    </button>
  );
}

// Báo cáo bài hoặc bình luận: chọn lý do rồi gửi.
export function ReportButton({ target, id }: { target: "post" | "comment"; id: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (message) return <span className="text-xs text-muted" role="status">{message}</span>;
  return open ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {Object.entries(REPORT_REASONS).map(([key, label]) => (
        <button
          key={key}
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setMessage((await reportAction(target, id, key)).message ?? ""))}
          className="border border-line px-2 py-0.5 text-xs hover:border-brand hover:text-brand"
        >
          {label}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted underline">
        Huỷ
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
      <Flag className="size-3.5" aria-hidden /> Báo cáo
    </button>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(addCommentAction.bind(null, postId), {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="body" className="sr-only">
        Bình luận
      </label>
      <textarea
        id="body"
        name="body"
        // React tự xoá form sau khi gửi; gửi lỗi thì điền lại nội dung đã gõ.
        defaultValue={state.ok ? "" : (state.values?.body ?? "")}
        maxLength={COMMENT_MAX}
        rows={3}
        placeholder="Viết bình luận..."
        className="w-full border-3 border-ink bg-surface p-3 text-sm focus:border-brand focus:outline-none"
      />
      {(state.errors?.body || (!state.ok && state.message)) && (
        <p className="text-xs text-danger" role="alert">
          {state.errors?.body ?? state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex h-10 items-center border-3 border-ink bg-brand px-4 font-condensed text-base font-extrabold text-white uppercase">
        Gửi bình luận
      </button>
    </form>
  );
}
