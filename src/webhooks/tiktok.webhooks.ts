import { raw, Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "@/config/database";

const router = Router();

router.get("/webhook", (req, res) => {
  const challenge = req.query.challenge;
  res.json({ challenge });
});

router.post("/webhook", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  res.status(200).send("ok");

  try {
    const signature = req.headers["x-tiktok-signature"];
    const hmac = crypto
      .createHmac("sha256", process.env.TIKTOK_WEBHOOK_SECRET!)
      .update(req.body)
      .digest("hex");

    if (signature !== `sha256=${hmac}`) {
      console.error("❌ Invalid TikTok webhook signature");
      return;
    }

    const payload = JSON.parse(req.body.toString());
    const { event, data } = payload;

    console.log("=".repeat(80));
    console.log("🎵 TIKTOK WEBHOOK EVENT RECEIVED");
    console.log("📦 Event:", event);
    console.log("📦 Data:", JSON.stringify(data, null, 2));
    console.log("=".repeat(80));

    if (event === "message.receive") {
      await handleIncomingMessage(data);
    } else if (event === "message.delivered") {
      await handleMessageDelivered(data);
    } else if (event === "message.read") {
      await handleMessageRead(data);
    } else {
      console.log(`⚠️ Unhandled TikTok webhook event: ${event}`);
    }
  } catch (err) {
    console.error("TikTok webhook processing error:", err);
  }
});

async function handleIncomingMessage(data: any) {
  try {
    const {
      conversation_id,
      message_id,
      from: { open_id: senderOpenId, username: senderUsername },
      content: { text, timestamp, type, media_url },
    } = data;

    console.log(`🎵 TikTok message from ${senderUsername || senderOpenId}: ${text || type}`);

    let tiktokAccount = await prisma.tikTokAccount.findFirst();

    if (!tiktokAccount) {
      console.error("❌ No TikTok account found in database");
      return;
    }

    let conversation = await prisma.tikTokConversation.findUnique({
      where: { tiktokConversationId: conversation_id },
    });

    if (!conversation) {
      conversation = await prisma.tikTokConversation.create({
        data: {
          tiktokAccountId: tiktokAccount.id,
          tiktokConversationId: conversation_id,
          participantOpenId: senderOpenId,
          participantUsername: senderUsername,
          updatedAt: new Date(timestamp * 1000),
        },
      });
      console.log(`✅ Created new TikTok conversation: ${conversation_id}`);
    } else {
      await prisma.tikTokConversation.update({
        where: { id: conversation.id },
        data: {
          participantUsername: senderUsername || conversation.participantUsername,
          updatedAt: new Date(timestamp * 1000),
        },
      });
    }

    const existingMessage = await prisma.tikTokMessage.findUnique({
      where: { tiktokMessageId: message_id },
    });

    if (!existingMessage) {
      // Determine attachment type based on message type
      let attachmentType: string | null = null;
      if (type === "IMAGE") {
        attachmentType = "IMAGE";
      } else if (type === "VIDEO") {
        attachmentType = "VIDEO";
      } else if (type === "AUDIO" || type === "VOICE") {
        attachmentType = "AUDIO";
      }

      await prisma.tikTokMessage.create({
        data: {
          conversationId: conversation.id,
          tiktokMessageId: message_id,
          fromOpenId: senderOpenId,
          fromUsername: senderUsername,
          text: text || null,
          attachmentUrl: media_url || null,
          attachmentType: attachmentType,
          direction: "INBOUND",
          deliveryStatus: "SENT",
          timestamp: new Date(timestamp * 1000),
        },
      });
      console.log(`✅ TikTok message saved to DB: ${text || type}`);
    } else {
      console.log(`⚠️ TikTok message already exists: ${message_id}`);
    }
  } catch (err) {
    console.error("Error handling incoming TikTok message:", err);
  }
}

async function handleMessageDelivered(data: any) {
  try {
    const { message_id } = data;

    const message = await prisma.tikTokMessage.findUnique({
      where: { tiktokMessageId: message_id },
    });

    if (message && message.direction === "OUTBOUND") {
      await prisma.tikTokMessage.update({
        where: { tiktokMessageId: message_id },
        data: { deliveryStatus: "SENT" },
      });
      console.log(`✅ TikTok message marked as delivered: ${message_id}`);
    }
  } catch (err) {
    console.error("Error handling TikTok message delivered:", err);
  }
}

async function handleMessageRead(data: any) {
  try {
    const { message_id } = data;

    const message = await prisma.tikTokMessage.findUnique({
      where: { tiktokMessageId: message_id },
    });

    if (message && message.direction === "OUTBOUND") {
      console.log(`✅ TikTok message read by recipient: ${message_id}`);
    }
  } catch (err) {
    console.error("Error handling TikTok message read:", err);
  }
}

export default router;
