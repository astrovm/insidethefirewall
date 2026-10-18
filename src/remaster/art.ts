// Pixel art for the remaster's new threats, in the chunky style of the 2013
// virus. Each letter is one pixel. tools/pixel-art.ts turns these into SVGs.

export const palette: Record<string, string> = {
  k: "#000008",
  g: "#66cc00",
  G: "#2f7a00",
  w: "#ffffff",
  r: "#ff0000",
  R: "#b51000",
  b: "#0044cc",
  B: "#88aaff",
  s: "#c0c0c0",
  S: "#808080",
  o: "#8b4513",
  O: "#c47a3a",
  y: "#ffcc00",
};

/** A worm crawling right. Two frames, so it wriggles. */
export const worm = [
  [
    "..................kkkk..",
    ".................kggggk.",
    "..kkk....kkk....kggwwgk.",
    ".kgggk..kgggk..kgggkwgk.",
    "kgGgGgkkgGgGgkkggggggggk",
    "kgggggkkgggggkkgggggrrk.",
    ".kgggk..kgggk..kgggggk..",
    "..kkk....kkk....kkkkk...",
  ],
  [
    "..................kkkk..",
    "..kkk....kkk.....kggggk.",
    ".kgggk..kgggk...kggwwgk.",
    "kgGgGgkkgGgGgk.kgggkwgk.",
    "kgggggkkgggggkkggggggggk",
    ".kgggk..kgggk.kgggggrrk.",
    "..kkk....kkk..kgggggk...",
    "...............kkkkk....",
  ],
];

/** An error window falling from the top of the screen. */
export const popup = [
  "kkkkkkkkkkkkkkkkkkkkkk",
  "kbbbbbbbbbbbbbbbbkrrrk",
  "kbBBBBBBbbbbbbbbbkrwrk",
  "kbbbbbbbbbbbbbbbbkrrrk",
  "kkkkkkkkkkkkkkkkkkkkkk",
  "kssssssssssssssssssssk",
  "ksssrrrssssssssssssssk",
  "kssrwrwrsskkkkkkkksssk",
  "kssrrwrrsssssssssssssk",
  "kssrwrwrsskkkkkksssssk",
  "ksssrrrssssssssssssssk",
  "kssssssssssssssssssssk",
  "kssssssskkkkkkkssssssk",
  "kssssssskSySySkssssssk",
  "kssssssskkkkkkkssssssk",
  "kkkkkkkkkkkkkkkkkkkkkk",
];

/** A wooden Trojan horse on wheels, facing right. */
export const trojan = [
  "...............kk...",
  "..............kOOk..",
  ".............kOOOOk.",
  ".............kOkOOOk",
  ".............kOOOOOk",
  "............kOOOkkk.",
  "...........kOOOk....",
  ".kk.......kOOOOk....",
  "kOOk.kkkkkOOOOk.....",
  ".kOkOOOOOOOOOOk.....",
  "..kOoOOoOOoOOOk.....",
  "..kOoOOoOOoOOOk.....",
  "..kOOOOOOOOOOOk.....",
  "...kkkkkkkkkkk......",
  "....kOk....kOk......",
  "....kOk....kOk......",
  "...kSSSk..kSSSk.....",
  "...kSkSk..kSkSk.....",
  "....kkk....kkk......",
];

/** Rows of pixels to an SVG drawn with one rectangle per run of a color. */
export function toSvg(rows: string[]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const rects: string[] = [];
  for (const [y, row] of rows.entries()) {
    let x = 0;
    while (x < row.length) {
      const color = palette[row[x] ?? "."];
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (color) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`);
      x = end;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${rows.length}" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">`,
    ...rects.map((rect) => `  ${rect}`),
    "</svg>",
    "",
  ].join("\n");
}

/** The SVG files for every new costume, by file name. */
export function artFiles(): Map<string, string> {
  return new Map([
    ["worm1.svg", toSvg(worm[0]!)],
    ["worm2.svg", toSvg(worm[1]!)],
    ["popup.svg", toSvg(popup)],
    ["trojan.svg", toSvg(trojan)],
  ]);
}
