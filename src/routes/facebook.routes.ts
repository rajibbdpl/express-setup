import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import axios from "axios";
import { auth } from "@/lib/auth";
import { uploadSingleImage } from "@/middleware/upload.middleware";
import { uploadImageToMeta } from "@/lib/meta-attachment";

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

      const savedMessage = await prisma.facebookMessage.create({
        data: {
          conversationId: conversation.id,
          fbMessageId: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          text,
          direction: "OUTBOUND",
          deliveryStatus: "PENDING",
          createdTime: new Date(),
        },
      });

      console.log(`💾 Facebook message saved to DB (ID: ${savedMessage.id})`);

      try {
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${conversation.metaPage.pageId}/messages`,
          {
            recipient: { id: conversation.participantId },
            message: { text },
            access_token: conversation.metaPage.pageAccessToken,
          },
        );

        await prisma.facebookMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "SENT",
            fbMessageId: sendRes.data.message_id,
          },
        });

        console.log(`✅ Facebook message sent successfully: ${text}`);
        res.json({ 
          success: true, 
          messageId: savedMessage.id, 
          deliveryStatus: "SENT" 
        });

      } catch (apiError: any) {
        console.error("❌ Facebook API call failed:", apiError.response?.data ?? apiError.message);
        
        await prisma.facebookMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "FAILED",
          },
        });

        console.log(`⚠️ Facebook message saved but not delivered: ${text}`);
        res.json({ 
          success: true, 
          messageId: savedMessage.id, 
          deliveryStatus: "FAILED",
          warning: "Message saved but not delivered to Facebook"
        });
      }

    } catch (err: any) {
      console.error("Facebook reply failed:", err.response?.data ?? err.message);
      res.status(500).json({ error: "Failed to send reply" });
    }
  },
);

facebookRouter.post(
  "/conversations/:conversationId/send-image",
  uploadSingleImage,
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });
      
      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      
      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }

      const conversation = await prisma.facebookConversation.findFirst({
        where: { 
          id: conversationId,
          metaPage: { userId: session.user.id }
        },
        include: { metaPage: true },
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const { attachmentId } = await uploadImageToMeta(
        conversation.metaPage.pageId,
        conversation.metaPage.pageAccessToken,
        req.file.buffer,
        req.file.originalname
      );

      const savedMessage = await prisma.facebookMessage.create({
        data: {
          conversationId: conversation.id,
          fbMessageId: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          attachmentId,
          attachmentType: "image",
          direction: "OUTBOUND",
          deliveryStatus: "PENDING",
          createdTime: new Date(),
        },
      });

      try {
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${conversation.metaPage.pageId}/messages`,
          {
            recipient: { id: conversation.participantId },
            message: {
              attachment: {
                type: "image",
                payload: {
                  attachment_id: attachmentId,
                },
              },
            },
            access_token: conversation.metaPage.pageAccessToken,
          }
        );

        // Fetch the message to get attachment URL
        let attachmentUrl = null;
        try {
          const msgRes = await axios.get(
            `https://graph.facebook.com/v19.0/${sendRes.data.message_id}`,
            {
              params: {
                fields: 'attachments',
                access_token: conversation.metaPage.pageAccessToken,
              },
            }
          );
          
          const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
          if (attachmentsData && attachmentsData.length > 0) {
            attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
            console.log(`📎 Retrieved attachment URL: ${attachmentUrl}`);
          }
        } catch (fetchErr: any) {
          console.warn("⚠️ Could not fetch attachment URL:", fetchErr.message);
        }

        await prisma.facebookMessage.update({
          where: { id: savedMessage.id },
          data: {
            deliveryStatus: "SENT",
            fbMessageId: sendRes.data.message_id,
            attachmentUrl: attachmentUrl,
          },
        });

        res.json({ 
          success: true, 
          messageId: savedMessage.id,
          deliveryStatus: "SENT",
          attachmentUrl: attachmentUrl,
        });

      } catch (sendError: any) {
        console.error("Failed to send image message:", sendError.response?.data || sendError.message);
        
        await prisma.facebookMessage.update({
          where: { id: savedMessage.id },
          data: { deliveryStatus: "FAILED" },
        });

        res.json({ 
          success: true,
          messageId: savedMessage.id,
          deliveryStatus: "FAILED",
          error: "Image saved but failed to send"
        });
      }

    } catch (err: any) {
      console.error("Send image error:", err);
      
      if (err.message.includes('Invalid file type') || err.message.includes('File too large')) {
        return res.status(400).json({ error: err.message });
      }
      
      res.status(500).json({ error: "Failed to send image" });
    }
  }
);

facebookRouter.post(
  "/conversations/:conversationId/retry/:messageId",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });
      
      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      const messageId = req.params.messageId as string;

      const message = await prisma.facebookMessage.findFirst({
        where: {
          id: messageId,
          conversationId,
          conversation: {
            metaPage: { userId: session.user.id }
          }
        },
        include: {
          conversation: {
            include: { metaPage: true }
          }
        }
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (!message.attachmentId) {
        return res.status(400).json({ 
          error: "No attachment found. Please re-upload the image." 
        });
      }

      try {
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${message.conversation.metaPage.pageId}/messages`,
          {
            recipient: { id: message.conversation.participantId },
            message: {
              attachment: {
                type: message.attachmentType || "image",
                payload: {
                  attachment_id: message.attachmentId,
                },
              },
            },
            access_token: message.conversation.metaPage.pageAccessToken,
          }
        );

        await prisma.facebookMessage.update({
          where: { id: message.id },
          data: {
            deliveryStatus: "SENT",
            fbMessageId: sendRes.data.message_id,
          },
        });

        res.json({ success: true, deliveryStatus: "SENT" });

      } catch (sendError: any) {
        console.error("Retry failed:", sendError.response?.data || sendError.message);
        
        res.status(500).json({ 
          error: "Retry failed. The attachment may have expired. Please re-upload the image." 
        });
      }

    } catch (err: any) {
      console.error("Retry error:", err);
      res.status(500).json({ error: "Failed to retry message" });
    }
  }
);

export default facebookRouter;
