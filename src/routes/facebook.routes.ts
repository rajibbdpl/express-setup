// routes/facebook.routes.ts
import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import axios from "axios";

const facebookRouter = Router();

// GET all conversations for the user's page
facebookRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const page = await prisma.metaPage.findFirst({
      where: { userId: req.session?.userId },
    });

    if (!page) return res.status(404).json({ error: "No page connected" });

    const conversations = await prisma.facebookConversation.findMany({
      where: { metaPageId: page.id },
      orderBy: { updatedTime: "desc" },
      include: {
        messages: {
          orderBy: { createdTime: "asc" },
          take: 1, // just the latest for the conversation list
        },
      },
    });

    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// GET all messages in a specific conversation
facebookRouter.get(
  "/conversations/:conversationId/messages",
  async (req: Request, res: Response) => {
    try {
      const conversationId = req.params.conversationId as string;
      const messages = await prisma.facebookMessage.findMany({
        where: { conversationId },
        orderBy: { createdTime: "asc" },
      });

      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  },
);

// POST reply to a conversation
facebookRouter.post(
  "/conversations/:conversationId/reply",
  async (req: Request, res: Response) => {
    const { text } = req.body;
    const conversationId = req.params.conversationId as string;

    try {
      const conversation = await prisma.facebookConversation.findUnique({
        where: { id: conversationId },
        include: { metaPage: true },
      });

      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });

      // Send via Meta API
      const sendRes = await axios.post(
        `https://graph.facebook.com/v19.0/${conversation.metaPage.pageId}/messages`,
        {
          recipient: { id: conversation.participantId },
          message: { text },
          access_token: conversation.metaPage.pageAccessToken,
        },
      );

      // Save the outbound message to DB
      await prisma.facebookMessage.create({
        data: {
          conversationId: conversation.id,
          fbMessageId: sendRes.data.message_id,
          text,
          direction: "OUTBOUND",
          createdTime: new Date(),
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Reply failed:", err.response?.data ?? err.message);
      res.status(500).json({ error: "Failed to send reply" });
    }
  },
);

export default facebookRouter;
