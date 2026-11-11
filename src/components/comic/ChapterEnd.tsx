"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markComicReadAction } from "@/app/actions/quests";
import { COMIC_READ_REWARD } from "@/lib/quests";

// Dấu "hết chương": khi khách cuộn tới đây thì ghi nhận đã đọc (nhiệm vụ Đọc truyện, nhận xu ở /nhiem-vu).
export function ChapterEnd({ chapter }: { chapter: string }) {
  const marker = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "recorded" | "guest">("idle");

  useEffect(() => {
    const element = marker.current;
    if (!element) return;
    // Kiểm tra theo vị trí thay vì IntersectionObserver: cuộn nhanh (phím End, kéo thanh cuộn) có thể nhảy qua
    // dấu mà nó không từng nằm trong khung nhìn. Dấu đã lên tới 80% chiều cao màn hình (hoặc vượt qua) là đọc xong.
    let done = false;
    const check = async () => {
      if (done || element.getBoundingClientRect().top > window.innerHeight * 0.8) return;
      done = true;
      stop();
      const { recorded } = await markComicReadAction(chapter);
      setState(recorded ? "recorded" : "guest");
    };
    const stop = () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    void check();
    return stop;
  }, [chapter]);

  return (
    <div ref={marker} className="flex flex-wrap items-center justify-between gap-4 border-4 border-ink bg-ink px-6 py-5 text-white">
      <p className="font-condensed text-3xl font-black uppercase italic">Hết chương</p>
      <p className="text-sm font-medium" role="status">
        {state === "recorded" ? (
          <>
            Đã ghi nhận bạn đọc xong chương này.{" "}
            <Link href="/nhiem-vu" className="font-bold underline">
              Nhận {COMIC_READ_REWARD} xu ở Nhiệm vụ
            </Link>
          </>
        ) : state === "guest" ? (
          <>
            <Link href="/dang-nhap?next=/nhiem-vu" className="font-bold underline">
              Đăng nhập
            </Link>{" "}
            để nhận {COMIC_READ_REWARD} xu mỗi chương đọc xong.
          </>
        ) : (
          `Đọc xong mỗi chương nhận ${COMIC_READ_REWARD} xu.`
        )}
      </p>
    </div>
  );
}
