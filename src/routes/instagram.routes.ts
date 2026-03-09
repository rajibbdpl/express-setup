import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import axios from "axios";
import { auth } from "@/lib/auth";
import { uploadSingleImage } from "@/middleware/upload.middleware";
import { uploadImageToMeta } from "@/lib/meta-attachment";

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

      // ✅ STEP 2: Try to send via Instagram API (using IG Account ID)
      try {
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${conversation.igAccount.igAccountId}/messages`,
          {
            recipient: { id: conversation.participantIgId },
            message: { text },
            access_token: conversation.igAccount.metaPage?.pageAccessToken,
          },
        );

        // ✅ STEP 3: Update delivery status to SENT and use Instagram timestamp if available
        const updateData: any = {
          deliveryStatus: "SENT",
          igMessageId: sendRes.data.message_id,
        };

        // If Instagram returns a timestamp, use it for consistency
        if (sendRes.data.timestamp) {
          updateData.timestamp = new Date(sendRes.data.timestamp * 1000);
        }

        await prisma.igMessage.update({
          where: { id: savedMessage.id },
          data: updateData,
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

instagramRouter.post(
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

      const { attachmentId } = await uploadImageToMeta(
        conversation.igAccount.metaPage.pageId,
        conversation.igAccount.metaPage.pageAccessToken,
        req.file.buffer,
        req.file.originalname
      );

      console.log(`📸 Uploading Instagram image - Page ID: ${conversation.igAccount.metaPage.pageId}, IG Account ID: ${conversation.igAccount.igAccountId}`);
      console.log(`📸 Attachment ID: ${attachmentId}`);

      const savedMessage = await prisma.igMessage.create({
        data: {
          conversationId: conversation.id,
          igMessageId: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          attachmentId,
          attachmentType: "image",
          direction: "OUTBOUND",
          deliveryStatus: "PENDING",
          timestamp: new Date(),
        },
      });

      try {
        console.log(`📸 Sending Instagram image via Page ID: ${conversation.igAccount.metaPage.pageId}`);
        
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${conversation.igAccount.metaPage.pageId}/messages`,
          {
            recipient: { id: conversation.participantIgId },
            message: {
              attachment: {
                type: "image",
                payload: {
                  attachment_id: attachmentId,
                },
              },
            },
            access_token: conversation.igAccount.metaPage.pageAccessToken,
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
                access_token: conversation.igAccount.metaPage.pageAccessToken,
              },
            }
          );
          
          const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
          if (attachmentsData && attachmentsData.length > 0) {
            attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
            console.log(`📎 Retrieved Instagram attachment URL: ${attachmentUrl}`);
          }
        } catch (fetchErr: any) {
          console.warn("⚠️ Could not fetch attachment URL:", fetchErr.message);
        }

        const updateData: any = {
          deliveryStatus: "SENT",
          igMessageId: sendRes.data.message_id,
          attachmentUrl: attachmentUrl,
        };

        if (sendRes.data.timestamp) {
          updateData.timestamp = new Date(sendRes.data.timestamp * 1000);
        }

        await prisma.igMessage.update({
          where: { id: savedMessage.id },
          data: updateData,
        });

        console.log(`✅ Instagram image sent successfully via Page ID: ${conversation.igAccount.metaPage.pageId}`);
        console.log(`✅ Message ID: ${sendRes.data.message_id}, Attachment URL: ${attachmentUrl?.substring(0, 50)}...`);

        res.json({ 
          success: true, 
          messageId: savedMessage.id,
          deliveryStatus: "SENT",
          attachmentUrl: attachmentUrl,
        });

      } catch (sendError: any) {
        console.error("📸 Failed to send Instagram image message:", {
          error: sendError.response?.data,
          pageId: conversation.igAccount.metaPage.pageId,
          igAccountId: conversation.igAccount.igAccountId,
          participantIgId: conversation.participantIgId,
          attachmentId: attachmentId
        });
        
        await prisma.igMessage.update({
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

instagramRouter.post(
  "/conversations/:conversationId/retry/:messageId",
  async (req: Request, res: Response) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as any });
      
      if (!session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversationId = req.params.conversationId as string;
      const messageId = req.params.messageId as string;

      const message = await prisma.igMessage.findFirst({
        where: {
          id: messageId,
          conversationId,
          conversation: {
            igAccount: {
              metaPage: { userId: session.user.id }
            }
          }
        },
        include: {
          conversation: {
            include: {
              igAccount: {
                include: { metaPage: true }
              }
            }
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
        console.log(`📸 Retrying Instagram image - Page ID: ${message.conversation.igAccount.metaPage.pageId}, IG Account ID: ${message.conversation.igAccount.igAccountId}`);
        console.log(`📸 Attachment ID: ${message.attachmentId}`);
        
        const sendRes = await axios.post(
          `https://graph.facebook.com/v19.0/${message.conversation.igAccount.metaPage.pageId}/messages`,
          {
            recipient: { id: message.conversation.participantIgId },
            message: {
              attachment: {
                type: message.attachmentType || "image",
                payload: {
                  attachment_id: message.attachmentId,
                },
              },
            },
            access_token: message.conversation.igAccount.metaPage.pageAccessToken,
          }
        );

        const updateData: any = {
          deliveryStatus: "SENT",
          igMessageId: sendRes.data.message_id,
        };

        if (sendRes.data.timestamp) {
          updateData.timestamp = new Date(sendRes.data.timestamp * 1000);
        }

        await prisma.igMessage.update({
          where: { id: message.id },
          data: updateData,
        });

        res.json({ success: true, deliveryStatus: "SENT" });

      } catch (sendError: any) {
        console.error("📸 Instagram image retry failed:", {
          error: sendError.response?.data,
          pageId: message.conversation.igAccount.metaPage.pageId,
          igAccountId: message.conversation.igAccount.igAccountId,
          participantIgId: message.conversation.participantIgId,
          attachmentId: message.attachmentId
        });
        
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

export default instagramRouter;
