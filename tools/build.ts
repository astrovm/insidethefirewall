// Builds the game into docs/, which GitHub Pages serves. docs/classic/ is the
// original Scratch export and is left alone.
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

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
  await cp(join(root, "src/manifest.webmanifest"), join(out, "manifest.webmanifest"));
  await cp(join(assets, "icons"), join(out, "assets/icons"), { recursive: true });
  await cp(join(root, "icon.png"), join(out, "icon.png"));
  await cp(join(assets, "sounds"), join(out, "assets/sounds"), { recursive: true });
  await cp(join(assets, "sedan"), join(out, "assets/sedan"), { recursive: true });
  await cp(join(assets, "player"), join(out, "assets/player"), { recursive: true });
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
  await writeServiceWorker();
}

/**
 * The service worker keeps every file of the game, so the installed app
 * works offline. Its cache is named after the files' contents, so a new
 * version replaces the old one.
 */
async function writeServiceWorker(): Promise<void> {
  const files = (await readdir(out, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(out, join(entry.parentPath, entry.name)))
    .filter((file) => !file.startsWith("classic") && file !== "sw.js" && file !== "CNAME" && file !== ".nojekyll")
    .sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update(await readFile(join(out, file)));
  const version = hash.digest("hex").slice(0, 12);
  const sw = (await readFile(join(root, "src/sw.js"), "utf8"))
    .replace('"VERSION"', JSON.stringify(version))
    .replace("[/* FILES */]", JSON.stringify(["./", ...files]));
  await writeFile(join(out, "sw.js"), sw);
}

if (import.meta.main) {
  await build();
  console.log("Built the game into docs/");
}
