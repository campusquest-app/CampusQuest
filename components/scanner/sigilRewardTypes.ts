export type SigilScannerReward = {
  xp: number;
  statLabel: string;
  statIncrease: number;
  leveledUp: boolean;
  levelAfter: number;
  sigilName: string;
};

export type QrScannerValidationResult =
  | { ok: false; banner: string }
  | { ok: true; reward: SigilScannerReward };
