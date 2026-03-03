import { Request, Response } from "express";
import {
  markAsRead,
  sendTextMessage,
  sendImageMessage,
  sendTemplateMessage,
} from "../services/whatsapp.service";

//handling incomoning webhook events post

export const handleWhatsappWebhook = async (req: Request, res: Response) => {
  //always respond 200 immediately, whatsapp will retry
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;

  //check if whatsapp  message event
  if (body.object !== "whatsapp_business_account") return;

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  //incoming messages

  if (value?.messages && value.messages.length > 0) {
    const message = value.messages[0];
    const from = message.from; // sender's phone number
    const messageId = message.id;
    const contactName = value.contacts?.[0]?.profile?.name || "Unknown";

    console.log(`📱 New WhatsApp message from ${contactName} (${from})`);

    //handle different message types

    if (message.type === "text") {
      const text = message.text?.body;
      console.log(`💬 Text: ${text}`);

      //this is the auto reply
      try {
        await sendTextMessage(
          from,
          `Thanks for your message. We'll get back to you soon!`,
        );
      } catch (err) {
        console.error("Failed to send auto-reply:", err);
      }
    }

    if (message.type === "image") {
      console.log(`🖼️ Image received, ID: ${message.image?.id}`);
    }

    if (message.type === "audio") {
      console.log(`🎵 Audio received, ID: ${message.audio?.id}`);
    }

    // Mark message as read
    try {
      await markAsRead(messageId);
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }

  if (value?.statuses && value.statuses.length > 0) {
    const status = value.statuses[0];
    console.log(`📊 Message ${status.id} status: ${status.status}`);
    // status.status = "sent" | "delivered" | "read" | "failed"
  }
};

export const sendWhatsappMessage = async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: "Both 'to' (phone number) and 'message' are required",
      });
    }

    // Phone number must include country code without + (e.g. 9779800000000)
    const sanitizedTo = to.replace(/[^0-9]/g, "");

    const result = await sendTextMessage(sanitizedTo, message);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error(
      "WhatsApp send error:",
      error?.response?.data || error.message,
    );
    return res.status(500).json({
      success: false,
      error: error?.response?.data || "Failed to send WhatsApp message",
    });
  }
};
