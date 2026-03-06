import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import axios from "axios";
import { auth } from "@/lib/auth";

const instagramRouter = Router();

instagramRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const igAccounts = await prisma.instagramAccount.findMany({
      where: {
        metaPage: { userId: session.user.id }
      },
    });

    if (!igAccounts.length) {
      return res.json({ conversations: [] });
    }

    const accountIds = igAccounts.map(acc => acc.id);

    const conversations = await prisma.igConversation.findMany({
      where: { 
        igAccountId: { in: accountIds }
      },
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
    console.error("Fetch Instagram conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

instagramRouter.get(
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
      
      const conversation = await prisma.igConversation.findFirst({
        where: { 
          id: conversationId,
          igAccount: {
            metaPage: { userId: session.user.id }
          }
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      let whereClause: any = { conversationId };
      
      if (beforeId) {
        const beforeMessage = await prisma.igMessage.findUnique({
          where: { id: beforeId },
          select: { timestamp: true },
        });
        
        if (beforeMessage) {
          whereClause.timestamp = { lt: beforeMessage.timestamp };
        }
      }

      const messages = await prisma.igMessage.findMany({
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
      console.error("Fetch Instagram messages error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  },
);

instagramRouter.post(
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

      const conversation = await prisma.igConversation.findFirst({
        where: { 
          id: conversationId,
          igAccount: {
            metaPage: { userId: session.user.id }
          }
        },
        include: {
          igAccount: {
            include: { metaPage: true }
          }
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // ✅ STEP 1: Save to database FIRST (with PENDING status)
      const savedMessage = await prisma.igMessage.create({
        data: {
          conversationId: conversation.id,
          igMessageId: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          fromId: conversation.igAccount.igAccountId,
          text,
          direction: "OUTBOUND",
          deliveryStatus: "PENDING",
          timestamp: new Date(),
        },
      });

      console.log(`💾 Instagram message saved to DB (ID: ${savedMessage.id})`);

      // ✅ STEP 2: Try to send via Instagram API
      try {
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${conversation.igAccount.igAccountId}/messages`,
          {
            recipient: { id: conversation.participantIgId },
            message: { text },
            access_token: conversation.igAccount.metaPage?.pageAccessToken,
          },
        );

        // ✅ STEP 3: Update delivery status to SENT
        await prisma.igMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "SENT",
            igMessageId: sendRes.data.message_id,
          },
        });

        console.log(`✅ Instagram message sent successfully: ${text}`);
        res.json({ 
          success: true, 
          messageId: savedMessage.id, 
          deliveryStatus: "SENT" 
        });

      } catch (apiError: any) {
        // ❌ STEP 4: Update delivery status to FAILED
        console.error("❌ Instagram API call failed:", apiError.response?.data ?? apiError.message);
        
        await prisma.igMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "FAILED",
          },
        });

        console.log(`⚠️ Instagram message saved but not delivered: ${text}`);
        res.json({ 
          success: true, 
          messageId: savedMessage.id, 
          deliveryStatus: "FAILED",
          warning: "Message saved but not delivered to Instagram (permission pending)"
        });
      }

    } catch (err: any) {
      console.error("Instagram reply failed:", err.response?.data ?? err.message);
      res.status(500).json({ error: "Failed to send reply" });
    }
  },
);

export default instagramRouter;
