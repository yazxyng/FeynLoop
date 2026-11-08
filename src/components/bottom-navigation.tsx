"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChartNoAxesColumn, Home, Layers, Plus, UserRound } from "lucide-react";
import {
  parseWorkspacePath,
  workspacePath,
  type View,
} from "@/lib/workspace-routes";
import { useWorkspace } from "./workspace-provider";

const items = [
  { view: "dashboard" as View, label: "오늘", icon: Home },
  { view: "library" as View, label: "카드함", icon: Layers },
  { view: "upload" as View, label: "등록", icon: Plus },
  { view: "records" as View, label: "기록", icon: ChartNoAxesColumn },
  { view: "profile" as View, label: "마이페이지", icon: UserRound },
];

export default function BottomNavigation() {
  const {
    view,
    pathname,
    busy,
    dark,
    userId,
    demoAccess,
    setError,
    setNotice,
  } = useWorkspace();
  const selected = view === "concepts" || view === "detail" ? "library" : view;
  const hidden =
    dark || !parseWorkspacePath(pathname) || (!userId && !demoAccess);
  const navRef = useRef<HTMLElement>(null);
  const [highlight, setHighlight] = useState<{
    left: number;
    width: number;
    animate: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (hidden || !nav) {
      setHighlight(null);
      return;
    }
    // 버튼의 실제 위치를 측정해 흰 배경만 이동합니다. 이름은 선택 시 바로 표시합니다.
    const measure = () => {
      const link = nav.querySelector<HTMLAnchorElement>(
        '[aria-current="page"]',
      );
      if (!link) return;
      const box = link.getBoundingClientRect();
      const left = box.left - nav.getBoundingClientRect().left;
      setHighlight((previous) =>
        previous &&
        Math.abs(previous.left - left) < 0.1 &&
        Math.abs(previous.width - box.width) < 0.1
          ? previous
          : { left, width: box.width, animate: previous !== null },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    nav.querySelectorAll("a").forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [selected, hidden]);

  if (hidden) return null;
  return (
    <nav
      ref={navRef}
      className="app-navigation"
      aria-label="주 메뉴"
      data-ready={Boolean(highlight)}
    >
      {highlight && (
        <span
          className="navigation-highlight"
          aria-hidden="true"
          data-animate={highlight.animate}
          style={{
            width: highlight.width,
            transform: `translateX(${highlight.left}px)`,
          }}
        />
      )}
      {items.map((item) => (
        <Link
          key={item.view}
          href={workspacePath({ view: item.view })}
          className={selected === item.view ? "active" : ""}
          aria-current={selected === item.view ? "page" : undefined}
          aria-label={item.label}
          aria-disabled={busy || undefined}
          onClick={(event) => {
            if (busy) event.preventDefault();
            else {
              setError("");
              setNotice("");
            }
          }}
        >
          <item.icon size={21} aria-hidden="true" />
          <span className="navigation-label" aria-hidden="true">
            {item.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
