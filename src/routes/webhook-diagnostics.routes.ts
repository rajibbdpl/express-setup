import { Router, Request, Response } from "express";
import axios from "axios";
import { auth } from "@/lib/auth";
import { subscribeAppToInstagramWebhook, subscribeAppToFacebookPageWebhook } from "@/utils/meta";
import { prisma } from "@/config/database";

const webhookDiagnosticsRouter = Router();

webhookDiagnosticsRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const META_APP_ID = process.env.META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;

    if (!META_APP_ID || !META_APP_SECRET) {
      return res.status(500).json({ error: "Missing Meta app credentials in environment" });
    }

    console.log("🔄 Checking webhook subscription status...");

    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          grant_type: 'client_credentials',
        },
      }
    );
    const appAccessToken = tokenRes.data.access_token;

    const subsRes = await axios.get(
      `https://graph.facebook.com/v19.0/${META_APP_ID}/subscriptions`,
      {
        params: { access_token: appAccessToken },
      }
    );

    const subscriptions = subsRes.data.data || [];
    const hasInstagram = subscriptions.some((sub: any) => sub.object === 'instagram');

    console.log(`✅ Found ${subscriptions.length} webhook subscriptions`);
    console.log(`📸 Instagram webhook ${hasInstagram ? 'FOUND' : 'NOT FOUND'}`);

    res.json({
      success: true,
      totalSubscriptions: subscriptions.length,
      hasInstagramWebhook: hasInstagram,
      subscriptions: subscriptions,
      message: hasInstagram 
        ? "Instagram webhook is properly subscribed" 
        : "Instagram webhook NOT subscribed. Use POST /api/v1/webhooks/subscribe-instagram to subscribe."
    });
  } catch (err: any) {
    console.error('❌ Failed to check webhook status:', err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to check webhook status",
      details: err.response?.data || err.message 
    });
  }
});

webhookDiagnosticsRouter.post("/subscribe-instagram", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    console.log("🔄 Manual Instagram webhook subscription requested...");

    const result = await subscribeAppToInstagramWebhook();
    
    res.json({
      success: true,
      message: "Instagram webhook subscribed successfully",
      result,
      note: "Your app is now subscribed to Instagram Direct message webhooks"
    });
  } catch (err: any) {
    console.error('❌ Failed to subscribe Instagram webhook:', err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to subscribe Instagram webhook",
      details: err.response?.data || err.message,
      hint: "Check that ALLOWED_ORIGINS environment variable is set to your public ngrok URL"
    });
  }
});

webhookDiagnosticsRouter.get("/database-check", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const instagramAccounts = await prisma.instagramAccount.findMany({
      where: {
        metaPage: { userId: session.user.id }
      },
      select: {
        igAccountId: true,
        username: true,
        name: true,
      },
    });

    const metaPages = await prisma.metaPage.findMany({
      where: { userId: session.user.id },
      select: {
        pageId: true,
        pageName: true,
      },
    });

    const igConversations = await prisma.igConversation.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        igConversationId: true,
        participantIgId: true,
        participantUsername: true,
        updatedAt: true,
      },
    });

    const igMessages = await prisma.igMessage.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
      select: {
        id: true,
        igMessageId: true,
        fromId: true,
        fromUsername: true,
        text: true,
        direction: true,
        deliveryStatus: true,
        timestamp: true,
      },
    });

    const facebookConversations = await prisma.facebookConversation.findMany({
      orderBy: { updatedTime: "desc" },
      take: 10,
      select: {
        id: true,
        fbConversationId: true,
        participantId: true,
        participantName: true,
        updatedTime: true,
      },
    });

    const facebookMessages = await prisma.facebookMessage.findMany({
      orderBy: { createdTime: "desc" },
      take: 10,
      select: {
        id: true,
        fbMessageId: true,
        fromId: true,
        fromName: true,
        text: true,
        direction: true,
        createdTime: true,
      },
    });

    res.json({
      success: true,
      summary: {
        instagramAccounts: instagramAccounts.length,
        metaPages: metaPages.length,
        igConversations: igConversations.length,
        igMessages: igMessages.length,
        facebookConversations: facebookConversations.length,
        facebookMessages: facebookMessages.length,
      },
      instagramAccounts,
      metaPages,
      recentData: {
        igConversations,
        igMessages,
        facebookConversations,
        facebookMessages,
      },
    });
  } catch (err: any) {
    console.error('❌ Database check failed:', err);
    res.status(500).json({ 
      error: "Failed to check database",
      details: err.message 
    });
  }
});

