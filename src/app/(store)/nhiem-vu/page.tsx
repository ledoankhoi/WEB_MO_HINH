import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { QuestBoard } from "@/components/quests/QuestBoard";
import { BOX, PageHero } from "@/components/store/StoreKit";
import { buttonClass } from "@/components/ui/button-style";
import { COMIC_READ_REWARD, ONCE_QUESTS } from "@/lib/quests";
import { getCurrentUser } from "@/server/auth/session";
import { getQuestBoard } from "@/server/repo/quests";

export const metadata: Metadata = { title: "Nhiệm vụ", description: "Điểm danh, làm nhiệm vụ, đọc truyện và mua hàng để nhận xu quay gacha." };

function Balance({ value }: { value: number | null }) {
  return (
    <div className="border-3 border-ink bg-[#ffd23f] px-8 py-6 text-ink shadow-[6px_6px_0_var(--color-ink)]">
      <p className="font-condensed text-base font-bold uppercase">Xu của bạn</p>
      <p className="font-condensed text-7xl leading-none font-black italic tabular-nums">{value === null ? "?" : value.toLocaleString("vi-VN")}</p>
      <Link href="/gacha" className="mt-2 inline-block font-condensed text-lg font-extrabold uppercase underline">
        Dùng xu quay gacha →
      </Link>
    </div>
  );
}

async function Board() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <PageHero
          sticker="Nhiệm vụ"
          title="Làm nhiệm vụ, nhận xu"
          intro="Điểm danh mỗi ngày, đọc truyện, viết đánh giá, mua hàng... đều có xu. Xu dùng để quay gacha nhận mã giảm giá và thẻ sưu tầm."
          aside={<Balance value={null} />}
        />
        <div className={`space-y-4 p-6 ${BOX}`}>
          <p className="font-condensed text-2xl font-black uppercase italic">Đăng nhập để bắt đầu nhận xu</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {ONCE_QUESTS.map((quest) => (
              <li key={quest.key}>
                <b>{quest.title}</b> (+{quest.reward} xu): {quest.description}
              </li>
            ))}
            <li>
              <b>Đọc truyện tranh</b> (+{COMIC_READ_REWARD} xu mỗi chương)
            </li>
          </ul>
          <Link href="/dang-nhap?next=/nhiem-vu" className={buttonClass({ size: "lg" })}>
            Đăng nhập
          </Link>
        </div>
      </>
    );
  }
  const board = await getQuestBoard(user.id);
  return (
    <>
      <PageHero
        sticker="Nhiệm vụ"
        title="Làm nhiệm vụ, nhận xu"
        intro={`Chào ${user.name}! Hoàn thành nhiệm vụ để tích xu. Xu chỉ kiếm được từ nhiệm vụ và mua hàng, không nạp bằng tiền.`}
        aside={<Balance value={board.balance} />}
      />
      <QuestBoard board={board} />
    </>
  );
}

export default function QuestsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải nhiệm vụ...</p>}>
        <Board />
      </Suspense>
    </div>
  );
}
