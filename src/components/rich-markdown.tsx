import { Fragment, type ReactNode } from "react";
import katex from "katex";

// Bohatší Markdown pro studijní materiály (poznámky, import z Notionu, vzorové odpovědi):
// nadpisy, vnořené seznamy, úkoly, citace/callouty, tabulky, oddělovače, obrázky, odkazy
// a vzorce (KaTeX – \( … \), $$ … $$). Text jde přes React; jediné vkládané HTML je výstup KaTeXu
// (trust: false → žádné odkazy ani HTML z TeXu).

const SAFE_URL = /^(https?:|mailto:)/i;

function tex(src: string, display: boolean) {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "html" });
}

function MathInline({ src }: { src: string }) {
  return <span className="katex-inline" dangerouslySetInnerHTML={{ __html: tex(src, false) }} />;
}

// ---------------------------------------------------------------------------
// Inline: \( vzorec \), `kód`, **tučně**, *kurzíva*, _kurzíva_, ~~škrtnuto~~, [odkaz](url), holé URL.
const INLINE =
  /(\\\((.+?)\\\)|`([^`]+)`|\*\*(.+?)\*\*|~~(.+?)~~|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<!\w)_(?!\s)([^_]+?)_(?!\w)|(https?:\/\/[^\s<>)]+[^\s<>).,;:!?]))/g;

export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${key}-${n++}`;
    const [, , math, code, bold, strike, linkText, linkUrl, em1, em2, bare] = m;
    if (math !== undefined) out.push(<MathInline key={k} src={math} />);
    else if (code !== undefined)
      out.push(
        <code key={k} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[0.88em] text-text">
          {code}
        </code>,
      );
    else if (bold !== undefined) out.push(<strong key={k} className="font-semibold text-text">{inline(bold, k)}</strong>);
    else if (strike !== undefined) out.push(<s key={k}>{inline(strike, k)}</s>);
    else if (linkText !== undefined)
      out.push(
        SAFE_URL.test(linkUrl) ? (
          <a key={k} href={linkUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
            {inline(linkText === linkUrl ? shortUrl(linkUrl) : linkText, k)}
          </a>
        ) : (
          <Fragment key={k}>{inline(linkText, k)}</Fragment>
        ),
      );
    else if (em1 !== undefined || em2 !== undefined) out.push(<em key={k}>{inline(em1 ?? em2, k)}</em>);
    else if (bare !== undefined)
      out.push(
        <a key={k} href={bare} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          {shortUrl(bare)}
        </a>,
      );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 24 ? `${u.pathname.slice(0, 22)}…` : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Bloky

type ListItem = { text: string; task?: boolean; done?: boolean; children: Block[] };
type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "quote"; icon: string | null; text: string }
  | { t: "code"; text: string }
  | { t: "math"; text: string }
  | { t: "img"; alt: string; src: string }
  | { t: "table"; rows: string[][] }
  | { t: "hr" };

