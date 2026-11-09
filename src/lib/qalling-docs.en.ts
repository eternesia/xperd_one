/** English translations for QALLING_DOCS (same ids). Missing fields fall back to Indonesian. */
export interface DocEn {
  title: string;
  summary: string;
  steps?: string[];
  tips?: string[];
  table?: { head: string[]; rows: string[][] };
  codeTitles?: string[];
}

export const GROUP_EN: Record<string, string> = {
  Mulai: "Getting started",
  Fitur: "Features",
  Platform: "Platforms",
  "Pakai dengan AI": "Use with AI",
  Lainnya: "More",
  Developer: "Developer",
  "API Reference": "API Reference",
};

export const QALLING_DOCS_EN: Record<string, DocEn> = {
  mulai: {
    title: "Getting started",
    summary:
      "Qalling is a social media CRM: schedule posts, reply to comments and messages, manage leads and see reports in one dashboard.",
    steps: [
      "Sign up or sign in on the login page with Google or a code sent to your email (no password).",
      "Pick or create a workspace. A workspace usually represents one business or one agency client.",
      "Connect your social accounts (see Connecting accounts).",
      "Create your first post from Content → Posts.",
    ],
    tips: [
      "Start with one account and one test post to get a feel for the flow before scheduling a lot of content.",
      "The bell icon at the top right shows update and promo announcements from the Qalling team; a red dot means something is unread.",
      "Need help? Open Support at the bottom of the sidebar to send a ticket and follow the Qalling team's replies.",
    ],
  },
  akun: {
    title: "Connecting social accounts",
    summary:
      'New users see a "Get started" guide on Home: pick a platform, sign in, then create your first post. It disappears automatically when done. Instagram, Facebook, Threads, TikTok, LinkedIn, YouTube, Pinterest, X, Telegram and Discord accounts can be managed in one place, depending on your plan.',
    steps: [
      "Open Social Accounts and choose Add Account.",
      "Follow the platform's permission flow, then return to Qalling.",
      "Make sure the account shows as connected. If it asks you to reconnect, connect it again.",
    ],
    tips: [
      "Instagram needs a business or creator account. The Facebook account you connect is a Page, not a personal profile.",
      "The number of accounts follows your plan; extra accounts are available as add-ons in Billing & Balance.",
    ],
  },
  media: {
    title: "Media library",
    summary: "Store photos and videos in Content → Media and reuse them across posts.",
    steps: [
      "Open Content → Media, then drag files into the upload area or click to choose.",
      "Organise with folders. Files can be renamed, moved and deleted.",
      "When creating a post, pick media from the library (up to 10 attachments for a carousel).",
    ],
    tips: [
      "Photo and video size limits are set by the service administrator and shown in the upload area.",
      "Large photos are compressed automatically without changing the aspect ratio; animations (GIF/animated WebP) are left intact.",
      "Storage quota follows your plan. If it is almost full, delete unused files or upgrade.",
    ],
  },
  posting: {
    title: "Creating and scheduling posts",
    summary:
      "Write a caption, pick target accounts, attach media, then save as a draft, schedule, or publish now.",
    steps: [
      "Open Content → Post Scheduler and choose Create post.",
      "Pick one or more target accounts, then fill in an internal title and the caption.",
      "Attach media from the library. Several images form a carousel; one video becomes a reel/video depending on the platform.",
      "Choose the publish time. The time zone used is WIB (Asia/Jakarta).",
      "Save as a draft to review, or schedule it to publish automatically.",
    ],
    tips: [
      "A first comment (e.g. hashtags or a link) can be posted automatically after the post goes live on supported platforms.",
      "Some platforms have special options, such as Threads polls, Instagram collaborators, LinkedIn visibility, TikTok/YouTube privacy and Pinterest boards.",
      "If a post fails to publish, the reason is shown; fix it and retry from the post list.",
    ],
  },
  kalender: {
    title: "Content calendar",
    summary: "See all posts by month. Click a date to see its details.",
    steps: [
      "Open Content → Calendar and pick a month or client.",
      "Click a date that has posts to open the detail window.",
      "If a date has several posts, choose from the dropdown to see the caption, media, target accounts, status and post links.",
    ],
  },
  ide: {
    title: "Ideas and campaigns",
    summary: "Collect content ideas, group them into campaigns, then turn them into posts.",
    steps: [
      "Save ideas in Content → Content Ideas with notes and a status.",
      "Group related content into Campaigns to track progress.",
      "Turn ready ideas into posts from the Post Scheduler.",
    ],
  },
  inbox: {
    title: "Inbox, comments and automations",
    summary:
      "Reply to direct messages (DMs) and comments from one inbox, and automate repetitive replies.",
    steps: [
      "Open Conversations → Inbox to read and reply to DMs; mark a conversation as open, snoozed or done.",
      "Open Conversations → Comments to reply to or like comments on your posts.",
      "Comments are grouped per post, with the post image and caption. In the Inbox, pick a Platform and Account to see one account's DMs; through Tebar, DMs are available for Instagram.",
      "Automations created in Tebar also appear in Conversations → Automations with run and link-click counts. Use search and the account or status filters when you have many rules.",
      "In Automations, create a rule: when a comment contains a keyword, send an automatic comment reply and/or DM.",
      "When creating an automation, pick the platform first: Instagram (comment → DM, comment replies, DM replies), or Threads, Facebook Pages and TikTok, which support automatic comment replies only (max 500 characters, 150 on TikTok; up to 30 replies per hour per account).",
      "Use Templates for replies you send often.",
    ],
    tips: [
      "Start with specific keywords so automations don't reply to irrelevant comments.",
      "Watch the results for the first few days and adjust the wording.",
    ],
  },
  crm: {
    title: "Leads, contacts and pipeline",
    summary: "Turn conversations into leads, record interaction history and track sales stages.",
    steps: [
      "Open Sales → Contacts: people who message you become contacts automatically. Add contacts manually, add tags and notes, and see DMs, leads and follow-ups on one timeline.",
      "From the Inbox or the Contacts page, turn a conversation/contact into a lead in one click; a phone number and notes can be added.",
      "Open Sales → Pipeline to move leads between stages.",
      "Log activities (calls, messages, meetings) and schedule Follow-ups so no prospect is missed.",
      "The Home page shows overdue follow-ups and those due today.",
      "In the lead form, choose a Content source (the post or campaign that brought the lead). Open Analytics → Content Attribution to see which content produces leads, closings and sales value.",
      "Click a card in the Pipeline to open the detail panel: timeline, log activities, add dated tasks, mark them done, or snooze the follow-up. Cards flagged Idle (7+ days without activity) or Late need attention; use the Needs follow-up button to filter.",
      "Every morning (from 08:00 WIB) each owner gets one digest email of leads that need follow-up. Manage it in Settings → Notifications (Follow-up digest).",
      "Closed leads can be invoiced right away (Pro and Agency plans): open the detail panel → Invoice → Create invoice. Fill in items, tax and due date; the customer name and contact come from the lead. Send it with the WhatsApp button (the message contains the invoice link), copy the link, or open the PDF, then mark it Paid once settled. Logo, address and bank details come from Settings → Company profile.",
      "Open Analytics → Sales Funnel to see conversion per stage, lost reasons, performance by source and owner, the pipeline forecast (value × probability), and this month's target realization next to paid invoices. Record a reason when you move a lead to Lost so the report is useful.",
      "Send invoices through the official WhatsApp API from your own number: open Automation & Messaging → WhatsApp Gateway and click Connect WhatsApp number. You sign in to Meta, choose your business and number (a number already used in the WhatsApp Business app can stay in use), then return to Qalling; no API key needed. Qalling creates the invoice template, which Meta must approve (minutes to 48 hours). Once approved, the Send via gateway button on a lead's invoice sends it to the customer. Message fees are billed by Meta directly to the payment method on your WhatsApp Business account. Advanced users can use their own Kirimdev API key instead.",
      "WhatsApp costs come as two separate bills: (1) the WhatsApp channel add-on, paid to Qalling monthly, and (2) Meta message fees, billed by Meta directly to the card on your WhatsApp Business account with no markup. Indicative Meta rates for Indonesia as of October 2026: utility (invoices, reminders) Rp356.65/message, marketing (promos, broadcasts) Rp586.33/message, and the first 1,000 replies within the 24-hour window free per number per month; VAT excluded. Details are also on the Pricing page.",
    ],
    tips: [
      "Assign one owner per lead so the follow-up list is clear.",
      "Fill in the Content source when the lead is created; the more complete it is, the more accurate the attribution report.",
    ],
  },
  agency: {
    title: "Agency plan: client approvals & white-label reports",
    summary:
      "Features for agencies: clients approve content through a link, reports carry your agency's brand, and every team change is recorded.",
    steps: [
      "Open Clients & Reports → Agency Studio → Approvals. Pick a draft or scheduled post, add the client's name and a short message, and create the approval link. The post is held as a draft.",
      "Send the link to your client. They open a preview page without logging in and choose Approve or Request changes (a note is required). You get an email and the status appears in the list.",
      "If approved and the schedule is still in the future, the post returns to its schedule automatically. If the schedule has passed, reschedule it manually.",
      "In the Client reports tab, create a report link with your agency's name, logo and colour. Choose all accounts (including leads and closings) or a single client. The link always shows the latest numbers and can be revoked any time.",
      "The Activity log tab shows who changed posts, leads, team members and approvals. Only owners and admins can open it.",
    ],
    tips: [
      "Team member roles (admin, staff, view-only or custom) are managed in Team & Members.",
      "These features are part of the Agency plan; on other plans the tabs show as locked.",
    ],
  },
  analitik: {
    title: "Analytics and best times",
    summary:
      "See account and post performance, and the best times to post, on platforms that provide the data.",
    steps: [
      "Open the Social Dashboard for an account summary and follower growth.",
      "See per-post performance (reach, interactions) when the platform provides it.",
      "Use the best-time suggestions when choosing a schedule.",
    ],
    tips: ["Not every platform exposes statistics; those platforms are marked unavailable."],
  },
  laporan: {
    title: "Clients and reports",
    summary: "Group accounts by client and create reports to share.",
    steps: [
      "Add clients in Clients & Reports, then group their social accounts.",
      "Open Reports to see a summary and download it (PDF/Excel).",
      "Filter the calendar by client to see each client's schedule.",
    ],
    tips: [
      "A weekly post summary is also emailed to the account owner every Monday; you can turn it off in Billing & Balance.",
    ],
  },
  platform: {
    title: "Platform overview",
    summary:
      "Qalling supports many platforms. Capabilities differ per platform; this table summarises the common ones. Details are on each platform's page.",
    table: {
      head: ["Platform", "Posting", "Comments & statistics"],
      rows: [
        ["Instagram", "Photo, carousel, reel, story", "Available"],
        ["Facebook (Page)", "Text, photo, video/reel", "Available"],
        ["Threads", "Text, photo, video, poll, thread", "Depends on platform"],
        ["TikTok", "Video or photos", "Depends on platform"],
        ["YouTube", "One video (Shorts automatically when eligible)", "Depends on platform"],
        ["LinkedIn", "Text, images, document carousel, video", "Not available"],
        ["X", "Text, photo, video", "Depends on platform"],
        ["Pinterest", "One photo per Pin to a board", "Not available"],
        ["Telegram", "Text, media album to a channel/group", "Not available"],
        ["Discord", "Text and files to a server channel", "Not available"],
      ],
    },
    tips: [
      "Feature availability also depends on your plan and the permissions granted by the platform.",
      "Platform-specific options (polls, collaborators, privacy and so on) are set through the AI assistant or the scheduler, depending on the feature.",
    ],
  },
  instagram: {
    title: "Instagram",
    summary: "Post to the feed, carousels, reels and stories on a business or creator account.",
    steps: [
      "A single photo, a carousel (several images), or one video (becomes a reel).",
      "Story: exactly one image or video with no caption.",
      "Collaborators: invite up to three accounts as co-authors (Collab post); they accept the invite in the Instagram app.",
      "Trial reel: show the reel to non-followers first; the account must be eligible per Instagram.",
      "A first comment (hashtags or a link) is posted automatically after publishing; up to 30 hashtags.",
    ],
    tips: ["Instagram always needs at least one image or video."],
  },
  facebook: {
    title: "Facebook (Page)",
    summary: "Post to a Facebook Page, not a personal profile.",
    steps: [
      "Text with a link card, photos, or one video.",
      "One video can be published as a reel (vertical) or a regular video.",
      "First comment is supported.",
    ],
    tips: ["Facebook videos are posted on their own, not combined with photos."],
  },
  threads: {
    title: "Threads",
    summary: "Post text, media, threads and polls.",
    steps: [
      "Up to 500 characters per part; longer text is split into a thread (continuing replies).",
      "A poll has 2–4 options (up to 25 characters each).",
      "Topic tag, link card and reply-control settings are available.",
    ],
    tips: ["Polls, link cards and long-text attachments are only for posts without media."],
  },
  tiktok: {
    title: "TikTok",
    summary: "Post one video or 1–35 photos.",
    steps: [
      "Choose a mode: publish directly, or send as a draft to your TikTok inbox to finish in the app.",
      "Privacy (public, friends, followers, only me) is chosen by you; comment, duet and stitch permissions are set separately.",
      "The video cover can be picked from a specific frame.",
    ],
    tips: [
      "The first comment is limited to 150 characters and only for certain accounts and modes.",
    ],
  },
  youtube: {
    title: "YouTube",
    summary: "Upload one video to a channel.",
    steps: [
      "A title (1–100 characters) is required. The description comes from the caption.",
      "You must state whether the video is made for kids; this must never be assumed.",
      "Choose privacy: public, unlisted or private. Tags and category are optional.",
    ],
    tips: ["Vertical or square videos up to 3 minutes automatically become Shorts."],
  },
  linkedin: {
    title: "LinkedIn",
    summary: "Post to a personal LinkedIn profile.",
    steps: [
      "Up to 3000 characters of text, one image, 2–20 images, or one MP4 video.",
      "Visibility: public or connections only.",
      "Several images can be posted as a document carousel (PDF) with a title.",
    ],
    tips: ["LinkedIn comments and statistics are not available in Qalling."],
  },
  x: {
    title: "X",
    summary: "Post text, photos or video to an X account.",
    steps: [
      'Mark "made with AI" for posts with photos or video when relevant.',
      "Check the per-post cost on the Pricing page or with the service administrator before posting.",
    ],
  },
  pinterest: {
    title: "Pinterest",
    summary: "Post one photo as a Pin to a board.",
    steps: [
      "Choose the target board; this is required.",
      "A title (max 100 characters) and destination link are optional; the caption becomes the description (max 800 characters).",
    ],
    tips: ["Video Pins are not available yet. Comments and statistics are not available."],
  },
  telegram: {
    title: "Telegram",
    summary: "Post to a channel or group where the bot has been added.",
    steps: [
      "Up to 4096 characters of text, or 1024 characters with media; up to 10 media items as an album.",
      "Silent mode and forwarding/saving restrictions are available.",
    ],
    tips: ["The bot is added to the channel or group from the dashboard, not from Telegram."],
  },
  discord: {
    title: "Discord",
    summary: "Post to a server channel.",
    steps: [
      "Up to 2000 characters of text and up to 10 files (max 20 MB each).",
      "Mentions such as @everyone never notify anyone.",
    ],
  },
  ai: {
    title: "Manage Qalling from ChatGPT or Claude",
    summary:
      "Connect an AI assistant to Qalling so it can create drafts, schedule posts, read comments and manage leads through conversation.",
    steps: [
      "Open AI Integration & MCP in the app and follow the instructions to connect ChatGPT or Claude.",
      "Approve access on the consent screen that appears.",
      "Ask the assistant to do tasks, for example drafting a post or summarising unanswered comments.",
    ],
    tips: [
      "Actions that reach customers (publish now, send a DM, reply to a comment) always ask for your approval first.",
      "You can revoke access at any time from the AI settings.",
    ],
  },
  tagihan: {
    title: "Billing, balance and renewal",
    summary:
      "Top up your balance, renew your subscription from the balance and download payment receipts in Billing & Balance.",
    steps: [
      "Click Top up on the balance at the top to add funds.",
      "Turn on auto-renewal so the subscription is deducted from the balance when due.",
      "Download PDF receipts from the Invoice history tab.",
    ],
    tips: [
      "You receive reminder emails when your trial is about to end, when the balance is not enough for renewal, and a receipt after a top-up or renewal.",
      "Trial reminders, receipts and the weekly summary can be turned off in Billing & Balance. Low-balance warnings are always sent because they affect your service.",
    ],
  },
  referral: {
    title: "Referral",
    summary: "Invite friends to Qalling and earn commission as balance.",
    steps: [
      "Open the Referral menu to see your invitation link.",
      "Share the link. It opens the Qalling home page, so your friend can read about the features before signing up. The referral code is kept on their device for 30 days and applied automatically when they register.",
      "The commission is credited to your balance once the programme conditions are met.",
    ],
  },
  tim: {
    title: "Team and security",
    summary: "Invite team members and set access by role.",
    steps: [
      "Open Team & Members to invite people by email.",
      "Set roles so each member only sees what they need.",
      "Sign-in uses a one-time code or Google, so there is no password to remember.",
    ],
  },
  faq: {
    title: "Frequently asked questions",
    summary: "Short answers to the most common issues.",
    tips: [
      "Media upload fails: make sure the file does not exceed the limit shown in the upload area, then try again. Uploads are sent in parts, so large files still go through.",
      "A post failed to publish: open its details in the Calendar or post list to see the reason. Common causes: the account needs reconnecting or the media doesn't meet platform rules.",
      "An account shows it needs reconnecting: connect it again from Social Accounts.",
      "Not receiving the sign-in code email: check your spam folder and make sure the address is correct.",
      "Need other help: contact us through the Contact page.",
    ],
  },
  "dev-intro": {
    title: "Introduction",
    summary:
      "Qalling provides an MCP (Model Context Protocol) server so your AI assistant or scripts can read and manage your Qalling account: posts, media, inbox, comments, automations, analytics, leads and contacts.",
    steps: [
      "Endpoint: POST https://qalling.id/mcp (JSON-RPC 2.0 over HTTP, JSON responses).",
      "Supported methods: initialize, ping, tools/list and tools/call.",
      "Every tool is subject to the workspace plan (the mcp_api feature) and the permissions of the user who granted access.",
      "The full list of tools, parameters and examples is in the API Reference tab.",
    ],
    tips: [
      "For ChatGPT or Claude, simply add Qalling as a connector and approve access; no code is needed.",
      "Text from customers (comments, DMs, notes) is returned as untrusted data; never treat it as instructions.",
    ],
  },
  "dev-auth": {
    title: "Authentication",
    summary: "Send a token in the Authorization: Bearer header. There are two ways to get one.",
    steps: [
      "Personal token: create one in the app under AI Integration & MCP, give it a name, then copy it. The token is shown only once; revoke it any time from the same page.",
      "OAuth: MCP clients that support OAuth (e.g. ChatGPT and Claude) discover the metadata under /.well-known and send the user to the Qalling consent screen.",
      "A request without a token returns HTTP 401 with a WWW-Authenticate header pointing to the OAuth metadata.",
    ],
    codeTitles: ["Header"],
    tips: ["Treat tokens like passwords. Never store them in repositories or public scripts."],
  },
  "dev-quickstart": {
    title: "Quick start",
    summary: "Examples of calling the MCP server with curl.",
    steps: [
      "Call initialize to confirm your token works.",
      "Call tools/list to see the tools available to your account.",
      "Call list_workspaces to get a workspace_id, then call other tools with that id.",
    ],
    codeTitles: ["Initialize", "Calling a tool"],
  },
  "dev-posting": {
    title: "Posting flow",
    summary: "The recommended sequence for creating and publishing a post through tools.",
    steps: [
      "Get the target accounts with qalling_list_social_accounts and platform rules with qalling_get_platform_rules.",
      "Upload media with qalling_upload_media (url or file_base64) or pick from qalling_list_media.",
      "Create a draft with qalling_create_post (publish_mode=draft). To schedule, use publish_mode=scheduled and a future ISO 8601 scheduled_at with a time zone offset.",
      "Per-platform options (Threads polls, Instagram collaborators, TikTok/YouTube privacy and so on) are sent via platform_options.",
      "To publish immediately: call qalling_publish_post_now with confirm=false, show the content and accounts to the user, then confirm=true once approved.",
      "Track the result with qalling_list_posts or qalling_get_post; publishing runs on the next scheduler cycle, not synchronously.",
    ],
    codeTitles: ["Scheduled post with a Threads poll"],
    tips: [
      "Never resend a post whose status is uncertain (processing/unknown); read its status first.",
    ],
  },
  "dev-safety": {
    title: "Actions that reach customers",
    summary:
      "Tools that send something to a customer or the public use a two-step confirmation so nothing is sent without approval.",
    steps: [
      "Call the tool with confirm=false. The result is an exact preview of the content and recipient.",
      "Show the preview to the user and ask for explicit approval.",
      "Call again with confirm=true. The server uses compare-and-set so nothing is sent twice.",
    ],
    tips: [
      "Applies to qalling_publish_post_now, qalling_send_dm, qalling_reply_to_comment and qalling_retry_post.",
      "New automations are created disabled; enable them only after approval.",
      "CRM tools (leads, activities, contacts) never contact the customer.",
    ],
  },
  "dev-errors": {
    title: "Errors and limits",
    summary: "How to read failures and the limits to be aware of.",
    steps: [
      "Tool failures are returned with isError=true and a message in content; protocol failures use JSON-RPC error codes.",
      "401: the token is missing, wrong or revoked. Access denied: your role cannot modify the workspace, or the feature is not in the plan.",
      "Plan quotas (number of accounts, monthly posts, media storage) are enforced for tools as well.",
      "media_urls only accept allowed CDNs; for other hosts upload first and use media_ids.",
    ],
    tips: [
      "Scheduled publishing needs the scheduler running; read the final status with qalling_get_post.",
    ],
  },
  "api-reference": {
    title: "MCP tool list",
    summary:
      "Every available tool with its parameters. This list is generated directly from the server definitions, so it always matches the latest version.",
  },
};
