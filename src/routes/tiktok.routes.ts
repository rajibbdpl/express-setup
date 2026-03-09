import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import { auth } from "@/lib/auth";
import {
  ensureValidToken,
  sendTikTokMessage,
} from "@/services/tiktok.service";

const tiktokRouter = Router();

tiktokRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });

    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const tiktokAccount = await prisma.tikTokAccount.findFirst({
      where: { userId: session.user.id },
    });

    if (!tiktokAccount) {
      return res.json({ conversations: [] });
    }

    const conversations = await prisma.tikTokConversation.findMany({
      where: { tiktokAccountId: tiktokAccount.id },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { timestamp: "asc" },
          take: 1,
        },
      },
    });

    res.json({ conversations });
  } catch (err) {
    console.error("Fetch TikTok conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

tiktokRouter.get(
  "/conversations/:conversationId/messages",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });

      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const beforeId = req.query.before as string | undefined;

      const conversation = await prisma.tikTokConversation.findFirst({
        where: {
          id: conversationId,
          tiktokAccount: { userId: session.user.id },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      let whereClause: any = { conversationId };

      if (beforeId) {
        const beforeMessage = await prisma.tikTokMessage.findUnique({
          where: { id: beforeId },
          select: { timestamp: true },
        });

        if (beforeMessage) {
          whereClause.timestamp = { lt: beforeMessage.timestamp };
        }
      }

      const messages = await prisma.tikTokMessage.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      const hasMore = messages.length === limit;

      res.json({
        messages: messages.reverse(),
        hasMore,
        nextCursor: hasMore && messages.length > 0 ? messages[0].id : null,
      });
    } catch (err) {
      console.error("Fetch TikTok messages error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  }
);

tiktokRouter.post(
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

      const conversation = await prisma.tikTokConversation.findFirst({
        where: {
          id: conversationId,
          tiktokAccount: { userId: session.user.id },
        },
        include: { tiktokAccount: true },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const savedMessage = await prisma.tikTokMessage.create({
        data: {
          conversationId: conversation.id,
          tiktokMessageId: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          text,
          direction: "OUTBOUND",
          deliveryStatus: "PENDING",
          timestamp: new Date(),
        },
      });

      console.log(`💾 TikTok message saved to DB (ID: ${savedMessage.id})`);

      try {
        const accessToken = await ensureValidToken(session.user.id);
        const sendRes = await sendTikTokMessage(
          accessToken,
          conversation.tiktokConversationId,
          text
        );

        const updateData: any = {
          deliveryStatus: "SENT",
          tiktokMessageId: sendRes.data?.message_id || savedMessage.tiktokMessageId,
        };

        if (sendRes.data?.timestamp) {
          updateData.timestamp = new Date(sendRes.data.timestamp * 1000);
        }

        await prisma.tikTokMessage.update({
          where: { id: savedMessage.id },
          data: updateData,
        });

        console.log(`✅ TikTok message sent successfully: ${text}`);
        res.json({
          success: true,
          messageId: savedMessage.id,
          deliveryStatus: "SENT",
        });
      } catch (apiError: any) {
        console.error("❌ TikTok API call failed:", apiError.response?.data ?? apiError.message);

        await prisma.tikTokMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "FAILED",
          },
        });

        console.log(`⚠️ TikTok message saved but not delivered: ${text}`);
        res.json({
          success: true,
          messageId: savedMessage.id,
          deliveryStatus: "FAILED",
          warning: "Message saved but not delivered to TikTok",
        });
      }
    } catch (err: any) {
      console.error("TikTok reply failed:", err.response?.data ?? err.message);
      res.status(500).json({ error: "Failed to send reply" });
    }
  }
);

tiktokRouter.post(
  "/conversations/:conversationId/retry/:messageId",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });

      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      const messageId = req.params.messageId as string;

      const message = await prisma.tikTokMessage.findFirst({
        where: {
          id: messageId,
          conversationId,
          conversation: {
            tiktokAccount: { userId: session.user.id },
          },
        },
        include: {
          conversation: {
            include: { tiktokAccount: true },
          },
        },
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!message.text) {
        return res.status(400).json({
          error: "No message text found to retry.",
        });
      }

      try {
        const accessToken = await ensureValidToken(session.user.id);
        const sendRes = await sendTikTokMessage(
          accessToken,
          message.conversation.tiktokConversationId,
          message.text
        );

        const updateData: any = {
          deliveryStatus: "SENT",
          tiktokMessageId: sendRes.data?.message_id || message.tiktokMessageId,
        };

        if (sendRes.data?.timestamp) {
          updateData.timestamp = new Date(sendRes.data.timestamp * 1000);
        }

        await prisma.tikTokMessage.update({
          where: { id: message.id },
          data: updateData,
        });

        res.json({ success: true, deliveryStatus: "SENT" });
      } catch (sendError: any) {
        console.error("TikTok retry failed:", sendError.response?.data || sendError.message);

        res.status(500).json({
          error: "Retry failed. Please try again.",
        });
      }
    } catch (err: any) {
      console.error("Retry error:", err);
      res.status(500).json({ error: "Failed to retry message" });
    }
  }
);

export default tiktokRouter;
