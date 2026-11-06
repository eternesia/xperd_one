// Helper kecil bersama untuk tool MCP Qalling (format waktu, JSON array, hasil tool).
import type { ToolResult } from "./framework";

/** DATETIME UTC dari MySQL (dateStrings) → ISO 8601; null bila kosong/tidak valid. */
export const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(`${String(v).replace(" ", "T")}Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/** Kolom JSON bisa datang sebagai string atau array. */
export const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

export const bool = (v: unknown) => v === 1 || v === true || v === "1";

export function json(structured: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}
