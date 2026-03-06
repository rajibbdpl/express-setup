import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import axios from "axios";
import { auth } from "@/lib/auth";

const facebookRouter = Router();

facebookRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const page = await prisma.metaPage.findFirst({
      where: { userId: session.user.id },
    });

    if (!page) return res.status(404).json({ error: "No page connected" });

    const conversations = await prisma.facebookConversation.findMany({
      where: { metaPageId: page.id },
      orderBy: { updatedTime: "desc" },
      include: {
        messages: {
          orderBy: { createdTime: "asc" },
          take: 1,
        },
      },
    });

    res.json({ conversations });
  } catch (err) {
    console.error("Fetch conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

facebookRouter.get(
  "/conversations/:conversationId/messages",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });
      
      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      const limit = parseInt(req.query.limit as string) || 5;
      const beforeId = req.query.before as string | undefined;
      
      const conversation = await prisma.facebookConversation.findFirst({
        where: { 
          id: conversationId,
          metaPage: { userId: session.user.id }
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // If beforeId is provided, get messages older than that message
      let whereClause: any = { conversationId };
      
      if (beforeId) {
        const beforeMessage = await prisma.facebookMessage.findUnique({
          where: { id: beforeId },
          select: { createdTime: true },
        });
        
        if (beforeMessage) {
          whereClause.createdTime = { lt: beforeMessage.createdTime };
        }
      }

      const messages = await prisma.facebookMessage.findMany({
        where: whereClause,
        orderBy: { createdTime: "desc" },
        take: limit,
      });

      const hasMore = messages.length === limit;

      res.json({
        messages: messages.reverse(),
        hasMore,
        nextCursor: hasMore && messages.length > 0 ? messages[0].id : null,
      });
    } catch (err) {
      console.error("Fetch messages error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  },
);

facebookRouter.post(
  "/conversations/:conversationId/reply",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });
      
      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { text } = req.body;
      const conversationId = req.params.conversationId as string;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Message text is required" });
      }

      const conversation = await prisma.facebookConversation.findFirst({
        where: { 
          id: conversationId,
          metaPage: { userId: session.user.id }
        },
        include: { metaPage: true },
      });

      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });

      const sendRes = await axios.post(
        `https://graph.facebook.com/v19.0/${conversation.metaPage.pageId}/messages`,
        {
          recipient: { id: conversation.participantId },
          message: { text },
          access_token: conversation.metaPage.pageAccessToken,
        },
      );

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
