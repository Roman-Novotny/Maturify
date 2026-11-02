import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/rich-markdown";

describe("parseMarkdown", () => {
  it("nadpisy, odstavce, oddělovač", () => {
    const b = parseMarkdown("## Nadpis\nText\nna dva řádky\n\n---\n#### Malý");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "hr", "h"]);
    expect(b[0]).toMatchObject({ level: 2, text: "Nadpis" });
    expect(b[1]).toMatchObject({ text: "Text\nna dva řádky" });
  });

  it("vnořené seznamy a odsazený vzorec patří položce", () => {
    const md = ["- **Veličiny**:", "  - U – napětí", "  - R – odpor", "    \\(R = \\frac UI\\)", "- Další"].join("\n");
    const [list] = parseMarkdown(md);
    expect(list.t).toBe("list");
    if (list.t !== "list") return;
    expect(list.items).toHaveLength(2);
    const nested = list.items[0].children[0];
    expect(nested.t).toBe("list");
    if (nested.t !== "list") return;
    expect(nested.items.map((i) => i.text)).toEqual(["U – napětí", "R – odpor"]);
    expect(nested.items[1].children[0]).toMatchObject({ t: "p", text: "\\(R = \\frac UI\\)" });
  });

  it("obrázek uvnitř seznamu přes prázdný řádek", () => {
    const md = ["- položka", "", "  ![](https://x.supabase.co/a.webp)", "", "- druhá"].join("\n");
    const [list] = parseMarkdown(md);
    if (list.t !== "list") throw new Error("not list");
    expect(list.items).toHaveLength(2);
    expect(list.items[0].children[0]).toMatchObject({ t: "img", src: "https://x.supabase.co/a.webp" });
  });

  it("tabulka s oddělovačem hlavičky i bez něj", () => {
    expect(parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |")[0]).toEqual({ t: "table", rows: [["A", "B"], ["1", "2"]] });
    expect(parseMarkdown("| J | K |\n| 0 | 1 |")[0]).toEqual({ t: "table", rows: [["J", "K"], ["0", "1"]] });
  });

  it("callout s ikonou vs. citace", () => {
    expect(parseMarkdown("> 💡 Tip na zkoušku")[0]).toMatchObject({ t: "quote", icon: "💡", text: "Tip na zkoušku" });
    expect(parseMarkdown("> Citát")[0]).toMatchObject({ t: "quote", icon: null, text: "Citát" });
  });

  it("úkoly, kód a blokový vzorec", () => {
    const [todo] = parseMarkdown("- [x] hotovo\n- [ ] zbývá");
    if (todo.t !== "list") throw new Error("not list");
    expect(todo.items.map((i) => [i.text, i.done])).toEqual([["hotovo", true], ["zbývá", false]]);
    expect(parseMarkdown("```\nls -la\n```")[0]).toEqual({ t: "code", text: "ls -la" });
    expect(parseMarkdown("$$E = mc^2$$")[0]).toEqual({ t: "math", text: "E = mc^2" });
  });
});
