import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";

export type SigilScannerReward = {
  xp: number;
  statLabel: string;
  statIncrease: number;
  leveledUp: boolean;
  levelAfter: number;
  sigilName: string;
  milestonesUnlocked?: string[];
  /** When XP is 0, controls what the victory overlay shows instead of "+0 XP". */
  successVariant?: "xp" | "check_in" | "quest_complete" | "already_claimed";
};

export type QrScannerValidationResult =
  | { ok: false; banner: string; alreadyClaimed?: boolean }
  | {
      ok: true;
      reward: SigilScannerReward;
      /** Parent shows RPG XP overlay instead of sigil victory */
      suppressVictoryOverlay?: boolean;
      /** @deprecated Use xpSession — scanner runs cinematic then hands off */
      handoffToXpOverlay?: boolean;
      /** XP overlay session — scanner sequences cinematic before parent mounts overlay */
      xpSession?: ActivityXPGainSession;
      questCompleted?: {
        questId: string;
        questName: string;
        icon: string;
        xpReward: number;
      } | null;
    };
