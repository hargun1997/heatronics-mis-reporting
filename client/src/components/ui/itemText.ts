/** A Fix how-to cut to its first step: "1. Open X. 2. Do Y." → "Open X." (the full steps open on the item). */
export const firstStep = (how: string) => how.replace(/^\s*1\.\s*/, '').split(/\s+2\.\s/)[0];
