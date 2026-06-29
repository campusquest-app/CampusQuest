/** Shared Quad post XP reward constants and response shape (server + client). */

export const QUAD_POST_XP_AMOUNT = 10;
export const QUAD_POST_XP_DAILY_CAP = 5;
export const QUAD_POST_XP_SOURCE_TYPE = "quad_post" as const;

export type QuadPostXpReward = {
  awarded: boolean;
  xpAmount: number;
  dailyCapReached?: boolean;
};
