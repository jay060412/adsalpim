"use client";

import { ArrowRight, CircleAlert, Link2 } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useId, useRef, useState } from "react";
import { checkUrlInput } from "@/lib/url-input";
import { cn } from "@/lib/utils";

export function UrlForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const shake = useAnimationControls();
  const [focused, setFocused] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = checkUrlInput(value);
    if (!result.ok) {
      setError(result.message);
      // 잘못된 입력일 때만 살짝 흔들어 알려 준다.
      void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35 } });
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSubmit(result.url);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <motion.div animate={shake} className="relative isolate">
        {/* 포커스 시 입력창 뒤로 번지는 은은한 빛 */}
        <motion.div
          aria-hidden="true"
          className="absolute -inset-2 -z-10 rounded-[1.75rem] bg-gradient-to-r from-primary/25 via-primary/10 to-mint/30 blur-xl"
          initial={false}
          animate={{ opacity: focused ? 1 : 0, scale: focused ? 1 : 0.97 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />

        <div
          className={cn(
            "flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-raised transition-[border-color,box-shadow] duration-300 sm:flex-row sm:items-center",
            error
              ? "border-destructive/60"
              : focused
                ? "border-primary/60 ring-4 ring-primary/10"
                : "border-border hover:border-primary/30",
          )}
        >
          <label className="flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-4">
            <Link2
              aria-hidden="true"
              className={cn(
                "size-5 shrink-0 transition-colors duration-300",
                focused ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="sr-only">분석할 광고 링크</span>
            <input
              ref={inputRef}
              type="url"
              inputMode="url"
              name="url"
              autoComplete="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="https://example.com/product"
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                if (error) setError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-12 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 sm:h-14 sm:text-[1.0625rem]"
            />
          </label>

          <motion.button
            type="submit"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[0.9375rem] font-semibold text-primary-foreground shadow-[0_8px_20px_-10px] shadow-primary/60 transition-[background-color,box-shadow] duration-200 hover:bg-primary/90 hover:shadow-[0_12px_24px_-10px] hover:shadow-primary/70 sm:h-14 sm:px-7 sm:text-base"
          >
            AI로 광고 분석하기
            <ArrowRight
              aria-hidden="true"
              className="size-4.5 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </motion.button>
        </div>
      </motion.div>

      <div className="mt-3 min-h-6" aria-live="polite">
        {error && (
          <motion.p
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start justify-center gap-1.5 text-sm font-medium text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </motion.p>
        )}
      </div>
    </form>
  );
}
