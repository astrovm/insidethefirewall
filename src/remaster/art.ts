// Pixel art for the remaster's power-ups, in the chunky style of the 2013
// virus. Each letter is one pixel. tools/pixel-art.ts turns these into SVGs.

export const palette: Record<string, string> = {
  k: "#000008",
  w: "#ffffff",
  r: "#ff0000",
  R: "#b51000",
  s: "#c0c0c0",
  S: "#808080",
  b: "#0044cc",
  B: "#88aaff",
  c: "#66ccff",
  o: "#ff9900",
  y: "#ffcc00",
  O: "#cc6600",
};

/** Two fuel tanks with red caps. */
export const jetpack = [
  ".kkk....kkk.",
  "krrrk..krrrk",
  "kRRRk..kRRRk",
  "kswsk..kswsk",
  "kswSkkkkswSk",
  "ksSSkSSksSSk",
  "ksSSkSSksSSk",
  "ksSSkkkksSSk",
  "ksSSk..ksSSk",
  "kSSSk..kSSSk",
  ".kSk....kSk.",
  ".kkk....kkk.",
];

/** A shield, blue like the 2013 player's shirt. */
export const shield = [
  ".kkkkkkkkkk.",
  "kbbbbbbbbbbk",
  "kbwwBbbbbbbk",
  "kbwBbbbbbbbk",
  "kbBbbbbbbbbk",
  "kbbbbbbbbbbk",
  "kbbbbbbbbbbk",
  ".kbbbbbbbbk.",
  ".kbbbbbbbbk.",
  "..kbbbbbbk..",
  "...kbbbbk...",
  "....kkkk....",
];

/** A snowflake. */
export const freeze = [
  ".....kk.....",
  "..k.kcck.k..",
  ".kck.kk.kck.",
  "..kckwwkck..",
  ".k.kcwwck.k.",
  "kcwwwccwwwck",
  "kcwwwccwwwck",
  ".k.kcwwck.k.",
  "..kckwwkck..",
  ".kck.kk.kck.",
  "..k.kcck.k..",
  ".....kk.....",
];

/** The red pill, lying at an angle. */
export const pill = [
  "............",
  "......kkk...",
  ".....krrwk..",
  "....krrrrrk.",
  "...krrrrrrk.",
  "..kRrrrrrk..",
  ".kRRRrrrk...",
  ".kRRRRrk....",
  ".kRRRRk.....",
  "..kRRk......",
  "...kk.......",
  "............",
];

/** Sonic's red shoe, with its white strap. */
export const shoes = [
  "............",
  "..kkkk......",
  ".kRrrrk.....",
  ".kRrrrrkk...",
  ".kwwwwrrrkk.",
  ".kRrrwrrrrrk",
  ".kRrrwrrrrrk",
  ".kRrrrrrrrrk",
  "kwwwwwwwwwwk",
  "kSSSSSSSSSSk",
  ".kkkkkkkkkk.",
  "............",
];

/** Portal's portal gun: white, with a blue glow at the tip. */
export const portal = [
  "............",
  "....kkkkk...",
  "..kkwwwwwk..",
  ".kBkwsswwwk.",
  "kBbkwwwwwwwk",
  "kBbkwsSSwwwk",
  ".kBkwwwwwwk.",
  "..kkwwkkkk..",
  "....kwk.....",
  "....kwk.....",
  "....kkk.....",
  "............",
];

/** Breakout: rows of bricks, the ball and the paddle. */
export const ball = [
  "............",
  "rrrr.oooo.yy",
  "RRRR.OOOO.oo",
  "............",
  "yy.rrrr.oooo",
  "oo.RRRR.OOOO",
  "............",
  "......kk....",
  ".....kwwk...",
  "......kk....",
  "..kkkkkkkk..",
  "..kssssssk..",
];

/** Flame out of the jetpack's two nozzles, two frames so it flickers. */
export const flame = [
  [".yoy....yoy.", ".yoy....yoy.", "..o......o..", "..r......r.."],
  ["..y......y..", ".oyo....oyo.", "..o......o..", "..r......r.."],
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

/** The SVG files for the power-ups and the flame, by file name. */
export function artFiles(): Map<string, string> {
  return new Map([
    ["jetpack.svg", toSvg(jetpack)],
    ["shield.svg", toSvg(shield)],
    ["freeze.svg", toSvg(freeze)],
    ["pill.svg", toSvg(pill)],
    ["shoes.svg", toSvg(shoes)],
    ["portal.svg", toSvg(portal)],
    ["ball.svg", toSvg(ball)],
    ["flame1.svg", toSvg(flame[0]!)],
    ["flame2.svg", toSvg(flame[1]!)],
  ]);
}
