# Inside the firewall

Scratch videogame I made in 2013, now remastered in TypeScript with the original art.

- Play it: https://4st.li/insidethefirewall/
- The original Scratch version: https://4st.li/insidethefirewall/classic/

## How it works

The remaster is a normal game loop at 60 updates a second, drawn as big as the window allows, with menus, pause, fades, touch buttons and settings. It uses the original art and sounds.

The 2013 game is also ported script by script, with the same rules as Scratch: 30 frames per second, the same collision, edge and timing quirks. Tests run it against the original project file. The remaster takes its sprites and collision from it.

- `src/remaster/`: the remaster's rules, difficulty, drawing and effects. The worm's pixel art is in `src/remaster/art.ts`. Run `bun tools/pixel-art.ts` after changing it.
- `src/engine/`: a small Scratch-like runtime (sprites, threads, timing) for the port.
- `src/game/classic.ts`: the 2013 game's scripts.
- `src/`: loading, sound, controls and the page.
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
