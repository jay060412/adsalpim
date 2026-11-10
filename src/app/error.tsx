"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다.

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">화면을 표시하는 중 문제가 발생했어요</h1>
      <p className="mt-3 text-[0.9375rem] leading-7 text-muted-foreground">
        일시적인 문제일 수 있어요. 다시 시도해도 해결되지 않으면 페이지를 새로고침해 주세요.
      </p>
      <button type="button" onClick={() => retry()} className={`${buttonVariants({ size: "xl" })} mt-8`}>
        다시 시도
      </button>
    </div>
  );
}
