import { Router, Request, Response } from "express";
import axios from "axios";
import { metaConfig } from "@/config";
import { prisma } from "@/config/database";
import {
  subscribePageToWebHook,
  subscribeAppToInstagramWebhook,
  subscribeAppToFacebookPageWebhook,
  subscribeAppToWhatsAppWebhook,
} from "@/utils/meta";
import { auth } from "@/lib/auth";

const oauthRouter = Router();

const { META_APP_ID, META_REDIRECT_URI, META_APP_SECRET } = metaConfig;

// ============================================
// TIKTOK OAUTH ROUTES (Existing)
// ============================================

oauthRouter.get("/tiktok", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (!session?.user) {
    return res.status(401).json({ error: "Please login first" });
  }

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: "user.info.basic,user.info.profile,video.list,video.upload",
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state: session.user.id,
  });

  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
});

oauthRouter.get("/tiktok/callback", async (req, res) => {
  const { code, error, scopes, state } = req.query;
  console.log("🚀 ~ error:", error);

  if (error) {
    console.error("TikTok returned error:", error);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }

  if (!code) {
    console.error("No code in callback");
    return res.status(400).json({ error: "Missing code" });
  }

  const userId = state as string;
  if (!userId) {
    return res.status(401).json({ error: "Invalid session" });
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

    await prisma.account.upsert({
      where: {
        providerId_userId: {
          providerId: "tiktok",
          userId: userId,
        },
      },
      create: {
        userId: userId,
        providerId: "tiktok",
        accountId: open_id,
        accessToken: access_token,
        refreshToken: refresh_token,
        accessTokenExpiresAt: new Date(
          Date.now() + (expires_in ?? 86400) * 1000,
        ),
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accessTokenExpiresAt: new Date(
          Date.now() + (expires_in ?? 86400) * 1000,
        ),
      },
    });

    console.log("TikTok tokens saved for user:", userId);

    try {
      const profileRes = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/",
        {
          params: {
            fields: "open_id,union_id,avatar_url,display_name,username",
          },
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );

      const userData = profileRes.data?.data?.user;

      if (userData) {
        await prisma.tikTokAccount.upsert({
          where: { openId: open_id },
          create: {
            userId: userId,
            openId: open_id,
            username: userData.username,
            displayName: userData.display_name,
            profileImageUrl: userData.avatar_url,
          },
          update: {
            username: userData.username,
            displayName: userData.display_name,
            profileImageUrl: userData.avatar_url,
          },
        });
        console.log(
          `✅ TikTok profile saved: @${userData.username} (${userData.display_name})`,
        );
      }
    } catch (profileErr: any) {
      console.warn(
        "⚠️ Could not fetch TikTok profile:",
        profileErr.response?.data || profileErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?tiktok=connected`,
    );
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "OAuth failed" });
  }
});

oauthRouter.get("/tiktok/me", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });
  if (!session?.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const tiktokAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "tiktok" },
  });

  if (!tiktokAccount?.accessToken) {
    return res.status(401).json({ error: "TikTok not connected" });
  }

  try {
    const response = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        params: { fields: "open_id,union_id,avatar_url,display_name" },
        headers: { Authorization: `Bearer ${tiktokAccount.accessToken}` },
      },
    );
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

oauthRouter.post("/tiktok/disconnect", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });
  if (!session?.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  await prisma.tikTokAccount.deleteMany({
    where: { userId: session.user.id },
  });

  await prisma.account.deleteMany({
    where: { userId: session.user.id, providerId: "tiktok" },
  });

  res.json({ success: true });
});

// ============================================
// FACEBOOK OAUTH ROUTES
// ============================================

oauthRouter.get("/facebook", async (req: Request, res: Response) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (!session?.user) {
    return res.status(401).json({ error: "Please login first" });
  }

  const scopes = [
    "email",
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_messaging",
  ].join(",");

  const params = new URLSearchParams({
    client_id: META_APP_ID!,
    redirect_uri: `${META_REDIRECT_URI}/facebook`,
    scope: scopes,
    response_type: "code",
    state: session.user.id,
    auth_type: "reauthorize",
  });

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  console.log("Facebook Auth URL:", authUrl);

  res.redirect(authUrl);
});

// Callback route matches redirect_uri: {META_REDIRECT_URI}/facebook
oauthRouter.get("/meta/callback/facebook", async (req, res) => {
  const { code, error, state } = req.query;
  console.log("🚀 Facebook callback - req.query:", req.query);

  const userId = state as string;

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: `${META_REDIRECT_URI}/facebook`,
          code,
        },
      },
    );
    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for long-lived token
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

    console.log(
      "Facebook Long lived token (first 30 chars):",
      longLivedToken?.substring(0, 30),
    );
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId, name } = meRes.data;

    // Get user's pages
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts`,
      {
        params: {
          access_token: longLivedToken,
          fields: "id,name,category,access_token,picture",
        },
      },
    );
    const pages = pagesRes.data.data as Array<{
      id: string;
      name: string;
      access_token: string;
      category: string;
    }>;

    console.log("Facebook Pages found:", pages.length);

    // Handle existing meta user
    const existingMetaUser = await prisma.user.findUnique({
      where: { metaUserId },
    });

    if (existingMetaUser && existingMetaUser.id !== userId) {
      await prisma.metaPage.deleteMany({
        where: { userId: existingMetaUser.id },
      });

      await prisma.user.update({
        where: { id: existingMetaUser.id },
        data: {
          metaUserId: null,
          metaAccessToken: null,
          metaTokenExpiry: null,
        },
      });
    }

    // Update user with Meta info
    await prisma.user.update({
      where: { id: userId },
      data: {
        metaUserId,
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
    });

    // Save pages and subscribe to webhooks
    for (const page of pages) {
      await prisma.metaPage.upsert({
        where: { pageId: page.id },
        create: {
          userId: userId,
          pageId: page.id,
          pageName: page.name,
          pageCategory: page.category,
          pageAccessToken: page.access_token,
        },
        update: {
          userId,
          pageName: page.name,
          pageAccessToken: page.access_token,
        },
      });

      // Subscribe page to webhooks
      await subscribePageToWebHook(page.id, page.access_token);
      console.log(`✅ Facebook page ${page.name} saved and subscribed`);
    }

    // Subscribe app to Facebook Page webhooks
    try {
      console.log("🔄 Subscribing app to Facebook Page webhooks...");
      await subscribeAppToFacebookPageWebhook();
      console.log("✅ Facebook Page webhook subscription completed");
    } catch (fbWebhookErr: any) {
      console.warn(
        "⚠️ Facebook Page webhook subscription failed (may already be subscribed):",
        fbWebhookErr.response?.data?.error?.message || fbWebhookErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?facebook=connected`,
    );
  } catch (err: any) {
    console.error("Facebook callback error:", err.response?.data ?? err.message);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=oauth_failed`,
    );
  }
});

// ============================================
// INSTAGRAM OAUTH ROUTES
// ============================================

oauthRouter.get("/instagram", async (req: Request, res: Response) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (!session?.user) {
    return res.status(401).json({ error: "Please login first" });
  }

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
    redirect_uri: `${META_REDIRECT_URI}/instagram`,
    scope: scopes,
    response_type: "code",
    state: session.user.id,
    auth_type: "reauthorize",
  });

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  console.log("Instagram Auth URL:", authUrl);

  res.redirect(authUrl);
});