webhookDiagnosticsRouter.get("/facebook-subscription/:pageId", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const pageId = req.params.pageId as string;

    const page = await prisma.metaPage.findFirst({
      where: { 
        pageId,
        userId: session.user.id 
      },
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found or not owned by user" });
    }

    const subsRes = await axios.get(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      {
        params: { access_token: page.pageAccessToken },
      }
    );

    const subscriptions = subsRes.data.data || [];
    
    res.json({
      success: true,
      pageId,
      pageName: page.pageName,
      subscriptions,
      hasMessages: subscriptions.some((sub: any) => 
        sub.subscribed_fields?.includes('messages')
      ),
      hasMessageEchoes: subscriptions.some((sub: any) => 
        sub.subscribed_fields?.includes('message_echoes')
      ),
      recommendation: !subscriptions.some((sub: any) => 
        sub.subscribed_fields?.includes('message_echoes')
      ) 
        ? "Page should be re-subscribed with message_echoes field" 
        : "Page subscription looks good"
    });
  } catch (err: any) {
    console.error('❌ Failed to check Facebook subscription:', err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to check Facebook page subscription",
      details: err.response?.data || err.message 
    });
  }
});

webhookDiagnosticsRouter.post("/resubscribe-facebook/:pageId", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const pageId = req.params.pageId as string;

    const page = await prisma.metaPage.findFirst({
      where: { 
        pageId,
        userId: session.user.id 
      },
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found or not owned by user" });
    }

    const subscribeRes = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      {
        subscribed_fields: [
          "messages",
          "messaging_postbacks",
          "message_echoes",
        ],
        access_token: page.pageAccessToken,
      },
    );

    console.log(`✅ Page ${pageId} re-subscribed to Facebook webhooks:`, subscribeRes.data);

    res.json({
      success: true,
      pageId,
      pageName: page.pageName,
      subscription: subscribeRes.data,
      message: "Page successfully subscribed with message_echoes field"
    });
  } catch (err: any) {
    console.error('❌ Failed to re-subscribe Facebook page:', err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to re-subscribe Facebook page",
      details: err.response?.data || err.message 
    });
  }
});

webhookDiagnosticsRouter.post("/subscribe-facebook-page", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    console.log("🔄 Manual Facebook Page webhook subscription requested...");

    const result = await subscribeAppToFacebookPageWebhook();
    
    res.json({
      success: true,
      message: "Facebook Page webhook subscribed successfully at app level",
      result,
      note: "Your app is now subscribed to Facebook Page message webhooks. Make sure your pages are also subscribed at page level using /api/v1/webhooks/resubscribe-facebook/:pageId"
    });
  } catch (err: any) {
    console.error('❌ Failed to subscribe Facebook Page webhook:', err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to subscribe Facebook Page webhook",
      details: err.response?.data || err.message,
      hint: "Check that META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, and NGROK_LINK/ALLOWED_ORIGINS environment variables are set"
    });
  }
});

webhookDiagnosticsRouter.get("/test", async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Webhook diagnostics endpoint is working",
    endpoints: {
      "GET /api/v1/webhooks/status": "Check current webhook subscriptions",
      "POST /api/v1/webhooks/subscribe-instagram": "Manually subscribe to Instagram webhooks",
      "POST /api/v1/webhooks/subscribe-facebook-page": "Manually subscribe to Facebook Page webhooks (app-level)",
      "GET /api/v1/webhooks/database-check": "Check database state (IG accounts, pages, messages)",
      "GET /api/v1/webhooks/facebook-subscription/:pageId": "Check Facebook page webhook subscription",
      "POST /api/v1/webhooks/resubscribe-facebook/:pageId": "Re-subscribe Facebook page with message_echoes (page-level)",
      "GET /api/v1/webhooks/test": "This test endpoint"
    },
    environment: {
      hasAppId: !!process.env.META_APP_ID,
      hasAppSecret: !!process.env.META_APP_SECRET,
      hasVerifyToken: !!process.env.META_VERIFY_TOKEN,
      hasWebhookUrl: !!process.env.ALLOWED_ORIGINS,
      webhookUrl: process.env.ALLOWED_ORIGINS || "NOT SET"
    }
  });
});

export default webhookDiagnosticsRouter;
