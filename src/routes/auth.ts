import { Router, Request, Response } from "express";
import axios from "axios";
import { metaConfig } from "@/config";
import { prisma } from "@/config/database";
import { subscribePageToWebHook } from "@/utils/meta";

const authRouter = Router();

const { META_APP_ID, META_REDIRECT_URI, META_APP_SECRET } = metaConfig;

//redirect user to tiktok oauth
authRouter.get("/tiktok", (req, res) => {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: "user.info.basic,video.list,video.upload",
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state: "random_state_string", // Use a real random value + session in production
  });

  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
});

// handle callback and exchange code for tokens
authRouter.get("/tiktok/callback", async (req, res) => {
  const { code, error, scopes } = req.query;
  console.log("🚀 ~ error:", error);
  if (error) {
    console.error("TikTok returned error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/connect?error=${error}`);
  }

  if (!code) {
    console.error("No code in callback");
    return res.status(400).json({ error: "Missing code" });
  }

  console.log("Code received:", code);
  console.log("Scopes granted:", scopes);

  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",

      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token, refresh_token, open_id, expires_in } = response.data;

    //save tokens in database associated with user

    req.app.locals.tiktokTokens = {
      access_token,
      refresh_token,
      open_id,
      expires_at: Math.floor(Date.now() / 1000) + (expires_in ?? 86400),
    };

    console.log("Tokens saved for open_id:", open_id);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/tiktok?tiktok=connected`,
    );
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "OAuth failed" });
  }
});

// Add this temporary debug route to auth.routes.ts
authRouter.get("/tiktok/me", async (req, res) => {
  const tokens = req.app.locals.tiktokTokens;
  if (!tokens) return res.status(401).json({ error: "Not logged in" });

  try {
    const response = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        params: { fields: "open_id,union_id,avatar_url,display_name" },
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

authRouter.post("/tiktok/logout", (req, res) => {
  req.app.locals.tiktokTokens = null;
  res.json({ success: false });
});

authRouter.get("/meta", (req: Request, res: Response) => {
const scopes = [
  "email",
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
].join(",");

  const params = new URLSearchParams({
    client_id: META_APP_ID!,
    redirect_uri: META_REDIRECT_URI!,
    scope: scopes,
    response_type: "code",
    state: Math.random().toString(36).substring(7), // prevents CSRF
  });

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  console.log("Auth URL:", authUrl);

  res.redirect(authUrl);
});

authRouter.get("/meta/callback", async (req, res) => {
  const { code, error } = req.query;
  console.log("🚀 ~ req.query:", req.query);

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/connect?error=${error}`,
    );
  }

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  try {
    // 1. Short-lived token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: META_REDIRECT_URI,
          code,
        },
      },
    );
    const shortLivedToken = tokenRes.data.access_token;

    // 2. Long-lived token
    const longLivedRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          fb_exchange_token: shortLivedToken,
        },
      },
    );
    const longLivedToken = longLivedRes.data.access_token;
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // 3. Fetch Meta user identity
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId, name, email } = meRes.data;

    // 4. Fetch pages — store in a variable first
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts`,
      { params: { access_token: longLivedToken } },
    );
    const pages = pagesRes.data.data as Array<{
      id: string;
      name: string;
      access_token: string;
      category: string;
    }>;

    // 5. Upsert user
    const user = await prisma.user.upsert({
      where: { metaUserId },
      create: {
        metaUserId,
        name,
        email: email ?? `${metaUserId}@meta.placeholder`,
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
      update: {
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
    });

    // 6. Upsert pages + subscribe each to webhook
    for (const page of pages) {
      await prisma.metaPage.upsert({
        where: { pageId: page.id },
        create: {
          userId: user.id,
          pageId: page.id,
          pageName: page.name,
          pageCategory: page.category,
          pageAccessToken: page.access_token,
        },
        update: {
          pageName: page.name,
          pageAccessToken: page.access_token,
        },
      });

      // Subscribe this page to receive webhook events
      await subscribePageToWebHook(page.id, page.access_token);
    }

    // 7. Save user in session
    req.session.userId = user.id;

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/facebook?meta=connected`,
    );
  } catch (err: any) {
    console.error("Meta callback error:", err.response?.data ?? err.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/connect?error=oauth_failed`,
    );
  }
});

export default authRouter;
