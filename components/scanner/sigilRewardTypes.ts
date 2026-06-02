import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";

export type SigilScannerReward = {
  xp: number;
  statLabel: string;
  statIncrease: number;
  leveledUp: boolean;
  levelAfter: number;
  sigilName: string;
  milestonesUnlocked?: string[];
};

export type QrScannerValidationResult =
  | { ok: false; banner: string }
  | {
      ok: true;
      reward: SigilScannerReward;
      /** Parent shows RPG XP overlay instead of sigil victory */
      suppressVictoryOverlay?: boolean;
      /** @deprecated Use xpSession — scanner runs cinematic then hands off */
      handoffToXpOverlay?: boolean;
      /** XP overlay session — scanner sequences cinematic before parent mounts overlay */
      xpSession?: ActivityXPGainSession;
    };
