"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, hasToken } from "@/lib/api";

const NAV = [
  { href: "/train", label: "Train" },
  { href: "/workout", label: "Workout" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export function Topbar() {
  const pathname = usePathname();
  const [handle, setHandle] = useState<string | null>(null);
  const [ci, setCi] = useState<number | null>(null);

  useEffect(() => {
    if (!hasToken()) return;
    api
      .summary()
      .then((s) => {
        setHandle(s.handle);
        setCi(s.cortex_index);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/8 bg-porcelain/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/train" className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-full bg-lime ring-2 ring-pine" />
          <span className="display text-lg font-semibold tracking-tight">CortexWatt</span>
        </Link>
        <nav className="hidden gap-1 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3 py-1.5 text-sm ${
                pathname.startsWith(n.href)
                  ? "bg-pine text-porcelain"
                  : "text-ink/70 hover:bg-ink/5"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {ci !== null && (
            <span className="num rounded-full border border-pine/25 px-3 py-1 text-sm font-medium text-pine">
              CI {ci}
            </span>
          )}
          {handle ? (
            <span className="text-sm text-ink/60">{handle}</span>
          ) : (
            <Link href="/login" className="rounded-full bg-lime px-4 py-1.5 text-sm font-semibold text-ink">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
