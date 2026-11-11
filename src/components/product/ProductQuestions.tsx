"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { answerQuestionAction, askQuestionAction } from "@/app/actions/questions";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/lib/types";

type Answer = { id: string; userName: string; body: string; isStaff: boolean; isBuyer: boolean; createdAt: number };
type Question = { id: string; userName: string; body: string; createdAt: number; answers: Answer[] };

const TEXTAREA = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none";

// Ô nhập dùng chung cho hỏi và trả lời; báo kết quả ngay dưới ô.
function Composer({ label, placeholder, send }: { label: string; placeholder: string; send: (text: string) => Promise<FormState> }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const reply = await send(text);
          setResult(reply);
          if (reply.ok) setText("");
        });
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium">
        {label}
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={1000} placeholder={placeholder} className={TEXTAREA} />
      </label>
      {result?.message && (
        <Notice tone={result.ok ? "success" : "error"}>
          {result.message}
          {!result.ok && result.message.includes("đăng nhập") && (
            <>
              {" "}
              <Link href={`/dang-nhap?next=${encodeURIComponent(pathname)}`} className="font-semibold underline">
                Đăng nhập
              </Link>
            </>
          )}
        </Notice>
      )}
      <Button type="submit" size="sm" pending={pending} disabled={text.trim().length < 5}>
        Gửi
      </Button>
    </form>
  );
}

// Hỏi đáp trên trang sản phẩm (nghiep-vu-ban-hang mục 11): câu hỏi đã duyệt, trả lời của cửa hàng và khách đã mua.
export function ProductQuestions({ productId, questions }: { productId: string; questions: Question[] }) {
  const [answering, setAnswering] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <Composer label="Đặt câu hỏi về sản phẩm" placeholder="Ví dụ: Mô hình có kèm đế trưng bày không?" send={(text) => askQuestionAction(productId, text)} />
      {questions.length === 0 ? (
        <p className="text-sm text-muted">Chưa có câu hỏi nào. Hãy là người đầu tiên hỏi về sản phẩm này.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {questions.map((question) => (
            <li key={question.id} className="space-y-3 p-4 text-sm">
              <p>
                <span className="font-semibold">Hỏi: </span>
                <span className="whitespace-pre-line">{question.body}</span>
                <span className="block text-xs text-muted">
                  {question.userName} · {formatDate(question.createdAt)}
                </span>
              </p>
              {question.answers.map((answer) => (
                <div key={answer.id} className={`ml-4 border-l-3 pl-3 ${answer.isStaff ? "border-brand" : "border-line"}`}>
                  <p className="whitespace-pre-line">{answer.body}</p>
                  <p className="text-xs text-muted">
                    {answer.isStaff ? <strong className="text-brand-strong">ROBOTICA</strong> : answer.userName}
                    {answer.isBuyer && !answer.isStaff && " · Đã mua sản phẩm"} · {formatDate(answer.createdAt)}
                  </p>
                </div>
              ))}
              {answering === question.id ? (
                <div className="ml-4">
                  <Composer label="Trả lời (dành cho khách đã mua)" placeholder="Chia sẻ trải nghiệm của bạn" send={(text) => answerQuestionAction(question.id, text)} />
                </div>
              ) : (
                <button type="button" onClick={() => setAnswering(question.id)} className="ml-4 text-xs font-semibold text-muted underline hover:text-fg">
                  Bạn đã mua? Trả lời câu hỏi này
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
