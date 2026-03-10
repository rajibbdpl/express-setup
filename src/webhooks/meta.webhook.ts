import { Router, Request, Response, raw } from "express";
import { prisma } from "@/config/database";
import { getSenderName } from "@/utils/meta";
import axios from "axios";

const metaWebhookRouter = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN!;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

metaWebhookRouter.get("/meta", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Accept both META_VERIFY_TOKEN (for Facebook/Instagram) and WHATSAPP_VERIFY_TOKEN (for WhatsApp)
  const validTokens = [VERIFY_TOKEN, WHATSAPP_VERIFY_TOKEN].filter(Boolean);
  
  if (mode === "subscribe" && validTokens.includes(token as string)) {
    console.log(`✅ Webhook verified with token for: ${token === VERIFY_TOKEN ? 'Meta (Facebook/Instagram)' : 'WhatsApp'}`);
    return res.status(200).send(challenge);
  }
  
  console.log(`❌ Webhook verification failed. Received token: ${token}`);
  return res.sendStatus(403);
});

metaWebhookRouter.post(
  "/meta",
  raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    console.log("🔔 Webhook POST hit");
    res.sendStatus(200);

    try {
      const body = JSON.parse(req.body.toString());

      console.log("=".repeat(80));
      console.log("📦 WEBHOOK EVENT RECEIVED");
      console.log("📦 Object Type:", body.object);
      console.log("📦 Entry Count:", body.entry?.length || 0);
      console.log("📦 Full Payload:", JSON.stringify(body, null, 2));
      console.log("=".repeat(80));

      if (body.object === "page") {
        console.log("💬 FACEBOOK WEBHOOK DETECTED");
        for (const entry of body.entry ?? []) {
          console.log(`💬 Processing ${entry.messaging?.length || 0} Facebook messaging events`);
          for (const event of entry.messaging ?? []) {
            if (!event.message) continue;

            const senderId = event.sender.id;
            const recipientId = event.recipient.id;
            const text = event.message.text;
            const mid = event.message.mid;
            const timestamp = new Date(event.timestamp);
            const isEcho = event.message.is_echo;
            const attachments = event.message.attachments;

            let attachmentUrl = null;
            let attachmentType = null;
            
            if (attachments && attachments.length > 0) {
              const attachment = attachments[0];
              attachmentUrl = attachment.image_data?.url || attachment.payload?.url;
              attachmentType = attachment.type;
              console.log(`📎 Attachment found: type=${attachmentType}, url=${attachmentUrl}`);
            }

            // ✅ Handle Facebook echo messages (outbound from Page)
            if (isEcho) {
              console.log("🔄 Processing Facebook echo message (outbound)");
              
              // For echo messages: sender is YOUR Page, recipient is the CUSTOMER
              const pageId = senderId;        // Your Page ID
              const customerId = recipientId;  // Customer ID
              
              console.log(`💬 Echo from Page ${pageId} to customer ${customerId}: ${text}`);

              // Log recipient info to check if name is in webhook payload
              if (event.recipient) {
                console.log(`📋 Recipient info from webhook:`, {
                  id: event.recipient.id,
                  name: event.recipient.name || "NOT INCLUDED IN PAYLOAD"
                });
              }

              const page = await prisma.metaPage.findUnique({
                where: { pageId },
              });
              
              if (!page) {
                console.error("❌ Page not found in DB:", pageId);
                const allPages = await prisma.metaPage.findMany({
                  select: { pageId: true, pageName: true }
                });
                console.error("❌ Available pages in DB:", allPages.map(p => `${p.pageId} (${p.pageName})`).join(', '));
                continue;
              }

              // Use correct conversation ID format (pageId_customerId)
              const conversation = await prisma.facebookConversation.upsert({
                where: { fbConversationId: `${pageId}_${customerId}` },
                create: {
                  metaPageId: page.id,
                  fbConversationId: `${pageId}_${customerId}`,
                  participantId: customerId,
                  participantName: customerId,
                  updatedTime: timestamp,
                },
                update: {
                  updatedTime: timestamp,
                  snippet: text,
                },
              });

              // Check for duplicate with real ID
              let existingMessage = await prisma.facebookMessage.findUnique({
                where: { fbMessageId: mid },
              });

              // If not found, check for temporary message to update
              if (!existingMessage) {
                const thirtySecondsAgo = new Date(timestamp.getTime() - 30000);
                existingMessage = await prisma.facebookMessage.findFirst({
                  where: {
                    conversationId: conversation.id,
                    direction: "OUTBOUND",
                    deliveryStatus: "PENDING",
                    fbMessageId: { startsWith: "local_" },
                    createdTime: { gte: thirtySecondsAgo },
                  },
                });
                
                if (existingMessage) {
                  console.log(`🔄 Found temporary message to update: ${existingMessage.fbMessageId}`);
                }
              }

              // Fetch attachment URL from API if not in webhook
              if (!attachmentUrl && mid && page.pageAccessToken) {
                try {
                  console.log(`🔄 Fetching attachment URL from API for message ${mid}...`);
                  const msgRes = await axios.get(
                    `https://graph.facebook.com/v19.0/${mid}`,
                    {
                      params: {
                        fields: 'attachments',
                        access_token: page.pageAccessToken,
                      },
                    }
                  );
                  
                  const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
                  if (attachmentsData && attachmentsData.length > 0) {
                    attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
                    if (attachmentUrl) {
                      console.log(`📎 Fetched attachment URL from API: ${attachmentUrl.substring(0, 100)}...`);
                    }
                  }
                } catch (fetchErr: any) {
                  console.warn(`⚠️ Could not fetch attachment URL from API: ${fetchErr.message}`);
                }
              }

              if (!existingMessage) {
                // No existing message, create new one
                await prisma.facebookMessage.create({
                  data: {
                    conversationId: conversation.id,
                    fbMessageId: mid,
                    fromId: pageId, // Page sent it
                    text: text ?? null,
                    attachmentUrl: attachmentUrl,
                    attachmentType: attachmentType,
                    direction: "OUTBOUND",
                    deliveryStatus: "SENT",
                    createdTime: timestamp,
                  },
                });
                
                if (attachmentType === "audio") {
                  console.log(`✅ Facebook echo voice message saved to DB (audio attachment)`);
                } else if (text) {
                  console.log(`✅ Facebook echo message saved to DB: ${text}`);
                } else {
                  console.log(`✅ Facebook echo message saved to DB (no text)`);
                }
                
                if (attachmentUrl) {
                  console.log(`📎 Attachment URL saved: ${attachmentUrl.substring(0, 100)}...`);
                }
              } else {
                // Update existing message (either duplicate or temporary)
                await prisma.facebookMessage.update({
                  where: { id: existingMessage.id },
                  data: {
                    fbMessageId: mid,
                    fromId: pageId,
                    text: text ?? existingMessage.text,
                    attachmentUrl: attachmentUrl ?? existingMessage.attachmentUrl,
                    attachmentType: attachmentType ?? existingMessage.attachmentType,
                    deliveryStatus: "SENT",
                    createdTime: timestamp,
                  },
                });
                
                if (existingMessage.fbMessageId.startsWith("local_")) {
                  console.log(`✅ Updated temporary message to SENT: ${text}`);
                } else {
                  console.log(`⚠️ Facebook echo message already exists: ${mid}`);
                }
                
                if (attachmentUrl) {
                  console.log(`📎 Attachment URL saved: ${attachmentUrl.substring(0, 100)}...`);
                }
              }
              continue;
            }

            // Regular inbound message from customer
            // For regular messages: sender is the CUSTOMER, recipient is YOUR Page
            const pageId = recipientId;  // Page ID
            const customerId = senderId; // Customer ID
            
            console.log(`💬 Facebook message from ${customerId}: ${text}`);

            // Log sender info to check if name is in webhook payload
            if (event.sender) {
              console.log(`📋 Sender info from webhook:`, {
                id: event.sender.id,
                name: event.sender.name || "NOT INCLUDED IN PAYLOAD"
              });
            }

            const page = await prisma.metaPage.findUnique({
              where: { pageId },
            });
            if (!page) {
              console.error("❌ Page not found in DB:", pageId);
              const allPages = await prisma.metaPage.findMany({
                select: { pageId: true, pageName: true }
              });
              console.error("❌ Available pages in DB:", allPages.map(p => `${p.pageId} (${p.pageName})`).join(', '));
              continue;
            }

            // Try to get name from webhook payload first (works for testers!)
            let senderName = null;

            if (event.sender && event.sender.name) {
              senderName = event.sender.name;
              console.log(`✅ Got name from webhook payload: ${senderName} (no API call needed)`);
            } else {
              // Fallback to Graph API call
              console.log(`⚠️ Name not in webhook payload, trying Graph API...`);
              senderName = await getSenderName(
                customerId,
                pageId,
                page.pageAccessToken,
              );
              if (senderName) {
                console.log(`✅ Fetched name via Graph API: ${senderName}`);
              } else {
                console.log(`❌ Could not fetch name for ${customerId}, will use ID as fallback`);
              }
            }

            const conversation = await prisma.facebookConversation.upsert({
              where: { fbConversationId: `${pageId}_${customerId}` },
              create: {
                metaPageId: page.id,
                fbConversationId: `${pageId}_${customerId}`,
                participantId: customerId,
                participantName: senderName || customerId,
                updatedTime: timestamp,
              },
              update: {
                participantName: senderName || undefined,
                updatedTime: timestamp,
                snippet: text,
              },
            });

            // Fetch attachment URL from API if not in webhook
            if (!attachmentUrl && mid && page.pageAccessToken) {
              try {
                console.log(`🔄 Fetching attachment URL from API for inbound message ${mid}...`);
                const msgRes = await axios.get(
                  `https://graph.facebook.com/v19.0/${mid}`,
                  {
                    params: {
                      fields: 'attachments',
                      access_token: page.pageAccessToken,
                    },
                  }
                );
                
                const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
                if (attachmentsData && attachmentsData.length > 0) {
                  attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
                  if (attachmentUrl) {
                    console.log(`📎 Fetched attachment URL from API: ${attachmentUrl.substring(0, 100)}...`);
                  }
                }
              } catch (fetchErr: any) {
                console.warn(`⚠️ Could not fetch attachment URL from API: ${fetchErr.message}`);
              }
            }

            // Check for duplicate message before saving
            const existingMessage = await prisma.facebookMessage.findUnique({
              where: { fbMessageId: mid },
            });

            if (!existingMessage) {
              await prisma.facebookMessage.create({
                data: {
                  conversationId: conversation.id,
                  fbMessageId: mid,
                  fromId: customerId,
                  text: text ?? null,
                  attachmentUrl: attachmentUrl,
                  attachmentType: attachmentType,
                  direction: "INBOUND",
                  createdTime: timestamp,
                },
              });
              
              if (attachmentType === "audio") {
                console.log(`✅ Facebook voice message saved to DB (audio attachment)`);
              } else if (text) {
                console.log(`✅ Facebook message saved to DB: ${text}`);
              } else {
                console.log(`✅ Facebook message saved to DB (no text)`);
              }
              
              if (attachmentUrl) {
                console.log(`📎 Attachment URL saved: ${attachmentUrl}`);
              }
            } else {
              console.log(`⚠️ Facebook message already exists: ${mid}`);
            }
          }
        }
      }

      if (body.object === "instagram") {
        console.log("📸 INSTAGRAM WEBHOOK DETECTED");
        console.log("📸 Entry Count:", body.entry?.length || 0);
        
        if (!body.entry || body.entry.length === 0) {
          console.log("⚠️ No entries in Instagram webhook payload");
        }
        
        for (const entry of body.entry ?? []) {
          console.log(`📸 Processing ${entry.messaging?.length || 0} Instagram messaging events`);
          
          if (!entry.messaging || entry.messaging.length === 0) {
            console.log("⚠️ No messaging events in this Instagram entry");
            continue;
          }
          
          for (const event of entry.messaging ?? []) {
            const senderId = event.sender.id;
            const igAccountId = event.recipient.id;
            const text = event.message?.text;
            const mid = event.message?.mid;
            // Handle timestamp safely - fallback to current time if invalid
            const timestamp = event.timestamp && event.timestamp > 0
              ? new Date(event.timestamp * 1000)
              : new Date();
            const isEcho = event.message?.is_echo;
            const attachments = event.message?.attachments;

            let attachmentUrl = null;
            let attachmentType = null;
            
            if (attachments && attachments.length > 0) {
              const attachment = attachments[0];
              attachmentUrl = attachment.image_data?.url || attachment.payload?.url;
              attachmentType = attachment.type;
              console.log(`📎 Instagram attachment found: type=${attachmentType}, url=${attachmentUrl}`);
            }

            // ✅ Handle echo messages (outbound messages sent FROM Instagram app)
            if (isEcho) {
              console.log("🔄 Processing Instagram echo message (outbound)");
              
              // For echo messages: sender is YOUR IG account, recipient is the CUSTOMER
              const pageIgAccountId = event.sender.id;
              const customerIgId = event.recipient.id;
              
              console.log(`📸 Echo from YOUR IG account ${pageIgAccountId} to customer ${customerIgId}: ${text}`);

              const igAccount = await prisma.instagramAccount.findUnique({
                where: { igAccountId: pageIgAccountId },
                include: { metaPage: true },
              });

              if (!igAccount) {
                console.error("❌ Instagram account not found in DB:", pageIgAccountId);
                const allIgAccounts = await prisma.instagramAccount.findMany({
                  select: { igAccountId: true, username: true }
                });
                console.error("❌ Available IG accounts in DB:", allIgAccounts.map(acc => `${acc.igAccountId} (${acc.username})`).join(', '));
                continue;
              }

              console.log(`✅ Found Instagram account: @${igAccount.username} (ID: ${igAccount.igAccountId})`);

              // Use CUSTOMER ID in conversation lookup (not sender)
              let conversation = await prisma.igConversation.findUnique({
                where: { igConversationId: `${pageIgAccountId}_${customerIgId}` },
              });

              if (!conversation) {
                conversation = await prisma.igConversation.create({
                  data: {
                    igAccountId: igAccount.id,
                    igConversationId: `${pageIgAccountId}_${customerIgId}`,
                    participantIgId: customerIgId,
                    participantUsername: customerIgId,
                    updatedAt: timestamp,
                  },
                });
                console.log(`✅ Created new Instagram conversation: ${pageIgAccountId}_${customerIgId}`);
              }

              // Fetch CUSTOMER username (recipient, not sender)
              let participantUsername = null;
              try {
                const response = await axios.get(
                  `https://graph.facebook.com/v19.0/${customerIgId}`,
                  {
                    params: {
                      fields: "username",
                      access_token: igAccount.metaPage?.pageAccessToken,
                    },
                  }
                );
                participantUsername = response.data.username;
                console.log(`✅ Fetched participant username: @${participantUsername}`);
                
                // Update conversation with username
                await prisma.igConversation.update({
                  where: { id: conversation.id },
                  data: { participantUsername },
                });
              } catch (err: any) {
                console.warn("⚠️ Could not fetch Instagram username:", err.message);
              }

              // Check for duplicate message with real ID
              let existingMessage = await prisma.igMessage.findUnique({
                where: { igMessageId: mid },
              });

              // If not found, check for temporary message to update
              if (!existingMessage) {
                const thirtySecondsAgo = new Date(timestamp.getTime() - 30000);
                existingMessage = await prisma.igMessage.findFirst({
                  where: {
                    conversationId: conversation.id,
                    direction: "OUTBOUND",
                    deliveryStatus: "PENDING",
                    igMessageId: { startsWith: "local_" },
                    timestamp: { gte: thirtySecondsAgo },
                  },
                });
                
                if (existingMessage) {
                  console.log(`🔄 Found temporary Instagram message to update: ${existingMessage.igMessageId}`);
                }
              }

              // Fetch attachment URL from API if not in webhook
              if (!attachmentUrl && mid && igAccount.metaPage?.pageAccessToken) {
                try {
                  console.log(`🔄 Fetching Instagram attachment URL from API for message ${mid}...`);
                  const msgRes = await axios.get(
                    `https://graph.facebook.com/v19.0/${mid}`,
                    {
                      params: {
                        fields: 'attachments',
                        access_token: igAccount.metaPage.pageAccessToken,
                      },
                    }
                  );
                  
                  const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
                  if (attachmentsData && attachmentsData.length > 0) {
                    attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
                    if (attachmentUrl) {
                      console.log(`📎 Fetched Instagram attachment URL from API: ${attachmentUrl.substring(0, 100)}...`);
                    }
                  }
                } catch (fetchErr: any) {
                  console.warn(`⚠️ Could not fetch Instagram attachment URL from API: ${fetchErr.message}`);
                }
              }

              if (!existingMessage) {
                // No existing message, create new one
                await prisma.igMessage.create({
                  data: {
                    conversationId: conversation.id,
                    igMessageId: mid,
                    fromId: pageIgAccountId,
                    text: text ?? null,
                    attachmentUrl: attachmentUrl,
                    attachmentType: attachmentType,
                    direction: "OUTBOUND",
                    deliveryStatus: "SENT",
                    timestamp,
                  },
                });
                console.log(`✅ Instagram echo message saved to DB: ${text}`);
                if (attachmentUrl) {
                  console.log(`📎 Attachment URL saved: ${attachmentUrl}`);
                }
              } else {
                // Update existing message (either duplicate or temporary)
                await prisma.igMessage.update({
                  where: { id: existingMessage.id },
                  data: {
                    igMessageId: mid,
                    fromId: pageIgAccountId,
                    text: text ?? existingMessage.text,
                    attachmentUrl: attachmentUrl ?? existingMessage.attachmentUrl,
                    attachmentType: attachmentType ?? existingMessage.attachmentType,
                    deliveryStatus: "SENT",
                    timestamp,
                  },
                });
                
                if (existingMessage.igMessageId.startsWith("local_")) {
                  console.log(`✅ Updated temporary Instagram message to SENT: ${text}`);
                } else {
                  console.log(`⚠️ Instagram echo message already exists: ${mid}`);
                }
                
                if (attachmentUrl) {
                  console.log(`📎 Attachment URL saved: ${attachmentUrl}`);
                }
              }
              continue;
            }

            // ✅ Process regular INBOUND message (from customer)
            if (!event.message) {
              console.log("⚠️ Skipping message with no content");
              continue;
            }

            console.log(`📸 Instagram message from ${senderId}: ${text}`);
            console.log(`📸 Recipient IG Account ID: ${igAccountId}`);

            const igAccount = await prisma.instagramAccount.findUnique({
              where: { igAccountId },
              include: { metaPage: true },
            });

            if (!igAccount) {
              console.error("❌ Instagram account not found in DB:", igAccountId);
              const allIgAccounts = await prisma.instagramAccount.findMany({
                select: { igAccountId: true, username: true }
              });
              console.error("❌ Available IG accounts in DB:", allIgAccounts.map(acc => `${acc.igAccountId} (${acc.username})`).join(', '));
              continue;
            }

            console.log(`✅ Found Instagram account: @${igAccount.username} (ID: ${igAccount.igAccountId})`);

            let senderUsername = null;
            try {
              console.log(`🔄 Fetching username for sender ID: ${senderId}`);
              const response = await axios.get(
                `https://graph.facebook.com/v19.0/${senderId}`,
                {
                  params: {
                    fields: "username",
                    access_token: igAccount.metaPage?.pageAccessToken,
                  },
                }
              );
              senderUsername = response.data.username;
              console.log(`✅ Fetched sender username: @${senderUsername}`);
            } catch (err: any) {
              console.warn("⚠️ Could not fetch Instagram username:", err.message);
              console.warn("⚠️ Using sender ID as username fallback");
            }

            const conversation = await prisma.igConversation.upsert({
              where: { igConversationId: `${igAccountId}_${senderId}` },
              create: {
                igAccountId: igAccount.id,
                igConversationId: `${igAccountId}_${senderId}`,
                participantIgId: senderId,
                participantUsername: senderUsername || senderId,
                updatedAt: timestamp,
              },
              update: {
                participantUsername: senderUsername || undefined,
                updatedAt: timestamp,
              },
            });

            // Check for duplicate message before saving
            const existingMessage = await prisma.igMessage.findUnique({
              where: { igMessageId: mid },
            });

            if (!existingMessage) {
              // Handle attachments for Instagram inbound messages
              const attachments = event.message?.attachments;
              let attachmentUrl = null;
              let attachmentType = null;
              
              if (attachments && attachments.length > 0) {
                const attachment = attachments[0];
                attachmentUrl = attachment.image_data?.url || attachment.payload?.url;
                attachmentType = attachment.type;
                console.log(`📎 Instagram inbound attachment: type=${attachmentType}, url=${attachmentUrl}`);
              }

              // Fetch attachment URL from API if not in webhook
              if (!attachmentUrl && mid && igAccount.metaPage?.pageAccessToken) {
                try {
                  console.log(`🔄 Fetching Instagram attachment URL from API for inbound message ${mid}...`);
                  const msgRes = await axios.get(
                    `https://graph.facebook.com/v19.0/${mid}`,
                    {
                      params: {
                        fields: 'attachments',
                        access_token: igAccount.metaPage.pageAccessToken,
                      },
                    }
                  );
                  
                  const attachmentsData = msgRes.data.attachments?.data || msgRes.data.attachments;
                  if (attachmentsData && attachmentsData.length > 0) {
                    attachmentUrl = attachmentsData[0].image_data?.url || attachmentsData[0].payload?.url;
                    if (attachmentUrl) {
                      console.log(`📎 Fetched Instagram attachment URL from API: ${attachmentUrl.substring(0, 100)}...`);
                    }
                  }
                } catch (fetchErr: any) {
                  console.warn(`⚠️ Could not fetch Instagram attachment URL from API: ${fetchErr.message}`);
                }
              }

              await prisma.igMessage.create({
                data: {
                  conversationId: conversation.id,
                  igMessageId: mid,
                  fromId: senderId,
                  fromUsername: senderUsername,
                  text: text ?? null,
                  attachmentUrl: attachmentUrl,
                  attachmentType: attachmentType,
                  direction: "INBOUND",
                  timestamp,
                },
              });
              console.log(`✅ Instagram message saved to DB: ${text}`);
              if (attachmentUrl) {
                console.log(`📎 Attachment URL saved: ${attachmentUrl}`);
              }
            } else {
              console.log(`⚠️ Instagram message already exists: ${mid}`);
            }
          }
        }
      }

      // ===================== WHATSAPP WEBHOOK HANDLING =====================
      if (body.object === "whatsapp_business_account") {
        console.log("📱 WHATSAPP WEBHOOK DETECTED");
        
        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const value = change.value;
            
            // Handle incoming messages
            if (value?.messages && value.messages.length > 0) {
              for (const message of value.messages) {
                const from = message.from; // sender's phone number
                const messageId = message.id;
                const timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000) : new Date();
                const contactName = value.contacts?.[0]?.profile?.name || "Unknown";
                
                console.log(`📱 New WhatsApp message from ${contactName} (${from})`);
                
                let text = null;
                let attachmentUrl = null;
                let attachmentType = null;
                let mediaId = null;
                
                // Handle different message types
                if (message.type === "text") {
                  text = message.text?.body;
                  console.log(`💬 Text: ${text}`);
                } else if (message.type === "image") {
                  text = message.image?.caption || null;
                  mediaId = message.image?.id;
                  attachmentType = "image";
                  console.log(`🖼️ Image received, ID: ${mediaId}`);
                } else if (message.type === "audio" || message.type === "voice") {
                  mediaId = message.audio?.id || message.voice?.id;
                  attachmentType = "audio";
                  console.log(`🎵 Audio received, ID: ${mediaId}`);
                } else if (message.type === "video") {
                  text = message.video?.caption || null;
                  mediaId = message.video?.id;
                  attachmentType = "video";
                  console.log(`🎬 Video received, ID: ${mediaId}`);
                } else if (message.type === "document") {
                  text = message.document?.caption || null;
                  mediaId = message.document?.id;
                  attachmentType = "document";
                  console.log(`📄 Document received, ID: ${mediaId}`);
                }
                
                // Fetch media URL from WhatsApp API if mediaId is present
                if (mediaId && !attachmentUrl) {
                  try {
                    // First find any WhatsApp account to get the access token
                    const anyWaAccount = await prisma.whatsAppAccount.findFirst();
                    
                    if (anyWaAccount?.systemUserToken) {
                      console.log(`🔄 Fetching WhatsApp media URL for ID: ${mediaId}`);
                      
                      const mediaRes = await axios.get(
                        `https://graph.facebook.com/v19.0/${mediaId}`,
                        {
                          headers: {
                            Authorization: `Bearer ${anyWaAccount.systemUserToken}`,
                          },
                        }
                      );
                      
                      attachmentUrl = mediaRes.data.url;
                      console.log(`📎 WhatsApp media URL fetched: ${attachmentUrl?.substring(0, 100)}...`);
                    } else {
                      console.warn(`⚠️ No WhatsApp account with token found to fetch media URL`);
                    }
                  } catch (mediaErr: any) {
                    console.error(`❌ Failed to fetch WhatsApp media URL: ${mediaErr.response?.data || mediaErr.message}`);
                  }
                }
                
                // Find WhatsApp account by phone number ID
                const phoneNumberId = change.value.metadata?.phone_number_id;
                let waAccount = await prisma.whatsAppAccount.findFirst({
                  where: { phoneNumberId },
                });
                
                if (!waAccount) {
                  console.log(`⚠️ WhatsApp account not found for phone ID: ${phoneNumberId}, trying first account...`);
                  waAccount = await prisma.whatsAppAccount.findFirst();
                }
                
                if (!waAccount) {
                  console.error("❌ No WhatsApp account found in database");
                  continue;
                }
                
                // Get or create conversation (using findFirst since there's no unique constraint on the compound)
                let conversation = await prisma.waConversation.findFirst({
                  where: {
                    waAccountId: waAccount.id,
                    contactPhone: from,
                  },
                });
                
                if (!conversation) {
                  conversation = await prisma.waConversation.create({
                    data: {
                      waAccountId: waAccount.id,
                      contactPhone: from,
                      contactName,
                      lastMessageAt: timestamp,
                    },
                  });
                  console.log(`✅ Created new WhatsApp conversation with ${from}`);
                } else {
                  // Update conversation
                  await prisma.waConversation.update({
                    where: { id: conversation.id },
                    data: {
                      contactName,
                      lastMessageAt: timestamp,
                    },
                  });
                }
                
                // Check for duplicate message
                const existingMessage = await prisma.waMessage.findUnique({
                  where: { waMessageId: messageId },
                });
                
                if (!existingMessage) {
                  // Map attachment type to WaMessageType enum
                  const messageType = (() => {
                    switch (attachmentType?.toUpperCase()) {
                      case "IMAGE": return "IMAGE";
                      case "VIDEO": return "VIDEO";
                      case "AUDIO": return "AUDIO";
                      case "DOCUMENT": return "DOCUMENT";
                      case "VOICE": return "AUDIO";
                      default: return "TEXT";
                    }
                  })();
                  
                  // Save message to database
                  await prisma.waMessage.create({
                    data: {
                      conversationId: conversation.id,
                      waMessageId: messageId,
                      direction: "INBOUND",
                      type: messageType,
                      text,
                      mediaUrl: attachmentUrl,
                      mediaType: attachmentType,
                      status: "SENT",
                      timestamp,
                    },
                  });
                  console.log(`✅ WhatsApp message saved to DB: ${text || `[${attachmentType}]`}`);
                } else {
                  console.log(`⚠️ WhatsApp message already exists: ${messageId}`);
                }
              }
            }
            
            // Handle message status updates
            if (value?.statuses && value.statuses.length > 0) {
              for (const status of value.statuses) {
                const messageId = status.id;
                const statusValue = status.status; // sent, delivered, read, failed
                const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date();
                
                console.log(`📊 WhatsApp message ${messageId} status: ${statusValue}`);
                
                // Update message status in database
                await prisma.waMessage.updateMany({
                  where: { waMessageId: messageId },
                  data: { status: statusValue.toUpperCase() },
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
  },
);

export default metaWebhookRouter;
