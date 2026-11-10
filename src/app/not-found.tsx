import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">페이지를 찾을 수 없어요</h1>
      <p className="mt-3 text-[0.9375rem] leading-7 text-muted-foreground">
        주소가 바뀌었거나 삭제된 페이지예요.
      </p>
      <Link href="/" className={`${buttonVariants({ size: "xl" })} mt-8`}>
        광고 분석하러 가기
      </Link>
    </div>
  );
}
