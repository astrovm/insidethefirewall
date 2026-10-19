# Inside the firewall

Scratch videogame I made in 2013, now remastered in TypeScript with the original art.

- Play it: https://4st.li/insidethefirewall/
- The original Scratch version: https://4st.li/insidethefirewall/classic/

On a phone, open it in the browser and pick **Install app** or **Add to Home screen**. The installed game works offline.

## How it works

The remaster is a normal game loop at 120 updates a second, drawn as big as the window allows, with menus, pause, fades, touch buttons and settings. It uses the original art and sounds.

It also takes ideas from classic games: hearts capped at 5 like Zelda, instant retry like Super Meat Boy, and a replay of the last 2 seconds on the game over screen. For comfort, **Settings** has a game speed slider like Celeste's Assist Mode, from 5% to 500%, and the keys can be changed.

Power-ups and surprises pay tribute to other games:

- **Speed shoes**, like Sonic's, make you faster, and the music too.
- The **gravity gun** from Half-Life 2 catches the virus when it gets close and fires it back at the monitor. Dropping to your last heart, the HEV suit warns you.
- The **portal gun** puts a portal on each wall. Walk into one and come out of the other, like in Portal. The virus can go through too. The rare **Companion Cube** takes a hit for you, and the game over screen may tell you the cake is a lie.
- The **bonus round** is Breakout: you're the paddle, the virus is the ball, and the floor's bricks float up. Every 8 bricks give a heart, and breaking them all fills your hearts.
- The red pill from The Matrix, and a Homer³ 3D world inside the monitor. Homer's pink sedan from The Simpsons: Hit & Run is parked there. Walk into it to drive, and run the virus over.

The music is the 2013 song, "Flight" by Tristam, then "Nightcore - How Do You Do" (Nightcore Lab NCL), "Nightcore - Bad boy" (AliceBloodRabbit) and "Meg & Dia - Monster (Nightcore Dubstep Remix)" (theHimeyukichan), from YouTube. Each game starts with the 2013 song, then plays the rest in a random order, and each song fades into the next. Its title shows at the bottom when it starts.

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

With `?cheats` in the address, which the dev server adds, a **Cheats** panel lets you grab any power-up, add a heart, turn on god mode, jump into the 3D world, straight into the car, or escape, bring the next power-up or penguin right away, and skip 30 s ahead. Press the key shown next to each one, or <kbd>`</kbd> to hide the panel. A run with cheats can't set a best time.

The browser test plays the game in Chromium:

```sh
uv run --project .github --group ci python .github/scripts/e2e-game.py
```
