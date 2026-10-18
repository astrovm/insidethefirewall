"""Play the game in Chromium: title, start, pause, get hit, game over, repair.

Also checks the 2013 Scratch export at /classic/ still loads, and that the
in-game Classic mode looks like it.
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

DIFF_SCRIPT = """async ([a, b]) => {
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
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d > 48) different++;
  }
  return different / (480 * 360);
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

        # Classic mode looks like the 2013 Scratch export.
        page.click("#open-classic")
        page.wait_for_function("() => !document.querySelector('#classic').hidden", timeout=5000)
        page.wait_for_timeout(500)
        title = page.locator("#stage").screenshot()
        difference = page.evaluate(DIFF_SCRIPT, [as_data_url(title), as_data_url(classic_title)])
        assert difference < 0.02, f"Classic title screen differs from the original in {difference:.1%} of pixels"
        print(f"Classic mode matches the original ({difference:.2%} of pixels differ)")
        page.keyboard.press("Space")
        page.wait_for_function("() => insideTheFirewall.classic.vars.time >= 0", timeout=5000)
        page.click("#back")
        page.wait_for_function("() => document.querySelector('#classic').hidden", timeout=5000)
        assert visible(page, "#play")
        print("Classic mode plays and goes back to the remaster")

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
        assert page.locator("#over-rank").text_content() == "Script kiddie"
        assert visible(page, "#new-best"), "The first game should be a new best"
        print("Started the game and got hit")

        # R repairs the computer and starts over.
        page.keyboard.press("r")
        page.wait_for_function("() => insideTheFirewall.game.phase === 'playing'", timeout=5000)
        assert state(page)["health"] == 1 and state(page)["time"] < 1
        print("R starts a new game")

        # Arrow keys run and jump.
        start_x = page.evaluate("insideTheFirewall.game.player.x")
        page.keyboard.down("ArrowLeft" if start_x > 0 else "ArrowRight")
        page.keyboard.press("ArrowUp")
        page.wait_for_function("() => !insideTheFirewall.game.onGround", timeout=2000)
        page.wait_for_timeout(200)
        page.keyboard.up("ArrowLeft" if start_x > 0 else "ArrowRight")
        moved = page.evaluate("insideTheFirewall.game.player.x") - start_x
        assert abs(moved) > 30, f"Player only moved {moved} px"
        print("The player runs and jumps")

        # The pause menu goes back to the title.
        page.click("#pause-game")
        page.get_by_role("button", name="Menu").click()
        page.wait_for_function("() => insideTheFirewall.game.phase === 'title'", timeout=5000)
        page.wait_for_timeout(400)
        assert visible(page, "#play")
        assert page.locator("#title-best").text_content().startswith("Best "), "Best time missing on the title"
        print("Menu goes back to the title, which shows the best time")

        assert not errors, "\n".join(errors)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join()
print("End-to-end game test passed")
