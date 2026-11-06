/** Daftar tool MCP untuk halaman API Reference (publik; hanya metadata tool, tanpa data pengguna). */
import { createFileRoute } from "@tanstack/react-router";

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

function typeOf(s: Record<string, unknown>): string {
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  if (s.anyOf)
    return (s.anyOf as Record<string, unknown>[])
      .map(typeOf)
      .filter((t) => t !== "null")
      .join(" | ");
  const t = s.type;
  if (t === "array") return `${typeOf((s.items as Record<string, unknown>) ?? {})}[]`;
  const base = Array.isArray(t) ? t.join(" | ") : String(t ?? "object");
  return s.format ? `${base} (${String(s.format)})` : base;
}

let cache: unknown = null;

async function build() {
  if (cache) return cache;
  const [{ default: mcp }, { z }] = await Promise.all([
    import("@/lib/mcp/index"),
    import("zod/v4"),
  ]);
  const tools = mcp.tools.map((t) => {
    const js = z.toJSONSchema(z.object(t.shape), { io: "input", unrepresentable: "any" }) as {
      properties?: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    const required = new Set(js.required ?? []);
    const params: Param[] = Object.entries(js.properties ?? {}).map(([name, p]) => ({
      name,
      type: typeOf(p),
      required: required.has(name),
      description: String(p.description ?? ""),
      ...(p.default !== undefined ? { default: p.default } : {}),
    }));
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      readOnly: t.annotations?.readOnlyHint === true,
      params,
    };
  });
  cache = { server: { name: mcp.name, version: mcp.version }, tools };
  return cache;
}

export const Route = createFileRoute("/api/public/docs/mcp-tools")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await build(), {
            headers: { "Cache-Control": "public, max-age=300" },
          });
        } catch {
          return Response.json({ error: "unavailable" }, { status: 500 });
        }
      },
    },
  },
});
