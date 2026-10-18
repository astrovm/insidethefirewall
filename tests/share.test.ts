import { expect, test } from "bun:test";
import { shareText } from "../src/remaster/share.ts";

test("the shared line has the run, what was grabbed, and the link", () => {
  expect(shareText(161, ["shield", "jetpack", "penguin"], "https://example.com/game/")).toBe(
    "Inside the firewall · 2:41\n🛡️🚀🐧\nhttps://example.com/game/",
  );
  expect(shareText(9, [], "https://example.com/")).toBe("Inside the firewall · 9\nhttps://example.com/");
  expect(shareText(60, Array(15).fill("freeze"), "u").split("\n")[1]).toBe(`${"❄️".repeat(12)}+3`);
  expect(shareText(60, Array(12).fill("freeze"), "u").split("\n")[1]).toBe("❄️".repeat(12));
});
