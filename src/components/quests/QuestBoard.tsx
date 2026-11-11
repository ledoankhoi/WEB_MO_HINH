"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Coins } from "lucide-react";
import { checkInAction, claimRewardAction } from "@/app/actions/quests";
import { Notice } from "@/components/ui/Notice";
import { BOX } from "@/components/store/StoreKit";
import { formatDate, formatVnd } from "@/lib/format";
import { CHECKIN_REWARD, COIN_REASONS, STREAK_BONUS, STREAK_DAYS } from "@/lib/quests";
import type { FormState } from "@/lib/types";
import type { QuestBoard as Board } from "@/server/repo/quests";

const ACTION = "inline-flex h-10 items-center justify-center gap-1.5 border-3 border-ink px-4 font-condensed text-base font-extrabold uppercase transition";

// Bảng nhiệm vụ của khách đã đăng nhập: điểm danh, nhiệm vụ, xu từ đơn hàng, lịch sử xu.
export function QuestBoard({ board }: { board: Board }) {
  const [notice, setNotice] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<FormState>) => startTransition(async () => setNotice(await task()));
  const filled = board.streak % STREAK_DAYS === 0 && board.streak > 0 && board.checkedInToday ? STREAK_DAYS : board.streak % STREAK_DAYS;

  return (
    <div className="space-y-12">
      {notice.message && <Notice tone={notice.ok ? "success" : "info"}>{notice.message}</Notice>}

      <section aria-labelledby="diem-danh" className={`grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${BOX}`}>
        <div className="space-y-4">
          <h2 id="diem-danh" className="flex items-center gap-2 font-condensed text-3xl font-black uppercase italic">
            <CalendarCheck className="size-7" strokeWidth={2.4} aria-hidden /> Điểm danh mỗi ngày
          </h2>
          <ol className="grid grid-cols-7 gap-2" aria-label={`Chuỗi ${board.streak} ngày`}>
            {Array.from({ length: STREAK_DAYS }, (_, index) => {
              const done = index < filled;
              const last = index === STREAK_DAYS - 1;
              return (
                <li
                  key={index}
                  className={`flex h-16 flex-col items-center justify-center border-3 border-ink font-condensed font-extrabold uppercase ${
                    done ? "bg-brand text-white" : last ? "bg-[#fff3a8]" : "bg-surface"
                  }`}
                >
                  <span className="text-xs">Ngày {index + 1}</span>
                  <span className="text-lg leading-none">{done ? <Check className="size-5" strokeWidth={3} aria-label="Đã điểm danh" /> : `+${last ? CHECKIN_REWARD + STREAK_BONUS : CHECKIN_REWARD}`}</span>
                </li>
              );
            })}
          </ol>
          <p className="text-sm text-muted">
            Mỗi ngày +{CHECKIN_REWARD} xu. Đủ {STREAK_DAYS} ngày liền thưởng thêm {STREAK_BONUS} xu. Chuỗi hiện tại: <b className="text-fg">{board.streak} ngày</b>.
          </p>
        </div>
        <button
          type="button"
          disabled={pending || board.checkedInToday}
          onClick={() => run(checkInAction)}
          className={`${ACTION} h-14 bg-brand px-8 text-xl text-white shadow-[4px_4px_0_var(--color-ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted disabled:shadow-none`}
        >
          {board.checkedInToday ? "Đã điểm danh hôm nay" : `Điểm danh +${CHECKIN_REWARD} xu`}
        </button>
      </section>

      <section aria-labelledby="nhiem-vu-list" className="space-y-6">
        <h2 id="nhiem-vu-list" className="font-condensed text-3xl font-black uppercase italic">
          Nhiệm vụ
        </h2>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {board.quests.map((quest) => (
            <li key={`${quest.kind}:${quest.ref}`} className={`flex flex-col gap-3 p-4 ${BOX} ${quest.status === "claimed" ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-condensed text-xl leading-tight font-extrabold uppercase">{quest.title}</p>
                <span className="shrink-0 rotate-3 border-2 border-ink bg-[#ffd23f] px-2 py-0.5 font-condensed text-base font-black">+{quest.reward} xu</span>
              </div>
              <p className="text-sm text-muted">{quest.description}</p>
              <div className="mt-auto space-y-2">
                <div className="h-3 border-2 border-ink bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={quest.target} aria-valuenow={quest.progress}>
                  <div className="h-full bg-cobalt" style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted tabular-nums">
                    {quest.progress}/{quest.target}
                  </span>
                  {quest.status === "claimable" ? (
                    <button type="button" disabled={pending} onClick={() => run(() => claimRewardAction(quest.kind, quest.ref))} className={`${ACTION} bg-brand text-white hover:brightness-110`}>
                      Nhận xu
                    </button>
                  ) : quest.status === "claimed" ? (
                    <span className={`${ACTION} border-line text-muted`}>
                      <Check className="size-4" strokeWidth={3} aria-hidden /> Đã nhận
                    </span>
                  ) : (
                    <Link href={quest.href} className={`${ACTION} bg-surface hover:bg-raised`}>
                      Làm ngay
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="xu-mua-hang" className="space-y-4">
        <h2 id="xu-mua-hang" className="font-condensed text-3xl font-black uppercase italic">
          Xu từ đơn hàng
        </h2>
        <p className="text-sm text-muted">Mỗi đơn hoàn tất nhận 1 xu cho mỗi 10.000 ₫ (tính trên tổng tiền đã trả).</p>
        {board.orderRewards.length === 0 ? (
          <p className={`${BOX} px-5 py-6 text-sm text-muted`}>Chưa có đơn hoàn tất nào chờ nhận xu.</p>
        ) : (
          <ul className={`divide-y-2 divide-line ${BOX}`}>
            {board.orderRewards.map((order) => (
              <li key={order.orderId} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span className="font-semibold">{order.code}</span>
                <span className="text-sm text-muted tabular-nums">{formatVnd(order.total)}</span>
                <span className="ml-auto font-condensed text-lg font-black">+{order.reward} xu</span>
                <button type="button" disabled={pending} onClick={() => run(() => claimRewardAction("order", order.orderId))} className={`${ACTION} bg-brand text-white hover:brightness-110`}>
                  Nhận
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lich-su-xu" className="space-y-4">
        <h2 id="lich-su-xu" className="flex items-center gap-2 font-condensed text-3xl font-black uppercase italic">
          <Coins className="size-7" strokeWidth={2.4} aria-hidden /> Lịch sử xu
        </h2>
        {board.history.length === 0 ? (
          <p className={`${BOX} px-5 py-6 text-sm text-muted`}>Chưa có giao dịch xu nào. Điểm danh ngay để nhận những đồng xu đầu tiên!</p>
        ) : (
          <ul className={`divide-y-2 divide-line ${BOX}`}>
            {board.history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-muted">{formatDate(entry.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{COIN_REASONS[entry.reason] ?? entry.reason}</b>
                  {entry.note && entry.note !== COIN_REASONS[entry.reason] ? <span className="text-muted"> · {entry.note}</span> : null}
                </span>
                <span className={`font-condensed text-lg font-black tabular-nums ${entry.amount > 0 ? "text-success" : "text-brand"}`}>
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
