"use client";

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
  if (dark || !parseWorkspacePath(pathname) || (!userId && !demoAccess))
    return null;
  return (
    <nav className="app-navigation" aria-label="주 메뉴">
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
