// Kerangka MCP minimal (tanpa paket Lovable): definisi tool bertipe zod + server JSON-RPC 2.0 (Streamable HTTP, respons JSON).
// Mendukung initialize, ping, tools/list, tools/call. Autentikasi dilakukan pemanggil (route /mcp) sebelum `handleMcp`.
import { z } from "zod/v4";

export class ToolError extends Error {}

export interface ToolContext {
  userId: string;
  isAuthenticated(): boolean;
  getToken(): string | null;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  shape: Record<string, z.ZodType>;
  annotations?: Record<string, boolean>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export function defineTool<S extends Record<string, z.ZodType>>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations?: Record<string, boolean>;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDef {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    shape: def.inputSchema,
    annotations: def.annotations,
    run: (args, ctx) => def.handler(args as z.infer<z.ZodObject<S>>, ctx),
  };
}

export interface McpServerDef {
  name: string;
  title: string;
  version: string;
  instructions: string;
  tools: ToolDef[];
}

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

function inputJsonSchema(shape: Record<string, z.ZodType>) {
  const js = z.toJSONSchema(z.object(shape), { io: "input", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  delete js.$schema;
  return js;
}

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
}; // eslint-disable-line @typescript-eslint/no-explicit-any

const err = (id: Rpc["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

async function dispatch(server: McpServerDef, msg: Rpc, ctx: ToolContext) {
  const id = msg.id;
  const isNotification = id === undefined || id === null;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: server.name, title: server.title, version: server.version },
          instructions: server.instructions,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: server.tools.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: inputJsonSchema(t.shape),
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        },
      };
    case "tools/call": {
      const tool = server.tools.find((t) => t.name === msg.params?.name);
      if (!tool) return err(id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      const parsed = z.object(tool.shape).safeParse(msg.params?.arguments ?? {});
      if (!parsed.success)
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`,
              },
            ],
          },
        };
      try {
        const out = await tool.run(parsed.data as Record<string, unknown>, ctx);
        return { jsonrpc: "2.0", id, result: out };
      } catch (e) {
        if (!(e instanceof ToolError)) console.error(`[mcp] tool ${tool.name} failed`, e);
        const text =
          e instanceof ToolError ||
          (e instanceof Error && /^(Access denied|This workspace|Authentication)/.test(e.message))
            ? (e as Error).message
            : "Tool failed. Please try again.";
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text }] } };
      }
    }
    default:
      if (isNotification || String(msg.method).startsWith("notifications/")) return null;
      return err(id, -32601, `Method not found: ${String(msg.method)}`);
  }
}

/** Memproses satu pesan atau batch JSON-RPC; mengembalikan `null` bila hanya notifikasi (HTTP 202). */
export async function handleMcp(server: McpServerDef, body: unknown, ctx: ToolContext) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => dispatch(server, m as Rpc, ctx)))).filter(
      Boolean,
    );
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return err(null, -32600, "Invalid Request");
  return dispatch(server, body as Rpc, ctx);
}
