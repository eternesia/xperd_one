// Server-side auth middleware for server functions.
// Replaces requireSupabaseAuth: authenticates from the httpOnly `xperd_token`
// cookie (sent automatically on same-origin serverFn RPCs — no bearer header
// plumbing needed) and injects the MySQL-backed user into the context.
import { createMiddleware } from "@tanstack/react-start";

import { getSessionUser } from "@/lib/auth-context.server";

export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");

  return next({
    context: {
      userId: user.id,
      user,
    },
  });
});
