"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  HelpCircle,
  Mail,
  MessageCircleWarning,
  Search,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { textMatchesPostSearch } from "@/lib/postTerminology";
import { DrawerSubPanelShell } from "./DrawerSubPanelShell";

type HelpArticle = {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  body: string[];
  keywords: string[];
};

/** Help copy for the live 1.0 product (gamification surfaces are disabled). */
const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "how-campusquest",
    title: "How CampusQuest Works",
    icon: Sparkles,
    summary: "Your campus, connected.",
    keywords: ["campus", "quad", "feed", "social", "start", "post", "posts", "map", "events", "perks"],
    body: [
      "CampusQuest is your home for posts, campus events, the map, organizations, and Student Perks.",
      "The bottom nav keeps Home, Perks, Map, Events, and Profile one tap away.",
      "Open the menu for friends, notifications, and account settings.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    icon: HelpCircle,
    summary: "Quick answers to common questions.",
    keywords: ["faq", "question", "help", "account", "reset", "block", "report"],
    body: [
      "How do I change my name or avatar? Edit them from your Profile tab.",
      "Is CampusQuest only for one school? Access may be campus-specific. Verify your school email when prompted.",
      "Where are student deals? Open Perks from the bottom navigation.",
      "How do I report or block someone? Use ••• on a post, comment, profile, or conversation, or open Settings → Safety.",
    ],
  },
];

const SUPPORT_LINKS: { id: string; label: string; description: string; icon: LucideIcon; href: string }[] = [
  {
    id: "report",
    label: "Report a Problem",
    description: "Flag bugs or unsafe behavior",
    icon: MessageCircleWarning,
    href: "mailto:support@campusquestapp.com?subject=CampusQuest%20Report",
  },
  {
    id: "contact",
    label: "Contact Support",
    description: "Email the CampusQuest team",
    icon: Mail,
    href: "/support",
  },
  {
    id: "guidelines",
    label: "Community Guidelines",
    description: "How we keep The Quad safe",
    icon: BookOpen,
    href: "/legal/community-guidelines",
  },
  {
    id: "data-consent",
    label: "Data & Personalization Consent",
    description: "How onboarding answers personalize CampusQuest",
    icon: Shield,
    href: "/legal/data-consent",
  },
];

export function AppHelpSupportPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return HELP_ARTICLES;
    return HELP_ARTICLES.filter(
      (a) =>
        textMatchesPostSearch(a.title, q) ||
        textMatchesPostSearch(a.summary, q) ||
        a.keywords.some((k) => textMatchesPostSearch(k, q) || k.includes(q.toLowerCase())) ||
        a.body.some((paragraph) => textMatchesPostSearch(paragraph, q)),
    );
  }, [query]);

  const activeArticle = activeArticleId
    ? HELP_ARTICLES.find((a) => a.id === activeArticleId) ?? null
    : null;

  if (activeArticle) {
    const Icon = activeArticle.icon;
    return (
      <DrawerSubPanelShell title={activeArticle.title} onBack={() => setActiveArticleId(null)}>
        <article className="rounded-2xl border border-white/[0.08] bg-cq-card/70 p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="text-sm text-white/55">{activeArticle.summary}</p>
          </div>
          <div className="space-y-3">
            {activeArticle.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="text-sm leading-relaxed text-white/78">
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </DrawerSubPanelShell>
    );
  }

  return (
    <DrawerSubPanelShell title="Help & Support" onBack={onBack}>
      <div className="space-y-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help…"
            className="w-full rounded-xl border border-white/[0.1] bg-black/25 py-2.5 pl-10 pr-3 text-sm text-white placeholder-white/35 focus:border-cyan-400/35 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
          />
        </label>

        <section>
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/45">Guides</p>
          <ul className="space-y-2">
            {filtered.length === 0 ? (
              <li className="rounded-2xl border border-white/[0.08] bg-cq-card/50 px-4 py-6 text-center text-sm text-white/45">
                No guides match your search.
              </li>
            ) : (
              filtered.map((article) => {
                const Icon = article.icon;
                return (
                  <li key={article.id}>
                    <button
                      type="button"
                      onClick={() => setActiveArticleId(article.id)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-cq-card/60 px-3 py-3.5 text-left transition hover:border-cyan-400/20 hover:bg-cq-card/80 active:scale-[0.995] touch-manipulation"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-200/90">
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white/92">{article.title}</span>
                        <span className="block text-[11px] text-white/42">{article.summary}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/25 group-hover:text-white/45" />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section>
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/45">Support</p>
          <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-cq-card/60">
            {SUPPORT_LINKS.map((link, index) => {
              const Icon = link.icon;
              const isLast = index === SUPPORT_LINKS.length - 1;
              return (
                <li key={link.id} className={!isLast ? "border-b border-white/[0.06]" : undefined}>
                  <a
                    href={link.href}
                    className="group flex items-center gap-3 px-3 py-3.5 transition hover:bg-white/[0.04]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-200/90">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white/92">{link.label}</span>
                      <span className="block text-[11px] text-white/40">{link.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="px-2 pt-1 text-center text-[11px] text-white/30">
          Need more help? Contact support anytime.
        </p>
      </div>
    </DrawerSubPanelShell>
  );
}
