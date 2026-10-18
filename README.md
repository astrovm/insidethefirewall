# Inside the firewall

Scratch videogame I made in 2013, now remastered in TypeScript with the original art.

- Play it: https://4st.li/insidethefirewall/
- The original Scratch version: https://4st.li/insidethefirewall/classic/

## How it works

There are two versions of the game in the page:

- The remaster, which opens first. It's a normal game loop at 60 updates a second, drawn to fill the screen, with menus, pause and fades.
- Classic mode (**Play the 2013 original**), which runs the 2013 game script by script with the same rules as Scratch: 30 frames per second, the same collision, edge and timing quirks.

Both use the original art and sounds.

- `src/remaster/`: the remaster's rules, drawing and fades.
- `src/engine/`: a small Scratch-like runtime (sprites, threads, timing) for Classic mode.
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
