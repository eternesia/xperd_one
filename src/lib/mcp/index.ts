import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getFinancialSummaryTool from "./tools/get-financial-summary";
import getWorkspaceSummaryTool from "./tools/get-workspace-summary";
import listItemsTool from "./tools/list-items";
import listPurchaseDocumentsTool from "./tools/list-purchase-documents";
import listSalesDocumentsTool from "./tools/list-sales-documents";
import listWorkspacesTool from "./tools/list-workspaces";
import searchItemsTool from "./tools/search-items";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "xperd-one",
  title: "Xperd One Business Suite",
  version: "1.0.0",
  instructions:
    "XPERD One Business Suite MCP server. Read-only ERP tools: list workspaces, summarize a workspace, search items, list sales/purchase documents, and get a financial summary. All tools require OAuth authentication and respect the user's workspace permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listWorkspacesTool,
    getWorkspaceSummaryTool,
    listItemsTool,
    searchItemsTool,
    listSalesDocumentsTool,
    listPurchaseDocumentsTool,
    getFinancialSummaryTool,
  ],
});
