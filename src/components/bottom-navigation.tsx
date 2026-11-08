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
  const { view, pathname, busy, dark, setError, setNotice } = useWorkspace();
  const selected = view === "concepts" || view === "detail" ? "library" : view;
  const hidden = dark || !parseWorkspacePath(pathname);
  const nav = useRef<HTMLElement>(null);
  const links = useRef(new Map<View, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    animate: false,
  });

  useLayoutEffect(() => {
    if (hidden || !nav.current) return;
    let frame = 0;
    // 이름이 펼쳐지거나 화면 크기가 바뀌어도 선택 배경을 버튼에 맞춥니다.
    const measure = () => {
      const link = links.current.get(selected);
      const container = nav.current;
      if (!link || !container) return;
      const box = link.getBoundingClientRect();
      const left = box.left - container.getBoundingClientRect().left;
      setIndicator((previous) =>
        Math.abs(previous.left - left) < 0.1 &&
        Math.abs(previous.width - box.width) < 0.1
          ? previous
          : { left, width: box.width, animate: previous.width > 0 },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(nav.current);
    for (const link of links.current.values()) observer.observe(link);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [selected, hidden]);

  if (hidden) return null;
  return (
    <nav
      ref={nav}
      className="app-navigation"
      aria-label="주 메뉴"
      data-ready={indicator.width > 0}
    >
      <span
        className="navigation-indicator"
        aria-hidden="true"
        data-animate={indicator.animate}
        style={{
          width: indicator.width,
          transform: `translate3d(${indicator.left}px, 0, 0)`,
        }}
      />
      {items.map((item) => (
        <Link
          key={item.view}
          href={workspacePath({ view: item.view })}
          ref={(element) => {
            if (element) links.current.set(item.view, element);
            else links.current.delete(item.view);
          }}
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
