import { Router, Request, Response } from "express";
import {
  sendWhatsappMessage,
  handleWhatsappWebhook,
} from "../controllers/whatsapp.controllers";
import { prisma } from "@/config/database";
import { auth } from "@/lib/auth";
import { uploadSingleImage } from "@/middleware/upload.middleware";
import axios from "axios";

const router = Router();

const WHATSAPP_API_URL = "https://graph.facebook.com/v19.0";

// POST webhook — receives incoming messages from WhatsApp
router.post("/", handleWhatsappWebhook);

// POST send a message
router.post("/send", sendWhatsappMessage);

// GET proxy for WhatsApp media (to handle authentication)
router.get("/media/:messageId", async (req: Request, res: Response) => {
  try {
    console.log(`📷 WhatsApp media proxy request for: ${req.params.messageId}`);
    
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      console.log("❌ WhatsApp media proxy: Not authenticated");
      return res.status(401).json({ error: "Not authenticated" });
    }

    const messageId = req.params.messageId as string;
    
    // Find the message to get the media info
    const message = await prisma.waMessage.findFirst({
      where: {
        waMessageId: messageId,
        conversation: {
          waAccount: { userId: session.user.id }
        }
      },
    });

    if (!message) {
      console.log(`❌ WhatsApp media proxy: Message not found for ID ${messageId}`);
      return res.status(404).json({ error: "Message not found" });
    }

    if (!message.mediaUrl) {
      console.log(`❌ WhatsApp media proxy: No media URL for message ${messageId}`);
      return res.status(404).json({ error: "Media URL not found" });
    }

    // Get the WhatsApp account for the access token
    const conversation = await prisma.waConversation.findUnique({
      where: { id: message.conversationId },
      include: { waAccount: true },
    });

    if (!conversation?.waAccount?.systemUserToken) {
      console.log(`❌ WhatsApp media proxy: No account/token found`);
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    const accessToken = conversation.waAccount.systemUserToken;

    // Extract media ID from the URL
    // URL format 1 (inbound): https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA_ID&...
    // URL format 2 (outbound): whatsapp_media://MEDIA_ID
    let mediaId: string | null = null;
    
    if (message.mediaUrl.startsWith('whatsapp_media://')) {
      // Outbound message - direct media ID
      mediaId = message.mediaUrl.replace('whatsapp_media://', '');
    } else {
      // Inbound message - extract from URL
      const midMatch = message.mediaUrl.match(/mid=([^&]+)/);
      mediaId = midMatch ? midMatch[1] : null;
    }

    if (!mediaId) {
      console.log(`❌ WhatsApp media proxy: Could not extract media ID from URL: ${message.mediaUrl}`);
      return res.status(400).json({ error: "Could not extract media ID" });
    }

    console.log(`🔄 Fetching fresh media URL for media ID: ${mediaId}`);

    // Step 1: Get a fresh media URL from the Graph API
    const mediaInfoRes = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const freshMediaUrl = mediaInfoRes.data.url;
    console.log(`✅ Got fresh media URL: ${freshMediaUrl.substring(0, 100)}...`);

    // Step 2: Fetch the actual media using the fresh URL
    const mediaResponse = await axios.get(freshMediaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: "arraybuffer",
    });

    // Forward the content type
    const contentType = mediaResponse.headers["content-type"];
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    console.log(`✅ WhatsApp media proxy: Successfully fetched media (${mediaResponse.data.byteLength} bytes)`);
    
    // Send the media data
    res.send(mediaResponse.data);
  } catch (err: any) {
    console.error("❌ WhatsApp media proxy error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data ? (Buffer.isBuffer(err.response.data) ? 'Binary data' : String(err.response.data).substring(0, 200)) : null,
    });
    res.status(500).json({ error: "Failed to fetch media", details: err.message });
  }
});

// GET connected WhatsApp accounts
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const accounts = await prisma.whatsAppAccount.findMany({
      where: { userId: session.user.id },
    });

    res.json({ accounts });
  } catch (err) {
    console.error("Fetch WhatsApp accounts error:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// POST connect a WhatsApp account
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { phoneNumberId, businessAccountId, phoneNumber, displayName, systemUserToken } = req.body;

    if (!phoneNumberId || !systemUserToken) {
      return res.status(400).json({ error: "phoneNumberId and systemUserToken are required" });
    }

    const account = await prisma.whatsAppAccount.upsert({
      where: {
        phoneNumberId,
      },
      create: {
        userId: session.user.id,
        phoneNumberId,
        businessAccountId: businessAccountId || null,
        phoneNumber: phoneNumber || null,
        displayName: displayName || null,
        systemUserToken,
      },
      update: {
        businessAccountId: businessAccountId || null,
        phoneNumber: phoneNumber || null,
        displayName: displayName || null,
        systemUserToken,
      },
    });

    res.json({ success: true, account });
  } catch (err) {
    console.error("Connect WhatsApp account error:", err);
    res.status(500).json({ error: "Failed to connect account" });
  }
});

