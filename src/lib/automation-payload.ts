/** Shared rule shape for social automations (provider-neutral). */
export type AutomationInput = {
  name: string;
  trigger: "dm" | "comment";
  action: "reply" | "comment_to_dm";
  keyword: string;
  reply: string;
  publicReply?: string | null;
  linkLabel?: string | null;
  linkUrl?: string | null;
  trackClicks: boolean;
  followGate: boolean;
  followAsk?: string | null;
  followButton?: string | null;
  followRetry?: string | null;
  enabled: boolean;
};

export const keywordsOf = (k: string) => k.split(",").map((x) => x.trim()).filter(Boolean);

/** Validates cross-field rules shared by every provider. Returns an error message or null. */
export function validateAutomation(a: AutomationInput): string | null {
  const hasLink = !!a.linkUrl?.trim();
  if (hasLink && !/^https:\/\/[^\s]+$/i.test(a.linkUrl!.trim())) return "Link tombol harus diawali https://";
  if (hasLink && !a.linkLabel?.trim()) return "Isi judul tombol link.";
  if ((a.linkLabel?.trim().length ?? 0) > 20) return "Judul tombol maksimal 20 karakter.";
  if (hasLink && a.reply.length > 640) return "Dengan tombol, isi DM maksimal 640 karakter.";
  if (a.followGate) {
    if (a.trigger === "comment" && a.action !== "comment_to_dm") return "Wajib follow hanya untuk aturan yang mengirim DM.";
    if (!a.followAsk?.trim() || !a.followButton?.trim()) return "Isi ajakan follow dan judul tombol follow.";
    if (a.followButton.trim().length > 20) return "Judul tombol follow maksimal 20 karakter.";
  }
  return null;
}

/** Maps a rule to Tebar's createAutomation body. */
export function toTebarAutomation(accountExternalId: string, a: AutomationInput) {
  const keywords = keywordsOf(a.keyword);
  const kind = a.trigger === "dm"
    ? keywords.length ? "dm_keyword" : "default_reply"
    : a.action === "comment_to_dm" ? "comment_to_dm" : "comment_reply";
  const trigger = a.trigger === "comment"
    ? { scope: "any", keywords, match: keywords.length ? "contains" : "any" }
    : keywords.length ? { keywords, match: "contains" } : {};
  const hasLink = !!a.linkUrl?.trim();
  const actions: Record<string, unknown> = {};
  if (kind === "comment_reply") {
    actions.public_replies = [a.reply];
  } else {
    actions.message = {
      text: a.reply,
      ...(hasLink ? { buttons: [{ type: "web_url", title: a.linkLabel!.trim(), url: a.linkUrl!.trim() }] } : {}),
    };
    if (hasLink) actions.track_clicks = a.trackClicks;
    if (kind === "comment_to_dm" && a.publicReply?.trim()) actions.public_replies = [a.publicReply.trim()];
    if (a.followGate) {
      actions.follow_gate = {
        ask_text: a.followAsk!.trim(),
        button_title: a.followButton!.trim(),
        ...(a.followRetry?.trim() ? { retry_text: a.followRetry.trim() } : {}),
      };
    }
  }
  return { account_id: accountExternalId, kind, name: a.name, enabled: a.enabled, trigger, actions };
}

/** Text DM for providers without button support: link appended, optionally via our click tracker. */
export function dmTextWithLink(a: Pick<AutomationInput, "reply" | "linkLabel" | "linkUrl" | "trackClicks">, ruleId: string, origin: string) {
  if (!a.linkUrl?.trim()) return a.reply;
  const url = a.trackClicks ? `${origin}/l/${ruleId}` : a.linkUrl.trim();
  return `${a.reply}\n\n${a.linkLabel?.trim() || "Buka link"}: ${url}`;
}

/** Comments can be liked through the API only on these platforms. */
export const LIKEABLE_PLATFORMS = ["facebook", "tiktok"] as const;
export const canLikeOn = (platform: string | null | undefined) => (LIKEABLE_PLATFORMS as readonly string[]).includes(platform ?? "");
