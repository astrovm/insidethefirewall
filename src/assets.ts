import { applyMask, type Costume } from "./engine/sprite.ts";

const MASK_SCALE = 2;

/** Downloads every file, reporting progress across all of them. */
export async function fetchAll(files: string[], onProgress: (fraction: number) => void): Promise<Map<string, ArrayBuffer>> {
  const loaded = new Map<string, number>();
  const totals = new Map<string, number>();
  const report = () => {
    const total = [...totals.values()].reduce((a, b) => a + b, 0);
    const done = [...loaded.values()].reduce((a, b) => a + b, 0);
    if (totals.size === files.length && total > 0) onProgress(Math.min(1, done / total));
  };
  const entries = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(`assets/${file}`);
      if (!response.ok || !response.body) throw new Error(`Could not load ${file} (HTTP ${response.status})`);
      totals.set(file, Number(response.headers.get("content-length")) || 1);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
        loaded.set(file, size);
        report();
      }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      totals.set(file, size);
      report();
      return [file, data.buffer] as const;
    }),
  );
  return new Map(entries);
}

export async function loadImage(costume: Costume, data: ArrayBuffer): Promise<HTMLImageElement> {
  const type = costume.file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const image = new Image();
  image.src = URL.createObjectURL(new Blob([data], { type }));
  await image.decode();
  return image;
}

/** Reads which pixels of a costume are solid, for pixel-perfect touching. */
export function buildMask(costume: Costume, image: CanvasImageSource): void {
  const width = Math.ceil(costume.width * MASK_SCALE);
  const height = Math.ceil(costume.height * MASK_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingEnabled = costume.smooth;
  ctx.drawImage(image, 0, 0, costume.width * MASK_SCALE, costume.height * MASK_SCALE);
  applyMask(costume, ctx.getImageData(0, 0, width, height).data, width, height, MASK_SCALE);
}
