# Inside the firewall

Scratch videogame I made in 2013, now rewritten in TypeScript.

- Play it: https://4st.li/insidethefirewall/
- The original Scratch version: https://4st.li/insidethefirewall/classic/

## How it works

The rewrite runs the 2013 game script by script, with the same rules as Scratch: 30 frames per second, the same collision, edge and timing quirks, and the original art and sounds.

- `src/engine/`: a small Scratch-like runtime (sprites, threads, timing).
- `src/game/classic.ts`: the 2013 game's scripts.
- `src/`: drawing, sound and the page.
- `docs/`: the built game that GitHub Pages serves. `docs/classic/` is the original TurboWarp export.

## Develop

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev     # http://127.0.0.1:8000, rebuilds on changes
bun run test    # typecheck and unit tests
bun run build   # writes docs/, commit it with your change
```

The browser test plays the game in Chromium:

```sh
uv run --project .github --group ci python .github/scripts/e2e-game.py
```
