import { Router, Request, Response, raw } from "express";
import { prisma } from "@/config/database";

const metaWebhookRouter = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN!;

// Verification (unchanged)
metaWebhookRouter.get("/meta", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receive events
metaWebhookRouter.post(
  "/meta",
  raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    console.log("📦 Webhook body:", JSON.stringify(req.body, null, 2)); // ← add this

    console.log("🔔 Webhook POST hit"); // ← add this as very first line

    res.sendStatus(200); // always respond immediately

    try {
      const body = JSON.parse(req.body.toString());

      if (body.object === "page") {
        for (const entry of body.entry ?? []) {
          for (const event of entry.messaging ?? []) {
            // Only handle actual messages (not echoes of your own sends)
            if (!event.message || event.message.is_echo) continue;

            const senderId = event.sender.id; // the user who messaged
            const pageId = event.recipient.id; // your page
            const text = event.message.text;
            const mid = event.message.mid; // message ID
            const timestamp = new Date(event.timestamp);

            console.log(`💬 New message from ${senderId}: ${text}`);

            // Find the page in your DB
            const page = await prisma.metaPage.findUnique({
              where: { pageId },
            });
            if (!page) {
              console.warn("Page not found in DB:", pageId);
              continue;
            }

            // Find or create the conversation
            const conversation = await prisma.facebookConversation.upsert({
              where: { fbConversationId: `${pageId}_${senderId}` },
              create: {
                metaPageId: page.id,
                fbConversationId: `${pageId}_${senderId}`,
                participantId: senderId,
                participantName: senderId, // fetch real name separately if needed
                updatedTime: timestamp,
              },
              update: {
                updatedTime: timestamp,
                snippet: text, // update preview with latest message
              },
            });

            await prisma.facebookMessage.create({
              data: {
                conversationId: conversation.id,
                fbMessageId: mid,
                fromId: senderId,
                text: text ?? null,
                direction: "INBOUND",
                createdTime: timestamp,
              },
            });

            console.log(`✅ Message saved to DB: ${text}`);
          }
        }
      }
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
  },
);

export default metaWebhookRouter;