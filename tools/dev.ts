// Builds the game, serves docs/ and rebuilds when src/ changes.
import { watch } from "node:fs";
import { join, normalize } from "node:path";
import { build } from "./build.ts";

const root = join(import.meta.dir, "..");
const docs = join(root, "docs");
const portIndex = process.argv.indexOf("--port");
const port = portIndex > 0 ? Number(process.argv[portIndex + 1]) : 8000;

await build();
let timer: ReturnType<typeof setTimeout> | undefined;
watch(join(root, "src"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => build().then(() => console.log("Rebuilt"), console.error), 100);
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = Bun.file(normalize(join(docs, path)));
    if (!file.name?.startsWith(docs) || !(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});
console.log(`Serving http://${server.hostname}:${server.port}/`);
