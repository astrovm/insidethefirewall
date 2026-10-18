# Inside the firewall

Scratch videogame I made in 2013, now remastered in TypeScript with the original art.

- Play it: https://4st.li/insidethefirewall/
- The original Scratch version: https://4st.li/insidethefirewall/classic/

## How it works

The remaster is a normal game loop at 60 updates a second, drawn as big as the window allows, with menus, pause, fades, touch buttons and settings. It uses the original art and sounds.

It also takes ideas from classic games: hearts capped at 5 like Zelda, music that speeds up on long runs like Space Invaders, instant retry like Super Meat Boy, and a replay of the last 2 seconds on the game over screen. For comfort, **Settings** has a game speed slider like Celeste's Assist Mode, and the keys can be changed.

The music is the 2013 song, then "Nightcore - How Do You Do" (Nightcore Lab NCL), "Nightcore - Bad boy" (AliceBloodRabbit) and "Meg & Dia - Monster (Nightcore Dubstep Remix)" (theHimeyukichan), from YouTube. Each game plays them in a random order, and each song fades into the next.

The 2013 game is also ported script by script, with the same rules as Scratch: 30 frames per second, the same collision, edge and timing quirks. Tests run it against the original project file. The remaster takes its sprites and collision from it.

- `src/remaster/`: the remaster's rules, power-ups, drawing and effects. The power-ups' pixel art is in `src/remaster/art.ts`. Run `bun tools/pixel-art.ts` after changing it.
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
