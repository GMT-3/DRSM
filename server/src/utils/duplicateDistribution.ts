// Pure duplicate-detection for Distribution Confirmation (Modules.md:
// "QR scan distribution flow + duplicate-delivery flagging"). A household
// receiving the same resourceType twice inside the same short window is
// far more likely to be a re-scan/mistake than a genuine second delivery,
// so it's flagged rather than silently recorded or silently blocked —
// Roles.md's tracking principle is that nothing gets hidden, everything
// gets recorded with its true state.
export interface PriorDistribution {
  resourceType: string;
  distributedAt: Date;
}

export function isDuplicateDistribution(
  existing: PriorDistribution[],
  candidate: { resourceType: string; distributedAt: Date },
  windowHours = 24,
): boolean {
  const windowMs = windowHours * 60 * 60 * 1000;
  return existing.some(
    (r) => r.resourceType === candidate.resourceType && Math.abs(candidate.distributedAt.getTime() - r.distributedAt.getTime()) <= windowMs,
  );
}
