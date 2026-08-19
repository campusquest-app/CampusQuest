export type AdminSectionId =
  | "dashboard"
  | "moderation"
  | "organizations"
  | "urinvolved"
  | "analytics"
  | "audit"
  | "legal"
  | "system"
  | "quests"
  | "users";

export type ModerationTabId = "messages" | "content" | "safety" | "appeals";

export type OrganizationsTabId = "requests" | "controls";

export type AdminNavItem = {
  id: AdminSectionId;
  label: string;
  icon: string;
  children?: Array<{ id: string; label: string }>;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  {
    id: "moderation",
    label: "Moderation",
    icon: "🧯",
    children: [
      { id: "messages", label: "Reports Queue" },
      { id: "content", label: "Content Reports" },
      { id: "safety", label: "User Safety" },
      { id: "appeals", label: "Appeals" },
    ],
  },
  {
    id: "organizations",
    label: "Organizations",
    icon: "🏛",
    children: [
      { id: "requests", label: "Organization Requests" },
      { id: "controls", label: "Ownership Controls" },
    ],
  },
  {
    id: "urinvolved",
    label: "URInvolved",
    icon: "📅",
    children: [
      { id: "sync", label: "Sync Status" },
      { id: "events", label: "Imported Events" },
      { id: "orgs", label: "Imported Organizations" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "📈",
    children: [
      { id: "pilot", label: "Pilot Analytics" },
      { id: "engagement", label: "Engagement Metrics" },
    ],
  },
  {
    id: "audit",
    label: "Audit Center",
    icon: "🧾",
    children: [
      { id: "logs", label: "Audit Logs" },
      { id: "actions", label: "Admin Actions" },
    ],
  },
  {
    id: "legal",
    label: "Legal",
    icon: "⚖",
    children: [
      { id: "policy", label: "Policy Versions" },
      { id: "consent", label: "Re-consent Controls" },
    ],
  },
  {
    id: "quests",
    label: "Quests",
    icon: "🎯",
    children: [
      { id: "manage", label: "Quest Management" },
      { id: "templates", label: "Templates" },
    ],
  },
  {
    id: "users",
    label: "Users",
    icon: "👤",
    children: [
      { id: "directory", label: "Student Directory" },
      { id: "xp", label: "XP Management" },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "🔧",
    children: [
      { id: "preview", label: "Backend Preview" },
      { id: "tools", label: "Internal Tools" },
      { id: "auth-qa", label: "Authentication QA" },
    ],
  },
];

export function adminSectionTitle(id: AdminSectionId): string {
  return ADMIN_NAV.find((item) => item.id === id)?.label ?? "Admin";
}