oauthRouter.get("/meta/callback/instagram", async (req, res) => {
  const { code, error, state } = req.query;
  console.log("🚀 Instagram callback - req.query:", req.query);

  const userId = state as string;

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: `${META_REDIRECT_URI}/instagram`,
          code,
        },
      },
    );
    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for long-lived token
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

    console.log(
      "Instagram Long lived token (first 30 chars):",
      longLivedToken?.substring(0, 30),
    );
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId, name } = meRes.data;

    // Get user's pages
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts`,
      {
        params: {
          access_token: longLivedToken,
          fields: "id,name,category,access_token,picture",
        },
      },
    );
    const pages = pagesRes.data.data as Array<{
      id: string;
      name: string;
      access_token: string;
      category: string;
    }>;

    console.log("Pages for Instagram:", pages.length);

    // Handle existing meta user
    const existingMetaUser = await prisma.user.findUnique({
      where: { metaUserId },
    });

    if (existingMetaUser && existingMetaUser.id !== userId) {
      await prisma.metaPage.deleteMany({
        where: { userId: existingMetaUser.id },
      });

      await prisma.user.update({
        where: { id: existingMetaUser.id },
        data: {
          metaUserId: null,
          metaAccessToken: null,
          metaTokenExpiry: null,
        },
      });
    }

    // Update user with Meta info
    await prisma.user.update({
      where: { id: userId },
      data: {
        metaUserId,
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
    });

    // Save pages and fetch Instagram accounts
    for (const page of pages) {
      const metaPage = await prisma.metaPage.upsert({
        where: { pageId: page.id },
        create: {
          userId: userId,
          pageId: page.id,
          pageName: page.name,
          pageCategory: page.category,
          pageAccessToken: page.access_token,
        },
        update: {
          userId,
          pageName: page.name,
          pageAccessToken: page.access_token,
        },
      });

      // Fetch Instagram Business Account linked to this page
      try {
        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${page.id}`,
          {
            params: {
              fields:
                "instagram_business_account{id,username,name,profile_picture_url,followers_count}",
              access_token: page.access_token,
            },
          },
        );

        const igAccount = igRes.data.instagram_business_account;

        if (igAccount) {
          await prisma.instagramAccount.upsert({
            where: { igAccountId: igAccount.id },
            create: {
              metaPageId: metaPage.id,
              igAccountId: igAccount.id,
              username: igAccount.username,
              name: igAccount.name,
              profilePicUrl: igAccount.profile_picture_url,
              followersCount: igAccount.followers_count,
            },
            update: {
              username: igAccount.username,
              name: igAccount.name,
              profilePicUrl: igAccount.profile_picture_url,
              followersCount: igAccount.followers_count,
            },
          });
          console.log(
            `✅ Instagram account @${igAccount.username} linked to page ${page.name}`,
          );
        }
      } catch (igErr: any) {
        console.log(
          `No Instagram account for page ${page.name}:`,
          igErr.response?.data?.error?.message || igErr.message,
        );
      }

      // Subscribe page to webhooks
      await subscribePageToWebHook(page.id, page.access_token);
    }

    // Subscribe app to Instagram webhooks
    try {
      console.log("🔄 Subscribing app to Instagram webhooks...");
      await subscribeAppToInstagramWebhook();
      console.log("✅ Instagram webhook subscription completed");
    } catch (igWebhookErr: any) {
      console.warn(
        "⚠️ Instagram webhook subscription failed (may already be subscribed):",
        igWebhookErr.response?.data?.error?.message || igWebhookErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?instagram=connected`,
    );
  } catch (err: any) {
    console.error("Instagram callback error:", err.response?.data ?? err.message);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=oauth_failed`,
    );
  }
});

