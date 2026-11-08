import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
  upsertWorkspaceRows,
} from "@/lib/data.functions";
import { cn } from "@/lib/utils";
import { IDEA_DEFAULT_COLUMNS } from "@/lib/social-interaction-rules";

/**
 * Qalling **Ideas** (Kanban ide konten) — diporting apa adanya dari BS New 11
 * `src/components/app/CrmIdeas.tsx` (teks Indonesia di komponen itu memang hardcode di
 * live, jadi tidak dilokalisasi). Hanya lapisan datanya yang memakai server fn MySQL Old.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type IdeaColumn = { id: string; name: string; position: number };
type Idea = { id: string; column_id: string; title: string; body: string };

const rowsOf = (r: unknown) => ((r as { rows?: any[] } | undefined)?.rows ?? []) as any[];

export function CrmIdeasView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [mobileCol, setMobileCol] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{
    id?: string;
    title: string;
    body: string;
    column_id: string;
  } | null>(null);
  const [column, setColumn] = useState<{ id?: string; name: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-ideas", workspaceId] });
  const board = useQuery({
    queryKey: ["crm-ideas", workspaceId],
    queryFn: async () => {
      try {
        const [columns, ideas] = await Promise.all([
          listWorkspaceRows({
            data: {
              table: "crm_idea_columns",
              workspaceId,
              orderBy: "position",
              orderDir: "asc",
              limit: 1000,
            },
          }),
          listWorkspaceRows({
            data: {
              table: "crm_ideas",
              workspaceId,
              orderBy: "created_at",
              orderDir: "asc",
              limit: 5000,
            },
          }),
        ]);
        return {
          columns: rowsOf(columns).map((c) => ({
            ...c,
            position: Number(c.position) || 0,
          })) as IdeaColumn[],
          ideas: rowsOf(ideas) as Idea[],
        };
      } catch {
        throw new Error("Papan ide tidak dapat dimuat.");
      }
    },
  });
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setCard(null);
      setColumn(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Perubahan tidak dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }
  const save = (table: string, id: string | undefined, data: Record<string, unknown>) =>
    saveWorkspaceRow({ data: { table, workspaceId, id, data } });
  const cols = board.data?.columns ?? [];
  const cards = board.data?.ideas ?? [];
  return (
    <div className="min-w-0 space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="text-2xl font-medium">Ideas</h1>
        <Button variant="outline" onClick={() => setColumn({ name: "" })}>
          <Plus className="size-4" />
          Kolom
        </Button>
      </header>
      <Input
        className="sm:max-w-80"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Cari ide…"
      />
      {board.error && <p className="text-destructive">{board.error.message}</p>}
      {board.isLoading ? (
        <p className="text-muted-foreground">Memuat ide…</p>
      ) : cols.length === 0 ? (
        <div className="border-y py-12 text-center">
          <Lightbulb className="mx-auto mb-4 size-8 text-primary" />
          <Button
            disabled={busy}
            onClick={() =>
              action(() =>
                upsertWorkspaceRows({
                  data: {
                    table: "crm_idea_columns",
                    workspaceId,
                    rows: IDEA_DEFAULT_COLUMNS.map((name, position) => ({ name, position })),
                  },
                }),
              )
            }
          >
            Mulai papan ide
          </Button>
        </div>
      ) : (
        <>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 md:hidden">
            {cols.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setMobileCol(c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm",
                  (mobileCol ?? cols[0]?.id) === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground",
                )}
              >
                {c.name}{" "}
                <span className="opacity-70">
                  {cards.filter((i) => i.column_id === c.id).length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex max-w-full gap-4 overflow-x-auto pb-5">
            {cols.map((c) => (
              <section
                key={c.id}
                className={cn(
                  "w-full shrink-0 rounded-2xl bg-muted/50 md:w-72 md:rounded-md",
                  (mobileCol ?? cols[0]?.id) !== c.id && "max-md:hidden",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/plain");
                  if (cards.some((i) => i.id === id))
                    void action(() => save("crm_ideas", id, { column_id: c.id }));
                }}
              >
                <div className="flex items-center justify-between gap-2 border-b p-3">
                  <h2 className="truncate text-sm font-medium">
                    {c.name}{" "}
                    <span className="text-muted-foreground">
                      {cards.filter((i) => i.column_id === c.id).length}
                    </span>
                  </h2>
                  <div className="flex">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Ubah kolom ${c.name}`}
                      onClick={() => setColumn({ id: c.id, name: c.name })}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={cards.some((i) => i.column_id === c.id) || busy}
                      aria-label={`Hapus kolom ${c.name}`}
                      onClick={() =>
                        action(() =>
                          deleteWorkspaceRow({
                            data: { table: "crm_idea_columns", workspaceId, id: c.id },
                          }),
                        )
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
                <div className="min-h-48 space-y-3 p-3">
                  {cards
                    .filter(
                      (i) =>
                        i.column_id === c.id &&
                        `${i.title} ${i.body}`.toLowerCase().includes(term.toLowerCase()),
                    )
                    .map((i) => (
                      <article
                        key={i.id}
                        draggable={!busy}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                        className="rounded-md border bg-background p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 break-words text-sm font-medium">{i.title}</h3>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 shrink-0"
                            aria-label={`Ubah ide ${i.title}`}
                            onClick={() => setCard(i)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {i.body}
                        </p>
                        <label className="mt-4 block text-xs text-muted-foreground">
                          Pindah ke
                          <select
                            aria-label={`Pindah ide ${i.title}`}
                            className="mt-1 w-full rounded border bg-background p-1 text-foreground"
                            value={i.column_id}
                            disabled={busy}
                            onChange={(e) =>
                              action(() => save("crm_ideas", i.id, { column_id: e.target.value }))
                            }
                          >
                            {cols.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </article>
                    ))}
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setCard({ title: "", body: "", column_id: c.id })}
                  >
                    <Plus className="size-4" />
                    Tambah ide
                  </Button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <Dialog open={!!column} onOpenChange={(v) => !v && setColumn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{column?.id ? "Ubah kolom" : "Tambah kolom"}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Nama kolom"
            maxLength={80}
            value={column?.name ?? ""}
            onChange={(e) => column && setColumn({ ...column, name: e.target.value })}
          />
          <DialogFooter>
            <Button
              disabled={busy || !column?.name.trim()}
              onClick={() => {
                if (!column) return;
                void action(() =>
                  column.id
                    ? save("crm_idea_columns", column.id, { name: column.name.trim() })
                    : save("crm_idea_columns", undefined, {
                        name: column.name.trim(),
                        position: cols.length,
                      }),
                );
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!card} onOpenChange={(v) => !v && setCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{card?.id ? "Ubah ide" : "Ide baru"}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Judul ide"
            maxLength={200}
            value={card?.title ?? ""}
            onChange={(e) => card && setCard({ ...card, title: e.target.value })}
          />
          <Textarea
            aria-label="Catatan ide"
            value={card?.body ?? ""}
            onChange={(e) => card && setCard({ ...card, body: e.target.value })}
          />
          <DialogFooter>
            {card?.id && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  if (card.id)
                    void action(() =>
                      deleteWorkspaceRow({
                        data: { table: "crm_ideas", workspaceId, id: card.id as string },
                      }),
                    );
                }}
              >
                Hapus
              </Button>
            )}
            <Button
              disabled={busy || !card?.title.trim()}
              onClick={() => {
                if (!card) return;
                const payload = {
                  title: card.title.trim(),
                  body: card.body,
                  column_id: card.column_id,
                };
                void action(() => save("crm_ideas", card.id, payload));
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
