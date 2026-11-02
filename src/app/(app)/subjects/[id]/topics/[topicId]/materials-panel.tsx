"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileImage, FileText, Loader2, NotebookPen, Sparkles, Trash2, TriangleAlert, Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Card, CardTitle, EmptyState, Input, Textarea } from "@/components/ui";
import type { Material } from "@/lib/database.types";
import { RichMarkdown } from "@/components/rich-markdown";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { transcribeMaterialAction } from "../../../../ai-actions";
import { deleteMaterial, registerUploadedFile, saveNote } from "../../../../study-actions";

type MaterialWithUrl = Material & { url: string | null };

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,.md";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MaterialsPanel({
  topicId,
  materials,
  aiAvailable,
}: {
  topicId: string;
  materials: MaterialWithUrl[];
  aiAvailable: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={noteOpen ? "primary" : "secondary"} onClick={() => setNoteOpen(!noteOpen)}>
          <NotebookPen size={16} /> Nová poznámka
        </Button>
        <FileUpload topicId={topicId} />
      </div>

      {noteOpen && (
        <Card>
          <CardTitle>Nová poznámka</CardTitle>
          <ActionForm action={saveNote} className="space-y-3" onSuccess={() => setNoteOpen(false)}>
            <input type="hidden" name="topic_id" value={topicId} />
            <Input name="title" required maxLength={200} placeholder="Název" aria-label="Název" />
            <Textarea name="content" required rows={10} placeholder="Výpisky, osnova odpovědi, zápis z hodiny…" aria-label="Obsah" />
            <Button type="submit">Uložit</Button>
          </ActionForm>
        </Card>
      )}

      {materials.length ? (
        <ul className="space-y-3">
          {materials.map((m) => (
            <MaterialItem key={m.id} material={m} aiAvailable={aiAvailable} defaultOpen={materials.length === 1 && m.kind === "note"} />
          ))}
        </ul>
      ) : (
        !noteOpen && (
          <EmptyState title="Žádné materiály">
            Nahraj PDF, fotky sešitu nebo si piš poznámky. Ve Fázi 3 z nich bude čerpat AI tutor.
          </EmptyState>
        )
      )}
    </div>
  );
}

function MaterialItem({
  material: m,
  aiAvailable,
  defaultOpen = false,
}: {
  material: MaterialWithUrl;
  aiAvailable: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const [transcribing, startTranscribe] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);
  const canTranscribe = !!m.storage_path && (m.kind === "image" || m.kind === "pdf");
  const Icon = m.kind === "image" ? FileImage : m.kind === "note" && !m.storage_path ? NotebookPen : FileText;

  return (
    <li className="group rounded-2xl border border-border bg-panel">
      <div className="flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-2 text-muted">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          {m.url ? (
            <a href={m.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-primary">
              {m.title}
            </a>
          ) : (
            <button type="button" onClick={() => setOpen(!open)} className="block truncate text-left font-medium hover:text-primary">
              {m.title}
            </button>
          )}
          <p className="text-xs text-muted">
            {m.kind === "pdf" ? "PDF" : m.kind === "image" ? "Obrázek" : "Poznámka"}
            {m.size_bytes ? ` · ${formatSize(m.size_bytes)}` : ""} · {formatDate(m.created_at)}
          </p>
          <MaterialStatus material={m} />
          {aiError && <p className="mt-1 text-xs text-danger">{aiError}</p>}
        </div>
        {canTranscribe && aiAvailable && (
          <Button
            variant={m.status === "error" ? "secondary" : "ghost"}
            size="sm"
            disabled={transcribing}
            title="Přečte text z fotky nebo skenu pomocí AI, aby z něj mohl čerpat tutor"
            onClick={() =>
              startTranscribe(async () => {
                setAiError(null);
                const res = await transcribeMaterialAction(m.id);
                if (!res.ok) setAiError(res.error);
                router.refresh();
              })
            }
          >
            <Sparkles size={14} /> {transcribing ? "Přepisuji…" : "Přepsat pomocí AI"}
          </Button>
        )}
        <form
          action={deleteMaterial}
          onSubmit={(e) => {
            if (!window.confirm(`Smazat „${m.title}“?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={m.id} />
          <Button type="submit" variant="danger" size="sm" aria-label="Smazat" className="md:opacity-0 md:group-hover:opacity-100">
            <Trash2 size={14} />
          </Button>
        </form>
      </div>
      {m.kind === "image" && m.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt={m.title} className="max-h-80 w-full border-t border-border object-contain p-3" />
      )}
      {open && m.content && (
        <div className="border-t border-border px-4 py-5 sm:px-6">
          <RichMarkdown text={m.content} />
        </div>
      )}
      {m.storage_path && m.content && (
        <details className="border-t border-border px-4 py-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-text">Zobrazit přečtený text</summary>
          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line text-muted">{m.content}</p>
        </details>
      )}
    </li>
  );
}

function FileUpload({ topicId }: { topicId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(files: File[]) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setStatus("Nejsi přihlášený.");
      return;
    }

    let done = 0;
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setStatus(`„${file.name}“ je větší než 20 MB.`);
        continue;
      }
      setStatus(`Nahrávám ${file.name}…`);
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${userId}/${crypto.randomUUID()}-${safe}`;
      const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : "application/octet-stream");
      const { error } = await supabase.storage.from("materials").upload(path, file, { contentType: mime });
      if (error) {
        setStatus(`Nahrání „${file.name}“ selhalo: ${error.message}`);
        continue;
      }
      const res = await registerUploadedFile({
        topic_id: topicId,
        title: file.name.slice(0, 200),
        storage_path: path,
        mime_type: mime,
        size_bytes: file.size,
      });
      if (res?.error) setStatus(res.error);
      else done++;
    }
    if (done) setStatus(`Nahráno ${done} ${done === 1 ? "soubor" : done < 5 ? "soubory" : "souborů"}.`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          // Kopie: FileList je živý a vynulování inputu níž by ho vyprázdnilo dřív, než upload doběhne.
          const files = Array.from(e.target.files ?? []);
          if (files.length) startTransition(() => upload(files));
          e.target.value = "";
        }}
      />
      <Button variant="secondary" disabled={pending} onClick={() => inputRef.current?.click()}>
        <Upload size={16} /> {pending ? "Nahrávám…" : "Nahrát soubor"}
      </Button>
      {status && <span className="text-sm text-muted" role="status">{status}</span>}
    </div>
  );
}

function MaterialStatus({ material: m }: { material: Material }) {
  if (m.status === "processing") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Zpracovávám…
      </p>
    );
  }
  if (m.status === "error") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-warning">
        <TriangleAlert size={12} /> {m.error ?? "Zpracování selhalo."}
      </p>
    );
  }
  if (m.processed_at) {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-success">
        <CheckCircle2 size={12} /> Připraveno pro AI tutora
      </p>
    );
  }
  return null;
}
