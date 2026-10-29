let generation = 0;

/** Bump on sign-out or account change so an in-flight private list cannot render. */
export function invalidateAnonymousPostList(): void {
  generation += 1;
}

export function anonymousPostListGeneration(): number {
  return generation;
}

export function isCurrentAnonymousPostList(startedAt: number): boolean {
  return startedAt === generation;
}