// ============================================
// WHATSAPP OAUTH ROUTES
// ============================================

oauthRouter.get("/whatsapp", async (req: Request, res: Response) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (!session?.user) {
    return res.status(401).json({ error: "Please login first" });
  }

  const scopes = [
    "email",
    "public_profile",
    "business_management",
    "whatsapp_business_management",
    "whatsapp_business_messaging",
  ].join(",");

  const params = new URLSearchParams({
    client_id: META_APP_ID!,
    redirect_uri: `${META_REDIRECT_URI}/whatsapp`,
    scope: scopes,
    response_type: "code",
    state: session.user.id,
    auth_type: "reauthorize",
  });

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  console.log("WhatsApp Auth URL:", authUrl);

  res.redirect(authUrl);
});

oauthRouter.get("/meta/callback/whatsapp", async (req, res) => {
  const { code, error, state } = req.query;
  console.log("🚀 WhatsApp callback - req.query:", req.query);

  const userId = state as string;

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token`,
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: `${META_REDIRECT_URI}/whatsapp`,
          code,
        },
      },
    );
    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for long-lived token
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

    console.log(
      "WhatsApp Long lived token (first 30 chars):",
      longLivedToken?.substring(0, 30),
    );
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId, name } = meRes.data;

    // Handle existing meta user
    const existingMetaUser = await prisma.user.findUnique({
      where: { metaUserId },
    });

    if (existingMetaUser && existingMetaUser.id !== userId) {
      await prisma.whatsAppAccount.deleteMany({
        where: { userId: existingMetaUser.id },
      });

      await prisma.user.update({
        where: { id: existingMetaUser.id },
        data: {
          metaUserId: null,
          metaAccessToken: null,
          metaTokenExpiry: null,
        },
      });
    }

    // Update user with Meta info
    await prisma.user.update({
      where: { id: userId },
      data: {
        metaUserId,
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
    });

    // Fetch WhatsApp Business Accounts from Business Manager
    console.log("🔄 Fetching WhatsApp Business Accounts...");

    // Get user's businesses
    const businessesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/businesses`,
      {
        params: {
          access_token: longLivedToken,
          fields: "id,name",
        },
      },
    );

    const businesses = businessesRes.data.data || [];
    console.log(`Found ${businesses.length} businesses`);

    for (const business of businesses) {
      try {
        // Get WhatsApp Business Accounts for this business
        const wabaRes = await axios.get(
          `https://graph.facebook.com/v19.0/${business.id}/owned_whatsapp_business_accounts`,
          {
            params: {
              access_token: longLivedToken,
              fields: "id,name,timezone_id",
            },
          },
        );

        const wabas = wabaRes.data.data || [];
        console.log(
          `Found ${wabas.length} WhatsApp Business Accounts in ${business.name}`,
        );

        for (const waba of wabas) {
          try {
            // Get phone numbers for this WABA
            const phonesRes = await axios.get(
              `https://graph.facebook.com/v19.0/${waba.id}/phone_numbers`,
              {
                params: {
                  access_token: longLivedToken,
                  fields:
                    "id,display_phone_number,verified_name,quality_rating",
                },
              },
            );

            const phones = phonesRes.data.data || [];
            console.log(
              `Found ${phones.length} phone numbers in WABA ${waba.name || waba.id}`,
            );

            for (const phone of phones) {
              await prisma.whatsAppAccount.upsert({
                where: { phoneNumberId: phone.id },
                create: {
                  userId: userId,
                  phoneNumberId: phone.id,
                  businessAccountId: waba.id,
                  phoneNumber: phone.display_phone_number,
                  displayName: phone.verified_name || waba.name,
                  systemUserToken: longLivedToken,
                },
                update: {
                  businessAccountId: waba.id,
                  phoneNumber: phone.display_phone_number,
                  displayName: phone.verified_name || waba.name,
                  systemUserToken: longLivedToken,
                },
              });
              console.log(
                `✅ WhatsApp account saved: ${phone.verified_name} (${phone.display_phone_number})`,
              );
            }
          } catch (phoneErr: any) {
            console.warn(
              `⚠️ Could not fetch phone numbers for WABA ${waba.id}:`,
              phoneErr.response?.data?.error?.message || phoneErr.message,
            );
          }
        }
      } catch (wabaErr: any) {
        console.warn(
          `⚠️ Could not fetch WABAs for business ${business.name}:`,
          wabaErr.response?.data?.error?.message || wabaErr.message,
        );
      }
    }

    // Subscribe app to WhatsApp webhooks
    try {
      console.log("🔄 Subscribing app to WhatsApp webhooks...");
      await subscribeAppToWhatsAppWebhook();
      console.log("✅ WhatsApp webhook subscription completed");
    } catch (waWebhookErr: any) {
      console.warn(
        "⚠️ WhatsApp webhook subscription failed (may already be subscribed):",
        waWebhookErr.response?.data?.error?.message || waWebhookErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?whatsapp=connected`,
    );
  } catch (err: any) {
    console.error("WhatsApp callback error:", err.response?.data ?? err.message);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=oauth_failed`,
    );
  }
});

export default oauthRouter;
