"""Start the exported Scratch game and fail on missing assets/runtime errors."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


root = Path(__file__).resolve().parents[2] / "docs"
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_port}"
errors = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = browser.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda request: errors.append(f"Failed request: {request.url}"))
        page.on("response", lambda response: errors.append(f"HTTP {response.status}: {response.url}")
                if response.url.startswith(base) and response.status >= 400 else None)
        page.goto(base, wait_until="load")
        page.wait_for_function(
            """() => document.querySelector('#loading').hidden &&
              document.querySelector('#error').hidden &&
              typeof scaffolding !== 'undefined' && scaffolding.vm.runtime.targets.length > 1""",
            timeout=60000,
        )
        # Let the started project execute so delayed runtime exceptions surface.
        # Require the VM to run frames (not merely load) plus a short real-time window.
        page.evaluate("() => { window.__smokeFrames = 0; scaffolding.vm.runtime.on('AFTER_EXECUTE', () => window.__smokeFrames++); }")
        page.wait_for_function("() => window.__smokeFrames >= 30", timeout=15000)
        page.wait_for_timeout(2000)
        assert page.locator("#error").is_hidden(), "The game reported a load/runtime error"
        canvas = page.locator("#app canvas").first
        assert canvas.is_visible(), "The game canvas is not visible"
        assert canvas.evaluate("canvas => canvas.width > 0 && canvas.height > 0"), "Empty game canvas"
        assert not errors, "\n".join(errors)
        print("Game loaded its project and assets and rendered a canvas without runtime errors")
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join()
