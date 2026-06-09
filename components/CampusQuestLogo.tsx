import { CAMPUSQUEST_LOGO_ALT, CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";

export type CampusQuestLogoVariant = "header" | "auth" | "splash" | "drawer";

const VARIANT_CLASS: Record<CampusQuestLogoVariant, string> = {
  header: "cq-logo cq-logo--header",
  auth: "cq-logo cq-logo--auth",
  splash: "welcome-splash-word cq-logo cq-logo--splash",
  drawer: "cq-logo cq-logo--drawer",
};

export function CampusQuestLogo({
  variant = "auth",
  className = "",
  priority = false,
}: {
  variant?: CampusQuestLogoVariant;
  className?: string;
  /** Set on above-the-fold branding (splash, auth). */
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand PNG must preserve exact colors/proportions
    <img
      src={CAMPUSQUEST_LOGO_SRC}
      alt={CAMPUSQUEST_LOGO_ALT}
      width={512}
      height={512}
      className={`${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
