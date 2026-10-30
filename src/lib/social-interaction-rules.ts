export const IDEA_DEFAULT_COLUMNS = ['Todo', 'Progress', 'Done'];
export function automationMatches(keyword: string, body: string) {
  return !keyword.trim() || body.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase());
}
export type MetaCommentEvent = { accountExternalId: string; commentId: string; postId: string; authorId: string; author: string; body: string; removed: boolean };
export function normalizeMetaComments(payload: unknown): MetaCommentEvent[] {
  const p = payload as { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Record<string, any> }> }> };
  if (!p || !['page','instagram'].includes(p.object ?? '') || !Array.isArray(p.entry)) return [];
  const events: MetaCommentEvent[] = [];
  for (const entry of p.entry) for (const change of entry.changes ?? []) {
    const v = change.value;
    if (!v || typeof entry.id !== 'string') continue;
    if (change.field !== 'comments' && !(change.field === 'feed' && v.item === 'comment')) continue;
    const commentId = v.comment_id ?? v.id;
    const postId = v.post_id ?? v.media?.id;
    if (typeof commentId !== 'string' || typeof postId !== 'string') continue;
    const authorId = typeof v.from?.id === 'string' ? v.from.id : '';
    if (authorId === entry.id || v.parent_id && v.parent_id !== postId) continue;
    const body = v.message ?? v.text ?? '';
    if (typeof body !== 'string') continue;
    events.push({ accountExternalId: entry.id, commentId, postId, authorId, author: String(v.from?.name ?? v.from?.username ?? 'Pengguna').slice(0,200), body: body.slice(0,10000), removed: v.verb === 'remove' });
  }
  return events;
}