import { ManagerOnly } from "@/components/app/ManagerOnly";
import { createFileRoute } from "@tanstack/react-router";

import { TeamPage } from "@/components/app/TeamPage";

export const Route = createFileRoute("/app/w/$workspaceId/team")({
  head: () => ({
    meta: [
      { title: "Team & Access — XPERD One" },
      { name: "description", content: "Manage workspace members, roles, and module access." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GuardedTeamRoute,
});

function TeamRoute() {
  return <TeamPage />;
}

function GuardedTeamRoute() {
  const { workspaceId } = Route.useParams();
  return (
    <ManagerOnly workspaceId={workspaceId}>
      <TeamRoute />
    </ManagerOnly>
  );
}
