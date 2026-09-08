import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const Input = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
  lang: z.enum(["en", "id"]).default("en"),
  context: z.string().max(500).optional(),
});

export const askAssistant = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI assistant is not configured");

    const gateway = createLovableAiGatewayProvider(key);

    const system = [
      "You are XPERD Assistant, an in-app helper for the XPERD One ERP platform.",
      "You help users with master data, procurement, inventory, sales/POS, cash & bank, accounting, tax, fixed assets, manufacturing, reporting, CRM and HR modules.",
      "Answer concisely with practical, step-by-step guidance. Use markdown-free plain text.",
      data.lang === "id" ? "Reply in Indonesian." : "Reply in English.",
      data.context ? `Current app context: ${data.context}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system,
        messages: data.messages,
      });
      return { text };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("429")) throw new Error("Assistant is rate limited. Please try again shortly.");
      if (message.includes("402")) throw new Error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error("Assistant is unavailable right now.");
    }
  });