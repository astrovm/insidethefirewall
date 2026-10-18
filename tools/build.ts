// Builds the game into docs/, which GitHub Pages serves. docs/classic/ is the
// original Scratch export and is left alone.
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(root, "docs");
const assets = join(root, "src/assets");

export async function build(): Promise<void> {
  for (const entry of await readdir(out).catch(() => [])) {
    if (entry !== "classic") await rm(join(out, entry), { recursive: true, force: true });
  }
  await mkdir(join(out, "assets/costumes"), { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(root, "src/main.ts")],
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, "Build failed");
  const [script] = result.outputs;
  if (!script) throw new Error("Build produced no script");
  await writeFile(join(out, "game.js"), await script.text());

  await cp(join(root, "src/index.html"), join(out, "index.html"));
  await cp(join(root, "icon.png"), join(out, "icon.png"));
  await cp(join(assets, "sounds"), join(out, "assets/sounds"), { recursive: true });
  await cp(join(assets, "fonts"), join(out, "assets/fonts"), { recursive: true });

  // SVG costumes drawn as images can't see the page's fonts, so embed the
  // font Scratch uses for "Sans Serif" text, the same way Scratch does.
  const font = (await readFile(join(assets, "fonts/noto-sans-medium.woff2"))).toString("base64");
  const fontFace = `<defs><style>@font-face{font-family:"Sans Serif";src:url(data:font/woff2;base64,${font}) format("woff2")}</style></defs>`;
  for (const file of await readdir(join(assets, "costumes"))) {
    const source = join(assets, "costumes", file);
    const target = join(out, "assets/costumes", file);
    if (!file.endsWith(".svg")) {
      await cp(source, target);
      continue;
    }
    let svg = await readFile(source, "utf8");
    if (svg.includes('font-family="Sans Serif"')) svg = svg.replace(/<svg\b[^>]*>/, (tag) => tag + fontFace);
    await writeFile(target, svg);
  }
}

if (import.meta.main) {
  await build();
  console.log("Built the game into docs/");
}
