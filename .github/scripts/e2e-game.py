"""Play the game in Chromium: title, start, pause, get hit, game over, repair.

Also checks the 2013 Scratch export at /classic/ still loads, and that the
remaster's title screen looks like it.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


# Points on the pickup costume (costume units) and whether Scratch said the
# mouse pointer touched the pickup there. Measured with isTouchingObject('_mouse_').
SCRATCH_PICKUP_TOUCHES = [
    [3, 3, False], [3, 50, False], [45, 45, False], [58, 48, False], [62, 30, False],
    [62, 5, False], [50, 20, False], [20, 30, True], [40, 8, False], [48, 12, True],
]

# Share of pixels that differ between two screenshots of the stage, in the top `rows` of its 360.
DIFF_SCRIPT = """async ([a, b, rows = 360]) => {
  const load = (src) => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
  });
  const pixels = async (src) => {
    const image = await load(src);
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 480, 360);
    return ctx.getImageData(0, 0, 480, 360).data;
  };
  const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
  let different = 0;
  for (let i = 0; i < 480 * rows * 4; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d > 48) different++;
  }
  return different / (480 * rows);
}"""

root = Path(__file__).resolve().parents[2] / "docs"
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_port}"


def watch_errors(page, errors):
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("requestfailed", lambda request: errors.append(f"Failed request: {request.url}"))
    page.on("response", lambda response: errors.append(f"HTTP {response.status}: {response.url}")
            if response.url.startswith(base) and response.status >= 400 else None)


def state(page):
    return page.evaluate("""() => {
      const g = insideTheFirewall.game;
      return { phase: g.phase, time: g.time, health: g.health };
    }""")


def visible(page, selector):
    return page.locator(selector).is_visible()


def as_data_url(png):
    import base64
    return "data:image/png;base64," + base64.b64encode(png).decode()


errors = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
        )
        context = browser.new_context(viewport={"width": 960, "height": 768})

        # The original Scratch export still works.
        classic = context.new_page()
        watch_errors(classic, errors)
        classic.goto(f"{base}/classic/", wait_until="load")
        classic.wait_for_function(
            """() => document.querySelector('#loading').hidden && document.querySelector('#error').hidden &&
              typeof scaffolding !== 'undefined' && scaffolding.vm.runtime.targets.length > 1""",
            timeout=60000,
        )
        classic.wait_for_timeout(1000)
        classic_title = classic.locator("#app canvas").first.screenshot()
        print("Classic Scratch export loads")

        page = context.new_page()
        watch_errors(page, errors)
        page.goto(base, wait_until="load")
        page.wait_for_function(
            "() => document.querySelector('#loading').hidden && window.insideTheFirewall", timeout=60000
        )
        assert page.locator("#error").is_hidden(), page.locator("#error-message").text_content()
        assert state(page)["phase"] == "title" and visible(page, "#play")

        # Collision masks touch at the same pixels Scratch did.
        touches = page.evaluate("""(points) => {
          const sprite = insideTheFirewall.game.pickup;
          sprite.visible = true;
          const result = points.map(([u, v]) => [u, v, sprite.isOpaqueAt(...sprite.toStage(u + 0.01, v + 0.01))]);
          sprite.visible = false;
          return result;
        }""", SCRATCH_PICKUP_TOUCHES)
        assert touches == SCRATCH_PICKUP_TOUCHES, touches
        print("Collision masks match Scratch")

        # The title screen sits inside the room like the 2013 one. Only the credit changed.
        page.wait_for_timeout(500)
        view = page.evaluate("""() => {
          const { x, y, scale } = insideTheFirewall.view;
          const ratio = devicePixelRatio;
          return { x: x / ratio, y: y / ratio, width: 480 * scale / ratio, height: 360 * scale / ratio };
        }""")
        title = page.screenshot(clip=view, style="#corner { visibility: hidden }")
        # The credit starts at row 320. Text edges are smoothed a little differently than in Scratch.
        difference = page.evaluate(DIFF_SCRIPT, [as_data_url(title), as_data_url(classic_title), 320])
        assert difference < 0.03, f"Title screen differs from the original in {difference:.1%} of pixels"
        print(f"Title screen matches the original ({difference:.2%} of pixels differ)")

        # xp sets the volume with a message and expects a reply.
        reply = page.evaluate("""() => new Promise((resolve) => {
          window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'volumeUpdate') resolve(event.data.volume);
          });
          window.postMessage({ type: 'setVolume', volume: 0.3 }, '*');
        })""")
        assert reply == 0.3 and abs(page.evaluate("insideTheFirewall.audio.volume") - 0.3) < 1e-6

        # Space starts the game.
        page.keyboard.press("Space")
        page.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        assert state(page)["health"] == 1 and visible(page, "#pause-game") and not visible(page, "#play")

        # Escape pauses, and resuming carries on.
        page.keyboard.press("Escape")
        assert visible(page, "#pause-menu")
        paused_at = state(page)["time"]
        page.wait_for_timeout(300)
        assert state(page)["time"] == paused_at, "Game kept running while paused"
        page.get_by_role("button", name="Resume").click()
        page.wait_for_function(f"() => insideTheFirewall.game.time > {paused_at}", timeout=2000)
        assert not visible(page, "#pause-menu")
        print("Pause and resume work")

        # Standing still, the virus gets you.
        page.wait_for_function("() => insideTheFirewall.game.phase === 'over'", timeout=30000)
        assert state(page)["health"] == 0 and visible(page, "#repair")
        assert page.locator("#status").text_content().startswith("Game over")
        assert visible(page, "#new-best"), "The first game should be a new best"
        print("Started the game and got hit")

        # R repairs the computer and starts over, and the game over song stops.
        page.evaluate("() => insideTheFirewall.audio.play('glados')")
        assert "remaster:glados" in page.evaluate("insideTheFirewall.audio.playingSounds")
        page.keyboard.press("r")
        assert "remaster:glados" not in page.evaluate("insideTheFirewall.audio.playingSounds"), "The game over song kept playing"
        page.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        assert state(page)["health"] == 1 and state(page)["time"] < 1
        print("R starts a new game")

        # Arrow keys run and jump. No hits, so the virus can't end the run early.
        page.evaluate("() => { insideTheFirewall.game.invincible = Infinity }")
        start_x = page.evaluate("insideTheFirewall.game.player.x")
        page.keyboard.down("ArrowLeft" if start_x > 0 else "ArrowRight")
        page.keyboard.press("ArrowUp")
        page.wait_for_function("() => !insideTheFirewall.game.onGround", timeout=2000)
        page.wait_for_timeout(200)
        page.keyboard.up("ArrowLeft" if start_x > 0 else "ArrowRight")
        moved = page.evaluate("insideTheFirewall.game.player.x") - start_x
        assert abs(moved) > 30, f"Player only moved {moved} px"
        print("The player runs and jumps")

        # Grabbing a jetpack and holding jump flies higher than any jump.
        page.evaluate("""() => {
          const g = insideTheFirewall.game;
          g.powerUp.setCostume('jetpack');
          g.powerUp.setXY(g.player.x, g.player.y);
          g.powerUp.visible = true;
        }""")
        page.wait_for_function("() => insideTheFirewall.game.powers.jetpack > 0", timeout=2000)
        assert page.locator("#status").text_content().startswith("Jetpack")
        # Away from the monitor: flying up under it dives into the 3D world instead.
        page.evaluate("() => insideTheFirewall.game.player.setXY(150, insideTheFirewall.game.player.y)")
        page.keyboard.down("ArrowUp")
        page.wait_for_function("() => insideTheFirewall.game.player.y > 20", timeout=3000)
        print("A jetpack flies")

        # Holding up into the ceiling bursts out of the monitor, and the room
        # left behind shows on its screen until the virus comes out.
        page.evaluate("() => { insideTheFirewall.game.health = 5 }")
        page.wait_for_function("() => insideTheFirewall.game.escapeTime > 0.5 && insideTheFirewall.game.escapeTime < 1", timeout=3000)
        page.keyboard.up("ArrowUp")
        # The floor-less middle of the small room, at three spots, in case the virus is on one.
        on_screen = page.evaluate("""() => {
          const { x, y, scale } = insideTheFirewall.view;
          const ctx = document.querySelector('#game').getContext('2d');
          return [206.67, 240, 273.33].map((left) => [...ctx.getImageData(Math.round(x + left * scale), Math.round(y + 52 * scale), 1, 1).data]);
        }""")
        green = [p for p in on_screen if p[1] > 150 and p[0] < 50]
        assert len(green) >= 2, f"No room on the monitor's screen: {on_screen}"
        page.wait_for_function("() => insideTheFirewall.game.virus.visible && insideTheFirewall.game.escapeTime === Infinity", timeout=3000)
        assert page.evaluate("insideTheFirewall.game.player.size") > 180
        print("The jetpack escapes the monitor")

        # Menu on the game over screen goes to the title, and the game over song stops.
        page.evaluate("() => { insideTheFirewall.game.invincible = 0; insideTheFirewall.game.health = 0 }")
        page.wait_for_function("() => insideTheFirewall.game.phase === 'over'", timeout=5000)
        page.evaluate("() => insideTheFirewall.audio.play('glados')")
        page.locator("#over-menu").get_by_role("button", name="Menu").click()
        assert "remaster:glados" not in page.evaluate("insideTheFirewall.audio.playingSounds"), "The game over song kept playing"
        page.wait_for_function("() => insideTheFirewall.game.phase === 'title'", timeout=5000)
        page.click("#play")
        page.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        print("Leaving game over stops its song")

        # The pause menu goes back to the title.
        page.click("#pause-game")
        page.get_by_role("button", name="Menu").click()
        page.wait_for_function("() => insideTheFirewall.game.phase === 'title'", timeout=5000)
        page.wait_for_timeout(400)
        assert visible(page, "#play")
        assert page.locator("#title-best").text_content().startswith("Best "), "Best time missing on the title"
        print("Menu goes back to the title, which shows the best time")

        # Settings: the volume and touch choice stick after a reload.
        page.click("#open-settings")
        assert visible(page, "#settings-menu") and not visible(page, "#play")
        page.locator("#music-volume").fill("25")
        page.get_by_text("On", exact=True).click()
        page.keyboard.press("Escape")
        assert not visible(page, "#settings-menu") and visible(page, "#play")
        page.reload(wait_until="load")
        page.wait_for_function("() => document.querySelector('#loading').hidden", timeout=60000)
        page.click("#open-settings")
        assert page.locator("#music-volume").input_value() == "25"
        assert page.locator('input[name="touch"][value="on"]').is_checked()
        page.get_by_role("button", name="Done").click()
        print("Settings are saved")

        # Touch buttons show on a touch screen and move the player.
        phone = browser.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
        touch = phone.new_page()
        watch_errors(touch, errors)
        touch.goto(base, wait_until="load")
        touch.wait_for_function("() => document.querySelector('#loading').hidden && window.insideTheFirewall", timeout=60000)
        assert not visible(touch, "#touch [data-move=\"jump\"]")
        touch.tap("#play")
        touch.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        touch.evaluate("() => { insideTheFirewall.game.invincible = Infinity }")
        assert visible(touch, "#touch [data-move=\"jump\"]")
        # At this size the stage doesn't scale evenly. Its bottom row is still all floor, no green line.
        touch.wait_for_timeout(500)  # Past the fade in.
        bottom_row = touch.evaluate("""() => {
          const canvas = document.querySelector('#game');
          const { x, y, scale } = insideTheFirewall.view;
          const row = Math.round(y + 360 * scale) - 1;
          const data = canvas.getContext('2d').getImageData(x, row, Math.round(480 * scale), 1).data;
          let green = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] && data[i + 1] > 40) green++;
          return green;
        }""")
        assert bottom_row == 0, f"{bottom_row} green pixels along the bottom of the stage"
        start_x = touch.evaluate("insideTheFirewall.game.player.x")
        button = touch.locator('#touch [data-move="right"]').bounding_box()
        center = (button["x"] + button["width"] / 2, button["y"] + button["height"] / 2)
        touch.dispatch_event('#touch [data-move="right"]', "pointerdown", {"pointerId": 7, "pointerType": "touch", "isPrimary": True, "clientX": center[0], "clientY": center[1]})
        touch.wait_for_timeout(300)
        touch.dispatch_event('#touch [data-move="right"]', "pointerup", {"pointerId": 7, "pointerType": "touch", "isPrimary": True})
        moved = touch.evaluate("insideTheFirewall.game.player.x") - start_x
        assert moved > 30, f"Touch only moved the player {moved} px"
        touch.wait_for_timeout(200)
        assert touch.evaluate("insideTheFirewall.game.player.x") - start_x - moved < 20, "Player kept running after lifting the finger"
        touch.click("#pause-game")
        assert not visible(touch, "#touch [data-move=\"jump\"]")
        phone.close()
        print("Touch buttons move the player")

        # Gamepads: Start plays and pauses, the stick and D-pad move, A jumps.
        pad = context.new_page()
        watch_errors(pad, errors)
        pad.goto(base, wait_until="load")
        pad.wait_for_function("() => document.querySelector('#loading').hidden && window.insideTheFirewall", timeout=60000)
        pad.evaluate("""() => {
          const fake = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
          window.fakePad = fake;
          navigator.getGamepads = () => [fake];
        }""")

        # The game reads the pad once a frame, so hold and release each for a couple of
        # frames, not a fixed time a slow runner can fit no frame into.
        def frames():
            pad.evaluate("() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))")

        def tap_button(index):
            pad.evaluate(f"() => {{ fakePad.buttons[{index}].pressed = true }}")
            frames()
            pad.evaluate(f"() => {{ fakePad.buttons[{index}].pressed = false }}")
            frames()

        tap_button(9)
        pad.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        pad.evaluate("() => { insideTheFirewall.game.invincible = Infinity }")
        start_x = pad.evaluate("insideTheFirewall.game.player.x")
        pad.evaluate("() => { fakePad.axes[0] = 1 }")
        pad.wait_for_timeout(300)
        pad.evaluate("() => { fakePad.axes[0] = 0 }")
        assert pad.evaluate("insideTheFirewall.game.player.x") - start_x > 30, "The stick didn't move the player"
        start_x = pad.evaluate("insideTheFirewall.game.player.x")
        pad.evaluate("() => { fakePad.buttons[14].pressed = true }")
        pad.wait_for_timeout(300)
        pad.evaluate("() => { fakePad.buttons[14].pressed = false }")
        assert pad.evaluate("insideTheFirewall.game.player.x") - start_x < -30, "The D-pad didn't move the player"
        pad.evaluate("() => { fakePad.buttons[0].pressed = true }")
        pad.wait_for_function("() => !insideTheFirewall.game.onGround", timeout=2000)
        pad.evaluate("() => { fakePad.buttons[0].pressed = false }")
        pad.wait_for_timeout(600)
        tap_button(9)
        assert visible(pad, "#pause-menu")
        tap_button(9)
        assert not visible(pad, "#pause-menu")
        # A on the game over screen starts again, once the screen has been up a moment.
        pad.evaluate("() => { insideTheFirewall.game.invincible = 0; insideTheFirewall.game.health = 0 }")
        pad.wait_for_function("() => insideTheFirewall.game.phase === 'over'", timeout=5000)
        tap_button(0)
        assert state(pad)["phase"] == "over", "A skipped the game over screen right away"
        pad.wait_for_timeout(500)
        tap_button(0)
        pad.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        pad.close()
        print("Gamepads start, move, jump and pause")

        # Cues, faster music, the run summary, the replay, sharing and instant retry.
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
        day = context.new_page()
        watch_errors(day, errors)
        day.goto(base, wait_until="load")
        day.wait_for_function("() => document.querySelector('#loading').hidden && window.insideTheFirewall", timeout=60000)
        day.evaluate("""() => {
          window.synths = [];
          const audio = insideTheFirewall.audio;
          const synth = audio.synth.bind(audio);
          audio.synth = (name) => { synths.push(name); synth(name); };
          delete Navigator.prototype.share;
        }""")
        day.click("#play")
        day.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        day.evaluate("() => { insideTheFirewall.game.invincible = Infinity; insideTheFirewall.game.nextDrop = 'penguin'; insideTheFirewall.game.dropTimer = 0.05 }")
        day.wait_for_function("() => synths.includes('appear')", timeout=2000)
        day.evaluate("() => { insideTheFirewall.game.powers.freeze = 1.05 }")
        day.wait_for_function("() => synths.includes('tick')", timeout=2000)
        day.evaluate("() => insideTheFirewall.game.events.push({ type: 'nearMiss' })")
        day.wait_for_function("() => synths.includes('whoosh')", timeout=2000)
        print("Cues sound when things show up, end, and fly close")

        # The 2013 song plays first, then the rest in a random order, each fading into the next.
        playlist = day.evaluate("[...insideTheFirewall.audio.playlist]")
        assert playlist[0] == "music" and sorted(playlist) == sorted(["music", "how-do-you-do", "bad-boy", "monster"]), playlist
        assert day.evaluate("insideTheFirewall.audio.songName") == playlist[0]
        assert day.evaluate("insideTheFirewall.audio.song.source.playbackRate.value") == 1
        day.evaluate("() => { const song = insideTheFirewall.audio.song; song.position = song.end - 2.5 }")
        day.wait_for_function(f"() => insideTheFirewall.audio.songName === '{playlist[1]}'", timeout=5000)
        print("Songs fade into each other")

        day.evaluate("""() => {
          const g = insideTheFirewall.game;
          g.powerUp.setCostume('shield');
          g.powerUp.setXY(g.player.x, g.player.y);
          g.powerUp.visible = true;
        }""")
        day.wait_for_function("() => insideTheFirewall.game.grabbed.includes('shield')", timeout=2000)
        day.evaluate("() => { const g = insideTheFirewall.game; g.invincible = 0; g.powers.shield = 0; g.health = 0 }")
        day.wait_for_function("() => insideTheFirewall.game.phase === 'over'", timeout=5000)
        # Jump right away does nothing, so a jump held while dying can't skip the screen.
        day.keyboard.press("Space")
        day.wait_for_timeout(100)
        assert state(day)["phase"] == "over", "Jump skipped the game over screen right away"
        assert day.locator('#over-grabs img[alt="Shields"]').is_visible()
        assert day.locator("#over-grabs").text_content() == "1"
        day.wait_for_timeout(500)
        replay_border = day.evaluate("""() => {
          const { x, y, scale } = insideTheFirewall.view;
          const ctx = document.querySelector('#game').getContext('2d');
          return [...ctx.getImageData(Math.round(x + 318 * scale) - 1, Math.round(y + 80 * scale), 1, 1).data];
        }""")
        assert replay_border[:3] == [254, 149, 1], f"No replay window on the game over screen: {replay_border}"
        print("Game over shows the run summary and a replay")

        # A blocked clipboard, with the old way of copying blocked too, says so.
        day.evaluate("""() => {
          window.realWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
          window.realExec = document.execCommand.bind(document);
          navigator.clipboard.writeText = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
          document.execCommand = () => false;
        }""")
        day.click("#share")
        day.wait_for_function("() => document.querySelector('#share').textContent === \"Couldn't copy\"", timeout=2000)
        # With only the new way blocked, the old way still copies.
        day.evaluate("() => { document.execCommand = realExec }")
        day.click("#share")
        day.wait_for_function("() => document.querySelector('#share').textContent === 'Copied'", timeout=2000)
        day.evaluate("() => { navigator.clipboard.writeText = realWrite }")
        day.click("#share")
        day.wait_for_function("() => document.querySelector('#share').textContent === 'Copied'", timeout=2000)
        shared = day.evaluate("navigator.clipboard.readText()")
        assert shared.startswith("Inside the firewall · ") and "🛡️" in shared, shared
        print("Share copies the result")

        # Focus is still on Share, so Space would share again. Up jumps.
        day.keyboard.press("ArrowUp")
        day.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        # It picks up from the song the run reached, the second one, in the same order.
        day.wait_for_function(f"() => insideTheFirewall.audio.songName === '{playlist[1]}'", timeout=2000)
        assert day.evaluate("[...insideTheFirewall.audio.playlist]") == playlist
        assert day.evaluate("insideTheFirewall.audio.song.source.playbackRate.value") == 1
        print("Jump starts again, from the song the last run reached")

        # Settings: a slower game speed, and a new jump key.
        day.click("#pause-game")
        day.locator("#pause-menu").get_by_role("button", name="Menu").click()
        day.wait_for_function("() => insideTheFirewall.game.phase === 'title'", timeout=5000)
        day.wait_for_timeout(400)
        day.click("#open-settings")
        day.locator("#game-speed").fill("70")
        assert day.locator("#game-speed-value").text_content() == "70%"
        day.get_by_role("button", name="Keys").click()
        assert visible(day, "#keys-menu") and not visible(day, "#settings-menu")
        day.click("#bind-jump")
        assert day.locator("#bind-jump").text_content() == "Press a key"
        day.keyboard.press("Escape")
        assert day.locator("#bind-jump").text_content() == "W · Space · ↑", "Escape didn't cancel"
        day.click("#bind-jump")
        day.keyboard.press("k")
        assert day.locator("#bind-jump").text_content() == "K"
        day.keyboard.press("Escape")
        assert visible(day, "#settings-menu") and not visible(day, "#keys-menu")
        day.get_by_role("button", name="Done").click()
        day.click("#play")
        day.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        day.evaluate("() => { insideTheFirewall.game.invincible = Infinity }")
        day.wait_for_timeout(400)
        before = state(day)["time"]
        day.wait_for_timeout(1000)
        played = state(day)["time"] - before
        assert 0.5 < played < 0.85, f"At 70% speed, 1 s played {played:.2f} s of game"
        day.keyboard.press("Space")
        day.wait_for_timeout(200)
        assert day.evaluate("insideTheFirewall.game.onGround"), "Space still jumps after binding K"
        day.keyboard.press("k")
        day.wait_for_function("() => !insideTheFirewall.game.onGround", timeout=2000)
        day.close()
        print("Game speed and key changes work")

        assert not errors, "\n".join(errors)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join()
print("End-to-end game test passed")
