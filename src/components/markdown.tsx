import { Fragment, type ReactNode } from "react";

// Minimální Markdown → React (odstavce, odrážky, číslované seznamy, **tučné**, *kurzíva*, `kód`, ``` bloky ```).
// Žádné HTML z modelu se nevkládá jako HTML – vše jde přes React, takže XSS nehrozí.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-panel-2 px-1 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string, key: string) {
  return text.split("\n").map((line, i, arr) => (
    <Fragment key={`${key}-l${i}`}>
      {inline(line, `${key}-l${i}`)}
      {i < arr.length - 1 && <br />}
    </Fragment>
  ));
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-lg bg-panel-2 p-3 text-sm">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, "");
        // Pokračovací řádky odsazené pod položkou.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
          item += "\n" + lines[i++].trim();
        }
        items.push(item);
      }
      const key = `b${k++}`;
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
          {items.map((it, j) => (
            <li key={j}>{withBreaks(it, `${key}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={k++} className="font-semibold">
          {inline(heading[1], `h${k}`)}
        </p>,
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !/^#{1,4}\s/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    const key = `p${k++}`;
    blocks.push(<p key={key}>{withBreaks(para.join("\n"), key)}</p>);
  }

  return <div className="space-y-3 leading-relaxed">{blocks}</div>;
}
