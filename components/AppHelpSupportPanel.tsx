"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  HelpCircle,
  Mail,
  MessageCircleWarning,
  QrCode,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { textMatchesPostSearch } from "@/lib/postTerminology";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { DrawerSubPanelShell } from "./DrawerSubPanelShell";

type HelpArticle = {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  body: string[];
  keywords: string[];
};

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "how-campusquest",
    title: "How CampusQuest Works",
    icon: Sparkles,
    summary: "Your campus life, leveled up.",
    keywords: ["campus", "quad", "feed", "social", "start", "post", "posts", "field note", "field notes"],
    body: [
      "CampusQuest turns everyday campus moments into progression. Post on The Quad, complete quests, scan QR codes, and grow your character.",
      "Your Profile tab tracks XP, stats, streaks, and gear. The bottom nav keeps Home, Messages, Map, Leaderboard, and Profile one tap away.",
      "Explore friends, guilds, events, and boss battles from the menu to find more ways to earn XP.",
    ],
  },
  {
    id: "how-xp",
    title: "How XP Works",
    icon: Zap,
    summary: "Earn XP from real campus activity.",
    keywords: ["xp", "level", "stats", "progress", "points"],
    body: [
      "You earn XP by logging activities, finishing quests, engaging on The Quad, and scanning official campus QR codes.",
      "XP fills your level bar. Leveling up makes your Ram stronger and unlocks more of the world.",
      "Different actions boost different stats — workouts raise Strength, study raises Knowledge, social posts raise Social, and more.",
    ],
  },
  {
    id: "how-qr",
    title: "How QR Scanning Works",
    icon: QrCode,
    summary: "Scan official codes for rewards.",
    keywords: ["qr", "scan", "camera", "code", "gym"],
    body: [
      "Open CQ Scanner from Quest Board or other in-app scan entry points. Point your camera at an official CampusQuest QR code on campus.",
      "Valid scans grant XP and may log a linked activity automatically. Each code has rules — some can only be scanned once per day.",
      "If the camera is blocked, enable permissions in Settings → QR Scanner Permissions or your device settings.",
    ],
  },
  {
    id: "boss-battles",
    title: "Boss Battles Guide",
    icon: Swords,
    summary: "Team up to defeat campus bosses.",
    keywords: ["boss", "battle", "fight", "loot", "hp"],
    body: [
      "Boss Battles are cooperative challenges. Log relevant activities to deal damage and help your campus take down the boss.",
      "When a boss falls, eligible players can earn loot, XP, and bragging rights on the leaderboard.",
      "Check the Boss Battle tab for active threats, your contribution, and time remaining.",
    ],
  },
  {
    id: "guilds",
    title: "Guilds Guide",
    icon: Shield,
    summary: "Join a guild for shared goals.",
    keywords: ["guild", "team", "group", "bonus", "race"],
    body: [
      "Guilds let Rams team up for bonus XP, races, and shared progression.",
      "Find guilds from the Guilds item in the side menu. Your guild tag appears on your profile when you join.",
      "Assist posts on The Quad and guild activities can earn extra rewards for your whole team.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    icon: HelpCircle,
    summary: "Quick answers to common questions.",
    keywords: ["faq", "question", "help", "account", "reset"],
    body: [
      "Why didn’t my scan work? The code may be expired, already used today, or outside scan hours. Try again in good lighting.",
      "How do I change my name or avatar? Open Settings → Profile & Character or edit from your Profile tab.",
      "Is CampusQuest only for one school? Access may be campus-specific. Verify your school email when prompted.",
    ],
  },
];

const SUPPORT_LINKS: { id: string; label: string; description: string; icon: LucideIcon; href: string }[] = [
  {
    id: "report",
    label: "Report a Problem",
    description: "Flag bugs or unsafe behavior",
    icon: MessageCircleWarning,
    href: "mailto:support@campusquest.app?subject=CampusQuest%20Report",
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
];

export function AppHelpSupportPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const visibleArticles = useMemo(() => {
    return HELP_ARTICLES.filter((article) => {
      if (article.id === "boss-battles" && !FEATURE_FLAGS.bossBattles) return false;
      return true;
    }).map((article) => {
      if (FEATURE_FLAGS.bossBattles) return article;
      if (article.id === "how-campusquest") {
        return {
          ...article,
          body: article.body.map((line) =>
            line.includes("boss battles")
              ? "Explore friends, guilds, and events from the menu to find more ways to earn XP."
              : line,
          ),
        };
      }
      if (article.id === "how-xp" && !FEATURE_FLAGS.manualLog) {
        return {
          ...article,
          body: article.body.map((line) =>
            line.includes("logging activities")
              ? "You earn XP by finishing quests, engaging on The Quad, and scanning official campus QR codes."
              : line,
          ),
        };
      }
      return article;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return visibleArticles;
    return visibleArticles.filter(
      (a) =>
        textMatchesPostSearch(a.title, q) ||
        textMatchesPostSearch(a.summary, q) ||
        a.keywords.some((k) => textMatchesPostSearch(k, q) || k.includes(q.toLowerCase())) ||
        a.body.some((paragraph) => textMatchesPostSearch(paragraph, q)),
    );
  }, [query, visibleArticles]);

  const activeArticle = activeArticleId
    ? visibleArticles.find((a) => a.id === activeArticleId) ?? null
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

        <p className="flex items-center justify-center gap-1.5 px-2 pt-1 text-[11px] text-white/30">
          <Trophy className="h-3.5 w-3.5" />
          Need more help? Contact support anytime.
        </p>
      </div>
    </DrawerSubPanelShell>
  );
}
