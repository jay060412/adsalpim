"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 시스템 설정을 따른다.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  // 개발 모드의 Strict Mode 재마운트가 <html> 속성을 초기화하므로 다시 적용한다. 운영 빌드에서는 변화가 없다.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 저장에 실패해도 이번 방문 동안은 선택한 테마가 유지된다.
    }
  }

  // 아이콘은 CSS로만 전환한다. 서버가 그린 HTML과 클라이언트 상태가 어긋날 일이 없다.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="다크 모드 전환"
      title="다크 모드 전환"
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground"
    >
      <Sun className="size-[1.05rem] scale-100 rotate-0 transition-transform duration-300 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-[1.05rem] scale-0 rotate-90 transition-transform duration-300 dark:scale-100 dark:rotate-0" />
    </button>
  );
}
