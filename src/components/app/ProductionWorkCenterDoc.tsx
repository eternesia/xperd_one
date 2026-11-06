export function ProductionWorkCenterDoc({ workspaceId, docId }: { workspaceId: string; docId: string }) {
  return <p className="text-sm text-muted-foreground">TODO {workspaceId} {docId}</p>;
}
