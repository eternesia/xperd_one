import { defineMcp } from "@lovable.dev/mcp-js";
import getFinancialSummaryTool from "./tools/get-financial-summary";
import getWorkspaceSummaryTool from "./tools/get-workspace-summary";
import listItemsTool from "./tools/list-items";
import listPurchaseDocumentsTool from "./tools/list-purchase-documents";
import listSalesDocumentsTool from "./tools/list-sales-documents";
import listWorkspacesTool from "./tools/list-workspaces";
import searchItemsTool from "./tools/search-items";

export default defineMcp({
  name: "xperd-one",
  title: "Xperd One Business Suite",
  version: "1.0.0",
  instructions:
    "XPERD One Business Suite MCP server. Read-only ERP tools: list workspaces, summarize a workspace, search items, list sales/purchase documents, and get a financial summary. All tools require OAuth authentication and respect the user's workspace permissions.",
  // Self-hosted: the MCP server authenticates the bearer token as the app's
  // own JWT (auth-jwt.server) and gates each tool by workspace membership.
  // Configure the MCP client with the same app token used by the app.
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