const RE = {
  fence: /^\s*```/,
  heading: /^(#{1,4})\s+(.*)$/,
  hr: /^\s*(-{3,}|\*{3,})\s*$/,
  bullet: /^(\s*)[-*•]\s+(.*)$/,
  numbered: /^(\s*)\d+[.)]\s+(.*)$/,
  quote: /^\s*>\s?(.*)$/,
  img: /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/,
  table: /^\s*\|.*\|\s*$/,
  mathOpen: /^\s*\$\$/,
};

const indentOf = (l: string) => (l.match(/^\s*/)?.[0].replace(/\t/g, "  ").length ?? 0);
const isListLine = (l: string) => RE.bullet.test(l) || RE.numbered.test(l);
const isBlockStart = (l: string) =>
  RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.img.test(l) || RE.table.test(l) || RE.mathOpen.test(l) || isListLine(l);

function parse(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (RE.fence.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !RE.fence.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ t: "code", text: code.join("\n") });
      continue;
    }
    if (RE.mathOpen.test(line)) {
      let body = line.trim().slice(2);
      if (body.endsWith("$$")) body = body.slice(0, -2);
      else {
        i++;
        while (i < lines.length && !lines[i].includes("$$")) body += "\n" + lines[i++];
        if (i < lines.length) body += "\n" + lines[i].replace(/\$\$.*$/, "");
      }
      i++;
      blocks.push({ t: "math", text: body.trim() });
      continue;
    }
    const h = RE.heading.exec(line.trim());
    if (h) {
      blocks.push({ t: "h", level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }
    if (RE.hr.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    const img = RE.img.exec(line);
    if (img) {
      blocks.push({ t: "img", alt: img[1], src: img[2] });
      i++;
      continue;
    }
    if (RE.table.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && RE.table.test(lines[i])) {
        const cells = lines[i++].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // oddělovač hlavičky
        rows.push(cells);
      }
      blocks.push({ t: "table", rows });
      continue;
    }
    if (RE.quote.test(line)) {
      const text: string[] = [];
      while (i < lines.length && RE.quote.test(lines[i])) text.push(RE.quote.exec(lines[i++])![1]);
      // Pokračování calloutu: odsazené řádky hned pod ním (Notion vnořuje obsah calloutu).
      while (i < lines.length && lines[i].trim() && indentOf(lines[i]) > 0 && !RE.quote.test(lines[i])) text.push(lines[i++]);
      const first = text[0]?.trim() ?? "";
      const icon = /^\p{Extended_Pictographic}/u.test(first) ? [...first][0] : null;
      if (icon) text[0] = first.slice(icon.length).trim();
      blocks.push({ t: "quote", icon, text: dedent(text).join("\n").trim() });
      continue;
    }
    if (isListLine(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    // Odstavec
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    blocks.push({ t: "p", text: para.join("\n") });
  }
  return blocks;
}

function dedent(lines: string[]) {
  const ind = Math.min(...lines.filter((l) => l.trim()).map(indentOf), Infinity);
  return Number.isFinite(ind) ? lines.map((l) => l.slice(Math.min(ind, indentOf(l)))) : lines;
}

/** Seznam od řádku `start`; vnořené položky a odsazený obsah (obrázky, vzorce) jdou do children. */
function parseList(lines: string[], start: number): [Block, number] {
  const base = indentOf(lines[start]);
  const ordered = RE.numbered.test(lines[start]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // Prázdný řádek seznam neukončí, pokud pokračuje odsazeným obsahem nebo další položkou stejného typu.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && (indentOf(lines[j]) > base || (indentOf(lines[j]) === base && (ordered ? RE.numbered : RE.bullet).test(lines[j])))) {
        i = j;
        continue;
      }
      break;
    }
    const ind = indentOf(line);
    if (ind < base) break;
    const m = ind === base ? (ordered ? RE.numbered : RE.bullet).exec(line) : null;
    if (m) {
      const text = m[2];
      const task = /^\[( |x|X)\]\s+/.exec(text);
      items.push({ text: task ? text.slice(task[0].length) : text, task: !!task, done: task?.[1].toLowerCase() === "x", children: [] });
      i++;
      continue;
    }
    if (ind === base) break; // jiný typ bloku na stejné úrovni
    // Odsazený obsah patří poslední položce.
    const sub: string[] = [];
    while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > base)) {
      if (!lines[i].trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j >= lines.length || indentOf(lines[j]) <= base) break;
      }
      sub.push(lines[i++]);
    }
    const target = items[items.length - 1];
    const children = parse(dedent(sub));
    if (target) target.children.push(...children);
    else items.push({ text: "", children });
  }
  return [{ t: "list", ordered, items }, i];
}

// ---------------------------------------------------------------------------
// Render

const HEADING = [
  "",
  "mt-8 mb-3 text-xl font-bold tracking-tight first:mt-0",
  "mt-8 mb-3 border-b border-border pb-2 text-lg font-semibold tracking-tight first:mt-0",
  "mt-6 mb-2 text-base font-semibold first:mt-0",
  "mt-5 mb-1.5 text-sm font-semibold uppercase tracking-wide text-muted first:mt-0",
];

/** Název souboru jako popisek obrázku nic neříká (image.png, Snímek obrazovky …). */
const meaningfulAlt = (alt: string) => !!alt.trim() && !/\.(png|jpe?g|gif|webp|svg)$/i.test(alt.trim());

function renderBlocks(blocks: Block[], key: string): ReactNode[] {
  return blocks.map((b, n) => {
    const k = `${key}-${n}`;
    switch (b.t) {
      case "h": {
        const Tag = (["h2", "h2", "h3", "h4", "h5"] as const)[b.level];
        return (
          <Tag key={k} className={HEADING[b.level]}>
            {inline(b.text, k)}
          </Tag>
        );
      }
      case "p":
        return (
          <p key={k} className="my-3">
            {b.text.split("\n").map((l, j, arr) => (
              <Fragment key={j}>
                {inline(l, `${k}-${j}`)}
                {j < arr.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      case "list": {
        const List = b.ordered ? "ol" : "ul";
        const nested = key.includes("li");
        return (
          <List
            key={k}
            className={`my-2 space-y-1 pl-5 marker:text-muted ${b.ordered ? "list-decimal" : nested ? "list-[circle]" : "list-disc"}`}
          >
            {b.items.map((it, j) => (
              <li key={j} className={`pl-1 ${it.task ? "list-none -ml-5 flex gap-2" : ""}`}>
                {it.task && (
                  <span aria-hidden className={`mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${it.done ? "border-success bg-success text-white" : "border-border"}`}>
                    {it.done ? "✓" : ""}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {it.text && <span>{inline(it.text, `${k}-${j}`)}</span>}
                  {it.children.length > 0 && <div className="[&>*:first-child]:mt-1">{renderBlocks(it.children, `${k}-li${j}`)}</div>}
                </div>
              </li>
            ))}
          </List>
        );
      }
      case "quote":
        return b.icon ? (
          <div key={k} className="my-4 flex gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
            <span className="text-lg leading-6" aria-hidden>
              {b.icon}
            </span>
            <div className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{renderBlocks(parse(b.text.split("\n")), k)}</div>
          </div>
        ) : (
          <blockquote key={k} className="my-4 border-l-4 border-primary/50 py-1 pl-4 text-muted italic [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {renderBlocks(parse(b.text.split("\n")), k)}
          </blockquote>
        );
      case "code":
        return (
          <pre key={k} className="my-4 overflow-x-auto rounded-xl border border-border bg-panel-2 p-4 font-mono text-[0.85em] leading-relaxed">
            <code>{b.text}</code>
          </pre>
        );
      case "math":
        return <div key={k} className="my-4 overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: tex(b.text, true) }} />;
      case "img":
        if (!/^https:\/\//i.test(b.src)) return null;
        return (
          <figure key={k} className="my-5">
            <a href={b.src} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-xl border border-border bg-white/95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={meaningfulAlt(b.alt) ? b.alt : ""} loading="lazy" decoding="async" className="mx-auto max-h-[28rem] w-auto max-w-full object-contain" />
            </a>
            {meaningfulAlt(b.alt) && <figcaption className="mt-2 text-center text-xs text-muted">{b.alt}</figcaption>}
          </figure>
        );
      case "table": {
        const [head, ...body] = b.rows;
        return (
          <div key={k} className="my-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-panel-2">
                <tr>
                  {head.map((c, j) => (
                    <th key={j} className="border-b border-border px-3 py-2 text-left font-semibold">
                      {inline(c, `${k}-h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, j) => (
                  <tr key={j} className="even:bg-panel-2/40">
                    {r.map((c, x) => (
                      <td key={x} className="border-t border-border px-3 py-2 align-top">
                        {inline(c, `${k}-${j}-${x}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "hr":
        return <hr key={k} className="my-8 border-border" />;
    }
  });
}

export function parseMarkdown(text: string) {
  return parse(text.replace(/\r\n?/g, "\n").split("\n"));
}

/** Hezky vysázený studijní text. `compact` = menší písmo (např. vzorová odpověď v testu). */
export function RichMarkdown({ text, compact = false, className = "" }: { text: string; compact?: boolean; className?: string }) {
  return (
    <div className={`rich-md min-w-0 leading-relaxed text-text/90 ${compact ? "text-sm" : "text-[0.95rem]"} [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      {renderBlocks(parseMarkdown(text), "md")}
    </div>
  );
}
