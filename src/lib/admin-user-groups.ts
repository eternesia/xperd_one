export function newestWorkspaceGroups<T extends { users: { u: { createdAt: string | null } }[] }>(
  groups: T[],
): T[] {
  const timestamp = (date: string | null) => (date ? Date.parse(date) || 0 : 0);
  return groups
    .map((group) => ({
      ...group,
      users: [...group.users].sort((a, b) => timestamp(b.u.createdAt) - timestamp(a.u.createdAt)),
    }))
    .sort(
      (a, b) =>
        timestamp(b.users[0]?.u.createdAt ?? null) - timestamp(a.users[0]?.u.createdAt ?? null),
    );
}
