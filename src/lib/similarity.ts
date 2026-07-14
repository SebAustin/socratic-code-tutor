export function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function lineSimilarity(left: string, right: string): number {
  const a = normalizeLine(left);
  const b = normalizeLine(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
