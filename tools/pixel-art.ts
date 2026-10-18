// Writes the remaster's pixel art from src/remaster/art.ts into
// src/assets/costumes/. Run it after changing the art.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { artFiles } from "../src/remaster/art.ts";

const costumes = join(import.meta.dir, "../src/assets/costumes");
for (const [file, svg] of artFiles()) await writeFile(join(costumes, file), svg);
console.log("Wrote the pixel art into src/assets/costumes/");