// GET messages for a conversation
router.get("/conversations/:conversationId/messages", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const conversationId = req.params.conversationId as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const before = req.query.before as string | undefined;

    // Verify the conversation belongs to the user
    const conversation = await prisma.waConversation.findFirst({
      where: {
        id: conversationId,
        waAccount: { userId: session.user.id },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Fetch messages separately
    const messages = await prisma.waMessage.findMany({
      where: { conversationId },
      orderBy: { timestamp: "desc" },
      take: limit,
      ...(before && {
        cursor: { id: before },
        skip: 1,
      }),
    });

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1]?.id : null;

    res.json({
      messages: messages.reverse(),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    console.error("Fetch WhatsApp messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST reply to a conversation
router.post("/conversations/:conversationId/reply", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const conversationId = req.params.conversationId as string;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Message text is required" });
    }

    // Get the conversation with WhatsApp account
    const conversation = await prisma.waConversation.findFirst({
      where: {
        id: conversationId,
        waAccount: { userId: session.user.id },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get the WhatsApp account
    const waAccount = await prisma.whatsAppAccount.findUnique({
      where: { id: conversation.waAccountId },
    });

    if (!waAccount) {
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    const phoneNumberId = waAccount.phoneNumberId;
    const accessToken = waAccount.systemUserToken;

    // Send message via WhatsApp API
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: conversation.contactPhone,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const messageId = response.data.messages?.[0]?.id;

    // Save message to database
    const message = await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        waMessageId: messageId || `local_${Date.now()}`,
        direction: "OUTBOUND",
        type: "TEXT",
        text,
        status: "SENT",
        timestamp: new Date(),
      },
    });

    // Update conversation lastMessageAt
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    res.json({ 
      success: true, 
      messageId: message.waMessageId,
      deliveryStatus: "SENT",
    });
  } catch (err: any) {
    console.error("Send WhatsApp reply error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// POST send image to a conversation
router.post("/conversations/:conversationId/send-image", uploadSingleImage, async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const conversationId = req.params.conversationId as string;
    
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    // Get the conversation with WhatsApp account
    const conversation = await prisma.waConversation.findFirst({
      where: {
        id: conversationId,
        waAccount: { userId: session.user.id },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get the WhatsApp account
    const waAccount = await prisma.whatsAppAccount.findUnique({
      where: { id: conversation.waAccountId },
    });

    if (!waAccount) {
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    const phoneNumberId = waAccount.phoneNumberId;
    const accessToken = waAccount.systemUserToken;

    console.log(`📸 Uploading WhatsApp image for conversation ${conversationId}`);
    console.log(`📸 DEBUG: File details -`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer.length,
    });

    // Step 1: Upload the image to WhatsApp to get a media ID
    // WhatsApp API requires multipart/form-data with 'file' field
    const formData = new FormData();
    const uint8Array = new Uint8Array(req.file.buffer);
    const blob = new Blob([uint8Array], { type: req.file.mimetype });
    formData.append('file', blob, req.file.originalname);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', req.file.mimetype);

    console.log(`📸 DEBUG: Uploading to WhatsApp API with FormData (multipart/form-data)`);

    const uploadRes = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const mediaId = uploadRes.data.id;
    console.log(`📸 WhatsApp image uploaded, media ID: ${mediaId}`);

    // Step 2: Send the image message using the media ID
    const sendRes = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: conversation.contactPhone,
        type: "image",
        image: {
          id: mediaId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const messageId = sendRes.data.messages?.[0]?.id;
    console.log(`✅ WhatsApp image sent, message ID: ${messageId}`);

    // Save message to database
    const message = await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        waMessageId: messageId || `local_${Date.now()}`,
        direction: "OUTBOUND",
        type: "IMAGE",
        mediaType: "image",
        mediaUrl: `whatsapp_media://${mediaId}`, // Store reference to media
        status: "SENT",
        timestamp: new Date(),
      },
    });

    // Update conversation lastMessageAt
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    res.json({ 
      success: true, 
      messageId: message.id,
      waMessageId: message.waMessageId,
      deliveryStatus: "SENT",
    });
  } catch (err: any) {
    console.error("Send WhatsApp image error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send image" });
  }
});

// DELETE disconnect a WhatsApp account
router.delete("/disconnect/:id", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const id = req.params.id as string;

    const account = await prisma.whatsAppAccount.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    await prisma.whatsAppAccount.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Disconnect WhatsApp account error:", err);
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

export default router;
