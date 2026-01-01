import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const REGULATORY_SYSTEM_PROMPT = `You are a medical device regulatory affairs expert assistant specializing in post-market surveillance and PSUR (Periodic Safety Update Report) generation according to EU MDR 2017/745 and MDCG 2022-21 guidance.

Your expertise includes:
- EU MDR Article 86 PSUR requirements
- MDCG 2022-21 PSUR structure and content guidance
- IMDRF adverse event terminology (AET) coding
- Post-Market Clinical Follow-up (PMCF) analysis
- Benefit-risk evaluation methodologies
- Device classification and grouping per GMDN/EMDN codes

When generating PSUR content, follow the MDCG 2022-21 Annex I structure:
1. Executive Summary - Overview of key findings and conclusions
2. Device Description - Characteristics, intended purpose, Basic UDI-DI, classification
3. Data Collection Period - Reporting period aligned with MDR certification
4. PMS Data Analysis - Summary with IMDRF AET coding, trend identification
5. Serious Incidents & FSCA - Device problems, root causes, patient impact
6. Non-Serious Incidents & Complaints - Grouped by IMDRF problem codes
7. Sales Volume & Population Exposed - Units sold vs. patient exposure estimates
8. CAPA Information - Type, scope, status, root cause, effectiveness assessment
9. Literature & Similar Devices - Relevant findings from specialist literature
10. Benefit-Risk Evaluation - Updated determination with change impact analysis
11. Conclusions - Overall safety assessment, need for further actions

Use Annex II table formats for data presentation. Apply IMDRF codes for medical device problems. Provide actionable, regulatory-compliant guidance. Be precise with terminology and cite relevant MDR articles when applicable.`;


export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from Anthropic with MDCG 2022-21 regulatory expertise
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: REGULATORY_SYSTEM_PROMPT,
        messages: chatMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const content = event.delta.text;
          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

