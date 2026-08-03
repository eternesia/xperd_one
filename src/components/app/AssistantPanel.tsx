import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { askAssistant } from "@/lib/assistant.functions";
import { useI18n } from "@/lib/i18n";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function AssistantPanel({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context?: string;
}) {
  const { lang } = useI18n();
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await ask({ data: { messages: next, lang, context } });
      setMessages([...next, { role: "assistant", content: res.text }]);
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Assistant is unavailable right now.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold" />
            XPERD Assistant
          </SheetTitle>
          <SheetDescription>
            {lang === "id"
              ? "Tanya apa saja tentang modul dan proses di workspace ini."
              : "Ask anything about the modules and processes in this workspace."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {lang === "id"
                  ? "Contoh: “Bagaimana alur stok opname?” atau “Jelaskan metode costing FIFO.”"
                  : "Try: “How does the stock opname flow work?” or “Explain FIFO costing.”"}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-3 py-2 text-sm text-primary-foreground"
                    : "mr-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm text-foreground"
                }
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {lang === "id" ? "Menyusun jawaban…" : "Thinking…"}
              </div>
            )}
          </div>
        </ScrollArea>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={lang === "id" ? "Tulis pertanyaan…" : "Type a question…"}
          />
          <Button type="submit" variant="navy" size="icon" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}