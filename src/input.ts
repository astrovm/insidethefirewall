/** DOM key names to Scratch key names. */
export function scratchKey(key: string): string | null {
  const named: Record<string, string> = {
    " ": "space",
    ArrowUp: "up arrow",
    ArrowDown: "down arrow",
    ArrowLeft: "left arrow",
    ArrowRight: "right arrow",
  };
  if (key in named) return named[key] ?? null;
  return key.length === 1 ? key.toLowerCase() : null;
}
