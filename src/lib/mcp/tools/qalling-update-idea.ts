import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_update_idea",
  title: "Edit or move a content idea",
  description:
    "Edit an idea card's title or text and/or move it to another board column (by column name, e.g. 'Progress' or 'Done'). Only the fields you pass change.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    idea_id: z.string().uuid().describe("Idea id from qalling_list_ideas."),
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().max(5000).optional(),
    column: z.string().max(80).optional().describe("Target column name from qalling_list_ideas."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, idea_id, title, body, column }, ctx) => {
    requireAuth(ctx);
    if (title === undefined && body === undefined && column === undefined)
      throw new ToolError("Nothing to change: pass title, body and/or column.");
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "ideas_campaigns", true);
    const { executeOne, result } = await import("@/integrations/mysql/pool");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (column !== undefined) {
      const col = await executeOne<{ id: string }>(
        "SELECT id FROM crm_idea_columns WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        [workspace_id, column],
      );
      if (!col) throw new ToolError("Column not found; use a column name from qalling_list_ideas.");
      sets.push("column_id = ?");
      params.push(col.id);
    }
    if (title !== undefined) {
      sets.push("title = ?");
      params.push(title);
    }
    if (body !== undefined) {
      sets.push("body = ?");
      params.push(body);
    }
    const r = await result(
      `UPDATE crm_ideas SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
      [...params, workspace_id, idea_id],
    );
    if (!r.affectedRows) {
      const exists = await executeOne<{ id: string }>(
        "SELECT id FROM crm_ideas WHERE workspace_id = ? AND id = ?",
        [workspace_id, idea_id],
      );
      if (!exists) throw new ToolError("Idea not found in this workspace.");
    }
    return json({ id: idea_id, updated: true });
  },
});
