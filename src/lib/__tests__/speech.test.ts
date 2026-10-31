import { describe, expect, it } from "vitest";
import { plainForSpeech } from "@/lib/use-speech";

describe("plainForSpeech", () => {
  it("odstraní Markdown, odrážky a kód", () => {
    const md = "**TCP** je *spojovaný*.\n\n- port `80`\n- port 443\n\n```js\nconsole.log(1)\n```\n# Konec";
    expect(plainForSpeech(md)).toBe("TCP je spojovaný. port 80 port 443 Konec");
  });
});
