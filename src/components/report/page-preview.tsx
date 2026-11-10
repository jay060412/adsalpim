"use client";

import { useState } from "react";
import { ScanLine, ZoomIn, ZoomOut } from "lucide-react";
import type { Claim } from "@/lib/analysis/schema";
import type { PageVisual } from "@/lib/analysis/visual-schema";
import { STATUS_LABELS } from "@/lib/analysis/labels";
import { cn } from "@/lib/utils";

export function PagePreview({ visual, claims, selectedId, onSelect }: {
  visual: PageVisual;
  claims: Claim[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(false);
  return (
    <section aria-label="광고 화면 하이라이트" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><ScanLine aria-hidden="true" className="size-4 text-primary" />광고 화면에서 확인</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">번호가 있는 표시를 누르면 분석 내용을 볼 수 있어요.</p>
        </div>
        <button type="button" onClick={() => setZoom(!zoom)} aria-pressed={zoom}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold hover:bg-muted print:hidden">
          {zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}{zoom ? "화면 맞춤" : "확대"}
        </button>
      </div>
      <div tabIndex={0} aria-label="스크롤 가능한 광고 화면" className="max-h-[72vh] overflow-auto overscroll-contain bg-zinc-100 p-2 focus-visible:outline-2 focus-visible:outline-primary print:max-h-none">
        <div className={cn("mx-auto bg-white shadow-sm", zoom ? "w-[1200px] max-w-none" : "w-full")}>
          {visual.frames.map((frame, frameIndex) => (
            <div key={frame.id} className="relative" style={{ aspectRatio: `${frame.width}/${frame.height}` }}>
              {/* The server returns bounded JPEG bytes, never third-party HTML. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.image} width={frame.width} height={frame.height} alt={`분석 당시 광고 화면 ${frameIndex + 1}`} className="block h-auto w-full" />
              {claims.map((claim, index) => {
                const region = claim.visualRegion;
                if (!region || region.frameId !== frame.id) return null;
                return (
                  <button key={claim.id} id={`screen-mark-${claim.id}`} type="button"
                    data-status={claim.verificationStatus} aria-pressed={selectedId === claim.id}
                    aria-label={`주장 ${index + 1}: ${claim.originalText}. ${STATUS_LABELS[claim.verificationStatus]}. 분석 보기`}
                    title={claim.originalText} onClick={() => onSelect(claim.id)}
                    style={{ left: `${region.x / 10}%`, top: `${region.y / 10}%`, width: `${region.width / 10}%`, height: `${region.height / 10}%` }}
                    className={cn("absolute z-10 scroll-m-16 cursor-pointer rounded-sm border-2 border-(--status-solid) bg-(--status-solid)/15 transition-[box-shadow,background] hover:bg-(--status-solid)/25 focus-visible:outline-4 focus-visible:outline-primary",
                      selectedId === claim.id && "z-20 ring-4 ring-primary/50 bg-(--status-solid)/25")}>
                    <span className="absolute -top-3 -left-2 grid size-6 place-items-center rounded-full border-2 border-white bg-(--status-solid) text-xs font-bold text-white shadow-md">{index + 1}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
        분석 당시의 광고 화면이에요. 이미지 글자와 표시 위치에는 인식 오차가 있을 수 있어요.
        {visual.truncated && " 긴 페이지의 앞부분만 표시했어요."}
      </p>
    </section>
  );
}
