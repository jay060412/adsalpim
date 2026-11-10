"use client";

import { motion } from "motion/react";

/** 아주 느리게 움직이는 블루·민트 빛과 옅은 점 격자. 콘텐츠를 방해하지 않을 만큼만 보인다. */
export function HeroBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden"
    >
      <div className="absolute inset-0 bg-dot-grid opacity-50 [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,black,transparent)] dark:opacity-40" />
      <motion.div
        className="absolute -top-48 left-1/2 size-[38rem] -translate-x-[78%] rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        animate={{ x: [0, 48, 0], y: [0, 28, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -top-32 left-1/2 size-[30rem] translate-x-[12%] rounded-full bg-mint/12 blur-3xl dark:bg-mint/10"
        animate={{ x: [0, -40, 0], y: [0, 36, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
