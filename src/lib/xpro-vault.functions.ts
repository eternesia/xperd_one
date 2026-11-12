/**
 * XPro — Teknis & Serah Terima: server functions (hak akses ditegakkan di xpro-vault.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const rid = z.string().min(1).max(64);
const ids = { workspaceId: rid, projectId: rid };
const KINDS = [
  "repo",
  "database",
  "server",
  "url",
  "domain",
  "service",
  "account",
  "other",
] as const;
const ENVS = ["production", "staging", "development", "other"] as const;
const CATS = ["setup", "architecture", "deploy", "handover", "log", "other"] as const;
const opt = (max: number) => z.string().max(max).nullable().optional();

export const listXproTech = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object(ids).parse(v))
  .handler(async ({ data, context }) => {
    const { listTechData } = await import("./xpro-vault.server");
    return listTechData(data.workspaceId, data.projectId, context.userId);
  });

export const saveXproTechAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        ...ids,
        id: rid.optional(),
        kind: z.enum(KINDS),
        name: z.string().trim().min(1).max(150),
        environment: z.enum(ENVS),
        url: opt(500),
        host: opt(255),
        username: opt(150),
        secret_label: opt(60),
        secret: z.string().max(4000).optional(),
        account_owner: opt(150),
        notes: opt(5000),
        verified: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { saveTechAsset } = await import("./xpro-vault.server");
    return saveTechAsset(data, context.userId);
  });

export const deleteXproTechAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ ...ids, id: rid }).parse(v))
  .handler(async ({ data, context }) => {
    const { deleteTechAsset } = await import("./xpro-vault.server");
    await deleteTechAsset(data.workspaceId, data.projectId, data.id, context.userId);
    return { ok: true };
  });

export const revealXproTechSecret = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ ...ids, id: rid }).parse(v))
  .handler(async ({ data, context }) => {
    const { revealTechSecret } = await import("./xpro-vault.server");
    return revealTechSecret(data.workspaceId, data.projectId, data.id, context.userId);
  });

export const saveXproTechNote = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        ...ids,
        id: rid.optional(),
        category: z.enum(CATS),
        title: z.string().trim().min(1).max(200),
        body: z.string().max(200_000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { saveTechNote } = await import("./xpro-vault.server");
    return saveTechNote(data, context.userId);
  });

export const deleteXproTechNote = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ ...ids, id: rid }).parse(v))
  .handler(async ({ data, context }) => {
    const { deleteTechNote } = await import("./xpro-vault.server");
    await deleteTechNote(data.workspaceId, data.projectId, data.id, context.userId);
    return { ok: true };
  });

export const exportXproHandover = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ ...ids, includeSecrets: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { exportHandover } = await import("./xpro-vault.server");
    return exportHandover(data.workspaceId, data.projectId, context.userId, data.includeSecrets);
  });
