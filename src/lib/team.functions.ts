import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CreateUserInput {
  workspaceId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: "admin" | "staff" | "viewer";
}

export const createWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateUserInput) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data.email?.includes("@")) throw new Error("Valid email is required");
    if (!data.password || data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!["admin", "staff", "viewer"].includes(data.role)) throw new Error("Invalid role");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me, error: meErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (!me || !["owner", "admin"].includes(me.role)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    let newUserId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone ?? null },
    });

    if (created.error) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (!existing) throw new Error(created.error.message);
      newUserId = existing.id;
    } else {
      newUserId = created.data.user?.id ?? null;
    }
    if (!newUserId) throw new Error("Could not create the user account");

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: data.fullName,
      phone: data.phone ?? null,
    });

    const { error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .upsert({ workspace_id: data.workspaceId, user_id: newUserId, role: data.role }, { onConflict: "workspace_id,user_id" });
    if (memberErr) throw new Error(memberErr.message);

    return { userId: newUserId, email };
  });

export const updateWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    workspaceId: string;
    targetUserId: string;
    fullName?: string;
    phone?: string;
    password?: string;
  }) => {
    if (!data?.workspaceId || !data.targetUserId) throw new Error("Missing user");
    if (data.password && data.password.length < 8) throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || !["owner", "admin"].includes(me.role)) throw new Error("Forbidden");

    const { data: target } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    if (!target) throw new Error("User is not a member of this workspace");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    if (data.fullName !== undefined || data.phone !== undefined) {
      const patch: { full_name?: string | null; phone?: string | null } = {};
      if (data.fullName !== undefined) patch.full_name = data.fullName;
      if (data.phone !== undefined) patch.phone = data.phone;
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.targetUserId);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });