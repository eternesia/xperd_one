import type { McpServerDef } from "./framework";
import getFinancialSummaryTool from "./tools/get-financial-summary";
import getWorkspaceSummaryTool from "./tools/get-workspace-summary";
import listItemsTool from "./tools/list-items";
import listPurchaseDocumentsTool from "./tools/list-purchase-documents";
import listSalesDocumentsTool from "./tools/list-sales-documents";
import listWorkspacesTool from "./tools/list-workspaces";
import searchItemsTool from "./tools/search-items";
import qallingListSocialAccountsTool from "./tools/qalling-list-social-accounts";
import qallingListPostsTool from "./tools/qalling-list-posts";
import qallingCreatePostDraftTool from "./tools/qalling-create-post-draft";
import qallingSearchLeadsTool from "./tools/qalling-search-leads";
import qallingCreateLeadTool from "./tools/qalling-create-lead";
import qallingCreateIdeaTool from "./tools/qalling-create-idea";
import qallingListCommentsTool from "./tools/qalling-list-comments";
import qallingLikeCommentsTool from "./tools/qalling-like-comments";

const mcp: McpServerDef = {
  name: "xperd-one",
  title: "Xperd One Business Suite",
  version: "1.0.0",
  instructions:
    "XPERD One Business Suite MCP server. ERP tools: list workspaces, summarize a workspace, search items, list sales/purchase documents, get a financial summary. Qalling CRM tools: list social accounts and posts, create post drafts (never published directly; the user schedules them in the app), search and create leads, add content ideas (with optional media URLs) to the Ideas board, list comments and like comments on Facebook Pages and TikTok. All tools require authentication and respect the user's workspace permissions and plan (feature mcp_api).",
  tools: [
    listWorkspacesTool,
    getWorkspaceSummaryTool,
    listItemsTool,
    searchItemsTool,
    listSalesDocumentsTool,
    listPurchaseDocumentsTool,
    getFinancialSummaryTool,
    qallingListSocialAccountsTool,
    qallingListPostsTool,
    qallingCreatePostDraftTool,
    qallingSearchLeadsTool,
    qallingCreateLeadTool,
    qallingCreateIdeaTool,
    qallingListCommentsTool,
    qallingLikeCommentsTool,
  ],
};
export default mcp;
