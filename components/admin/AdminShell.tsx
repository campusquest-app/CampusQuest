"use client";

import Link from "next/link";
import { useState } from "react";
import { ADMIN_NAV, adminSectionTitle, type AdminSectionId } from "@/lib/admin/navigation";
import { AdminGlobalSearch, type AdminSearchNavigatePayload } from "@/components/admin/AdminGlobalSearch";

export function AdminShell({
  activeSection,
  onSectionChange,
  onSearchNavigate,
  allowedEmail,
  children,
}: {
  activeSection: AdminSectionId;
  onSectionChange: (section: AdminSectionId) => void;
  onSearchNavigate: (payload: AdminSearchNavigatePayload) => void;
  allowedEmail: string | null;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function selectSection(section: AdminSectionId) {
    onSectionChange(section);
    setMobileNavOpen(false);
  }

  const sidebar = (
    <nav className="cq-admin-sidebar space-y-1" aria-label="Admin navigation">
      {ADMIN_NAV.map((item) => {
        const active = activeSection === item.id;
        return (
          <div key={item.id} className="space-y-0.5">
            <button
              type="button"
              onClick={() => selectSection(item.id)}
              className={`cq-admin-nav-item w-full ${active ? "cq-admin-nav-item--active" : ""}`}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </button>
            {item.children && active ? (
              <ul className="ml-7 space-y-0.5 border-l border-white/10 pl-2">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <span className="block py-1 text-[11px] text-white/45">{child.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="cq-admin-shell min-h-screen bg-uri-navy text-white">
      <header className="cq-admin-topbar sticky top-0 z-40 border-b border-white/10 bg-uri-navy/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="lg:hidden rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/80"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              Menu
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">CampusQuest Admin</p>
              <h1 className="truncate font-display text-lg font-bold text-white sm:text-xl">
                {adminSectionTitle(activeSection)}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/internal/moderation"
              className="hidden sm:inline-flex rounded-lg border border-uri-keaney/35 bg-uri-keaney/10 px-2.5 py-1.5 text-[11px] font-semibold text-uri-keaney hover:bg-uri-keaney/20"
            >
              Moderation workspace
            </Link>
            <Link
              href="/?tab=quad"
              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
            >
              ← Quad
            </Link>
          </div>
        </div>
        {allowedEmail ? (
          <p className="mx-auto max-w-[1400px] px-4 pb-2 text-[11px] text-white/40 sm:px-6">Signed in as {allowedEmail}</p>
        ) : null}
        <div className="mx-auto max-w-[1400px] border-t border-white/8 px-4 py-3 sm:px-6">
          <AdminGlobalSearch onNavigate={onSearchNavigate} />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className={`cq-admin-sidebar-wrap border-r border-white/10 ${mobileNavOpen ? "block" : "hidden lg:block"}`}>
          <div className="sticky top-[4.5rem] max-h-[calc(100vh-4.5rem)] overflow-y-auto p-4 lg:max-h-[calc(100vh-5rem)]">{sidebar}</div>
        </aside>

        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
