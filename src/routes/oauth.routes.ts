import { Router, Request, Response } from "express";
import axios from "axios";
import { metaConfig } from "@/config";
import { prisma } from "@/config/database";
import {
  subscribePageToWebHook,
  subscribeAppToInstagramWebhook,
  subscribeAppToFacebookPageWebhook,
  subscribeAppToWhatsAppWebhook,
  subscribeWabaToWebhook,
} from "@/utils/meta";
import { auth } from "@/lib/auth";

const oauthRouter = Router();

const { META_APP_ID, META_REDIRECT_URI, META_APP_SECRET, WHATSAPP_BUSINESS_ACCOUNT_ID } = metaConfig;

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
  res.redirect(authUrl);
});

oauthRouter.get("/meta/callback/facebook", async (req, res) => {
  const { code, error, state } = req.query;
  const userId = state as string;

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }
  if (!code) return res.status(400).json({ error: "Missing code" });
  if (!userId) return res.status(401).json({ error: "Invalid session" });

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
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId } = meRes.data;

    // Handle existing meta user conflict
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

    // Update user with Meta tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        metaUserId,
        metaAccessToken: longLivedToken,
        metaTokenExpiry: tokenExpiry,
      },
    });

    // Get pages
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

    // Save pages only — no Instagram fetching
    for (const page of pages) {
      await prisma.metaPage.upsert({
        where: { pageId: page.id },
        create: {
          userId,
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

      await subscribePageToWebHook(page.id, page.access_token);
      console.log(`✅ Facebook page ${page.name} saved and subscribed`);
    }

    try {
      await subscribeAppToFacebookPageWebhook();
    } catch (fbWebhookErr: any) {
      console.warn(
        "⚠️ Facebook webhook subscription failed:",
        fbWebhookErr.response?.data?.error?.message || fbWebhookErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?facebook=connected`,
    );
  } catch (err: any) {
    console.error(
      "Facebook callback error:",
      err.response?.data ?? err.message,
    );
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
  res.redirect(authUrl);
});

oauthRouter.get("/meta/callback/instagram", async (req, res) => {
  const { code, error, state } = req.query;
  const userId = state as string;

  if (error) {
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=${error}`,
    );
  }
  if (!code) return res.status(400).json({ error: "Missing code" });
  if (!userId) return res.status(401).json({ error: "Invalid session" });

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
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me`, {
      params: { access_token: longLivedToken, fields: "id,name,email" },
    });
    const { id: metaUserId } = meRes.data;

    // NOTE: Instagram tokens are now stored in InstagramAccount, not User
    // This makes Instagram independent from Facebook
    // We do NOT update User.metaAccessToken here

    // Get pages - but DO NOT save them to MetaPage table (Instagram should be independent)
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

    // Fetch and save Instagram accounts WITHOUT saving MetaPage records
    // This keeps Instagram independent from Facebook
    for (const page of pages) {
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
          // Save Instagram account directly without linking to MetaPage
          await prisma.instagramAccount.upsert({
            where: { igAccountId: igAccount.id },
            create: {
              metaPageId: null, // Not linked to any MetaPage - independent Instagram
              igAccountId: igAccount.id,
              username: igAccount.username,
              name: igAccount.name,
              userId,
              profilePicUrl: igAccount.profile_picture_url,
              followersCount: igAccount.followers_count,
              // Store Instagram-specific tokens (independent from Facebook)
              metaUserId,
              metaAccessToken: longLivedToken,
              metaTokenExpiry: tokenExpiry,
              // Store page info for messaging (required by Meta API)
              pageId: page.id,
              pageAccessToken: page.access_token,
            },
            update: {
              metaPageId: null, // Keep it independent
              username: igAccount.username,
              name: igAccount.name,
              profilePicUrl: igAccount.profile_picture_url,
              followersCount: igAccount.followers_count,
              // Update Instagram-specific tokens on reconnect
              metaUserId,
              metaAccessToken: longLivedToken,
              metaTokenExpiry: tokenExpiry,
              // Update page info for messaging
              pageId: page.id,
              pageAccessToken: page.access_token,
            },
          });
          console.log(
            `✅ Instagram account @${igAccount.username} connected (independent)`,
          );
        }
      } catch (igErr: any) {
        console.log(
          `No Instagram account for page ${page.name}:`,
          igErr.response?.data?.error?.message || igErr.message,
        );
      }

      // Still subscribe to webhook for messaging (needed for Instagram API)
      await subscribePageToWebHook(page.id, page.access_token);
    }

    try {
      await subscribeAppToInstagramWebhook();
    } catch (igWebhookErr: any) {
      console.warn(
        "⚠️ Instagram webhook subscription failed:",
        igWebhookErr.response?.data?.error?.message || igWebhookErr.message,
      );
    }

    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?instagram=connected`,
    );
  } catch (err: any) {
    console.error(
      "Instagram callback error:",
      err.response?.data ?? err.message,
    );
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

    // ============================================
    // PERMISSION DEBUGGING - Check what permissions were actually granted
    // ============================================
    console.log("🔍 Checking granted permissions...");
    let grantedPermissions: string[] = [];
    let declinedPermissions: string[] = [];

    try {
      const permissionsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/permissions`,
        {
          params: { access_token: longLivedToken },
        },
      );

      const allPermissions = permissionsRes.data.data || [];
      grantedPermissions = allPermissions
        .filter((p: any) => p.status === "granted")
        .map((p: any) => p.permission);
      declinedPermissions = allPermissions
        .filter((p: any) => p.status === "declined")
        .map((p: any) => p.permission);

      console.log("✅ Granted permissions:", grantedPermissions.join(", "));
      if (declinedPermissions.length > 0) {
        console.warn(
          "⚠️ Declined permissions:",
          declinedPermissions.join(", "),
        );
      }
    } catch (permErr: any) {
      console.warn(
        "⚠️ Could not check permissions:",
        permErr.response?.data?.error?.message || permErr.message,
      );
    }

    const hasBusinessManagement = grantedPermissions.includes(
      "business_management",
    );
    const hasWhatsappManagement = grantedPermissions.includes(
      "whatsapp_business_management",
    );

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

    // ============================================
    // FETCH WHATSAPP BUSINESS ACCOUNTS
    // Try multiple methods based on available permissions
    // ============================================
    console.log("🔄 Fetching WhatsApp Business Accounts...");

    // Track connection status for user feedback
    let totalWABAsFound = 0;
    let totalPhonesSaved = 0;
    let wabaDiscoveryMethod = "";
    const connectionWarnings: string[] = [];

    // Helper function to process a WABA (get phone numbers and save)
    const processWABA = async (
      waba: { id: string; name?: string },
      accessToken: string,
    ) => {
      try {
        // Get phone numbers for this WABA
        const phonesRes = await axios.get(
          `https://graph.facebook.com/v19.0/${waba.id}/phone_numbers`,
          {
            params: {
              access_token: accessToken,
              fields: "id,display_phone_number,verified_name,quality_rating",
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
              systemUserToken: accessToken,
            },
            update: {
              businessAccountId: waba.id,
              phoneNumber: phone.display_phone_number,
              displayName: phone.verified_name || waba.name,
              systemUserToken: accessToken,
            },
          });
          console.log(
            `✅ WhatsApp account saved: ${phone.verified_name} (${phone.display_phone_number})`,
          );
          totalPhonesSaved++;
        }

        // Subscribe this WABA to webhooks individually
        try {
          console.log(
            `🔄 Subscribing WABA ${waba.name || waba.id} to webhooks...`,
          );
          await subscribeWabaToWebhook(waba.id, accessToken);
          console.log(
            `✅ WABA ${waba.name || waba.id} webhook subscription completed`,
          );
        } catch (wabaSubErr: any) {
          console.warn(
            `⚠️ WABA webhook subscription failed for ${waba.id}:`,
            wabaSubErr.response?.data?.error?.message || wabaSubErr.message,
          );
          connectionWarnings.push(
            `Webhook subscription failed for ${waba.name || waba.id}`,
          );
        }

        return phones.length;
      } catch (phoneErr: any) {
        console.warn(
          `⚠️ Could not fetch phone numbers for WABA ${waba.id}:`,
          phoneErr.response?.data?.error?.message || phoneErr.message,
        );
        return 0;
      }
    };

    // METHOD 0: Use known WABA ID from config (most reliable)
    if (WHATSAPP_BUSINESS_ACCOUNT_ID) {
      console.log("📍 Method 0: Using known WABA ID from config");
      wabaDiscoveryMethod = "config_waba_id";

      try {
        // First, get the WABA details
        const wabaRes = await axios.get(
          `https://graph.facebook.com/v19.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}`,
          {
            params: {
              access_token: longLivedToken,
              fields: "id,name,timezone_id",
            },
          },
        );

        const waba = wabaRes.data;
        console.log(`✅ Found WABA from config: ${waba.name || waba.id}`);
        totalWABAsFound = 1;

        // Process this WABA to get phone numbers
        await processWABA(waba, longLivedToken);
      } catch (wabaErr: any) {
        console.warn(
          "⚠️ Could not fetch WABA from config ID:",
          wabaErr.response?.data?.error?.message || wabaErr.message,
        );
        // Continue to other methods if this fails
        totalWABAsFound = 0;
      }
    }

    // METHOD 1: Try via Business Manager (requires business_management permission)
    if (hasBusinessManagement) {
      console.log(
        "📍 Method 1: Fetching via Business Manager (business_management granted)",
      );
      wabaDiscoveryMethod = "business_manager";

      try {
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
            totalWABAsFound += wabas.length;

            for (const waba of wabas) {
              await processWABA(waba, longLivedToken);
            }
          } catch (wabaErr: any) {
            console.warn(
              `⚠️ Could not fetch WABAs for business ${business.name}:`,
              wabaErr.response?.data?.error?.message || wabaErr.message,
            );
          }
        }
      } catch (bizErr: any) {
        console.warn(
          "⚠️ Could not fetch businesses:",
          bizErr.response?.data?.error?.message || bizErr.message,
        );
      }
    } else {
      console.log(
        "⚠️ business_management permission not granted, skipping Business Manager method",
      );
    }

    // METHOD 2: Use whatsapp_business_management permission directly
    // Query WABAs that the user has been granted access to
    if (totalWABAsFound === 0 && hasWhatsappManagement) {
      console.log(
        "📍 Method 2: Querying WABAs with whatsapp_business_management permission",
      );
      wabaDiscoveryMethod = "waba_direct";

      try {
        // Try to get WABAs directly - this works if user has been granted access to specific WABAs
        // First, let's try the token debug info to see what resources are accessible
        const debugRes = await axios.get(
          `https://graph.facebook.com/v19.0/debug_token`,
          {
            params: {
              input_token: longLivedToken,
              access_token: `${META_APP_ID}|${META_APP_SECRET}`,
            },
          },
        );

        const grantedPermissions = debugRes.data?.data?.permissions || [];
        console.log(
          "🔍 Token debug - granted permissions:",
          grantedPermissions.map((p: any) => p.permission).join(", "),
        );

        // Try to query for WABAs using the businesses the token has access to
        // The issue is that /me/businesses returns businesses but we need business-level permission
        // Let's try a different approach - query for WABAs directly if we know the ID
      } catch (debugErr: any) {
        console.warn(
          "⚠️ Token debug failed:",
          debugErr.response?.data?.error?.message || debugErr.message,
        );
      }

      // Alternative: Try querying WABAs via the user's business manager directly
      try {
        // This endpoint might work if the user has WABAs in their Business Manager
        const wabaDirectRes = await axios.get(
          `https://graph.facebook.com/v19.0/me`,
          {
            params: {
              access_token: longLivedToken,
              fields: "id,name",
            },
          },
        );

        // Now try to get businesses with more specific WABA fields
        const bizWithWaba = await axios.get(
          `https://graph.facebook.com/v19.0/me/businesses`,
          {
            params: {
              access_token: longLivedToken,
              fields:
                "id,name,owned_whatsapp_business_accounts{id,name,timezone_id}",
            },
          },
        );

        const businesses = bizWithWaba.data.data || [];
        for (const business of businesses) {
          if (business.owned_whatsapp_business_accounts) {
            const wabas = business.owned_whatsapp_business_accounts.data || [];
            console.log(
              `Found ${wabas.length} WABAs in ${business.name} via expanded query`,
            );
            totalWABAsFound += wabas.length;

            for (const waba of wabas) {
              await processWABA(waba, longLivedToken);
            }
          }
        }
      } catch (expandedErr: any) {
        console.warn(
          "⚠️ Expanded WABA query failed:",
          expandedErr.response?.data?.error?.message || expandedErr.message,
        );
      }
    }

    // METHOD 3: Try direct /me endpoint with WABA fields
    if (totalWABAsFound === 0 && hasWhatsappManagement) {
      console.log("📍 Method 3: Trying direct /me endpoint with WABA fields");
      wabaDiscoveryMethod = "me_endpoint";

      try {
        const meWabaRes = await axios.get(
          `https://graph.facebook.com/v19.0/me`,
          {
            params: {
              access_token: longLivedToken,
              fields:
                "id,name,owned_whatsapp_business_accounts{id,name,timezone_id}",
            },
          },
        );

        const wabas =
          meWabaRes.data.owned_whatsapp_business_accounts?.data || [];
        console.log(
          `Found ${wabas.length} WhatsApp Business Accounts via /me endpoint`,
        );
        totalWABAsFound += wabas.length;

        for (const waba of wabas) {
          await processWABA(waba, longLivedToken);
        }
      } catch (directErr: any) {
        console.warn(
          "⚠️ Direct /me WABA query failed:",
          directErr.response?.data?.error?.message || directErr.message,
        );
      }
    }

    // METHOD 4: Last resort - Try to get WABAs via user's granted accounts (pages)
    if (totalWABAsFound === 0) {
      console.log(
        "📍 Method 4: Trying to find WABAs via user's granted pages/accounts",
      );
      wabaDiscoveryMethod = "user_accounts";

      try {
        // This endpoint returns pages the user has access to
        const accountsRes = await axios.get(
          `https://graph.facebook.com/v19.0/me/accounts`,
          {
            params: {
              access_token: longLivedToken,
              fields: "id,name,category,access_token",
            },
          },
        );

        const accounts = accountsRes.data.data || [];
        console.log(`Found ${accounts.length} accounts (pages)`);

        // For each page, try to see if it has WhatsApp integration
        for (const account of accounts) {
          try {
            // Check if this page has any associated WABAs
            const checkWaba = await axios.get(
              `https://graph.facebook.com/v19.0/${account.id}`,
              {
                params: {
                  access_token: longLivedToken,
                  fields: "id,name,owned_whatsapp_business_accounts",
                },
              },
            );

            if (checkWaba.data.owned_whatsapp_business_accounts) {
              const wabas =
                checkWaba.data.owned_whatsapp_business_accounts.data || [];
              totalWABAsFound += wabas.length;

              for (const waba of wabas) {
                await processWABA(waba, longLivedToken);
              }
            }
          } catch (accErr: any) {
            // Silently skip accounts that don't have WABA access
          }
        }
      } catch (accErr: any) {
        console.warn(
          "⚠️ User accounts query failed:",
          accErr.response?.data?.error?.message || accErr.message,
        );
      }
    }

    // METHOD 5: If still no WABAs found, try to use the token to query known WABA patterns
    if (totalWABAsFound === 0 && hasWhatsappManagement) {
      console.log(
        "📍 Method 5: Trying to find WABAs via commerce merchant settings",
      );
      wabaDiscoveryMethod = "commerce_settings";

      try {
        // Some WABAs are accessible via commerce settings
        const commerceRes = await axios.get(
          `https://graph.facebook.com/v19.0/me`,
          {
            params: {
              access_token: longLivedToken,
              fields:
                "id,name,commerce_merchant_settings{owned_whatsapp_business_accounts}",
            },
          },
        );

        const merchantSettings = commerceRes.data.commerce_merchant_settings;
        if (merchantSettings?.owned_whatsapp_business_accounts) {
          const wabas =
            merchantSettings.owned_whatsapp_business_accounts.data || [];
          console.log(`Found ${wabas.length} WABAs via commerce settings`);
          totalWABAsFound += wabas.length;

          for (const waba of wabas) {
            await processWABA(waba, longLivedToken);
          }
        }
      } catch (commerceErr: any) {
        console.warn(
          "⚠️ Commerce settings query failed:",
          commerceErr.response?.data?.error?.message || commerceErr.message,
        );
      }
    }

    // Log final status
    console.log(`📊 WABA Discovery Summary:`);
    console.log(`   - Method used: ${wabaDiscoveryMethod}`);
    console.log(`   - WABAs found: ${totalWABAsFound}`);
    console.log(`   - Phone numbers saved: ${totalPhonesSaved}`);
    if (connectionWarnings.length > 0) {
      console.log(`   - Warnings: ${connectionWarnings.join(", ")}`);
    }

    // Subscribe app to WhatsApp webhooks (non-blocking - may fail due to permissions)
    // This is optional since WABA-level subscriptions should work independently
    try {
      console.log("🔄 Subscribing app to WhatsApp webhooks (optional)...");
      await subscribeAppToWhatsAppWebhook();
      console.log("✅ App-level WhatsApp webhook subscription completed");
    } catch (waWebhookErr: any) {
      const errorMsg =
        waWebhookErr.response?.data?.error?.error_user_msg ||
        waWebhookErr.response?.data?.error?.message ||
        waWebhookErr.message;
      console.warn(
        "⚠️ App-level webhook subscription failed (non-critical):",
        errorMsg,
      );
      console.warn(
        "⚠️ Relying on WABA-level subscriptions for webhook delivery",
      );
      // Don't add to warnings since this is expected and WABA-level should work
    }

    // Build redirect URL with status info
    let redirectUrl = `${process.env.ALLOWED_ORIGINS}/dashboard?whatsapp=connected`;
    if (totalPhonesSaved === 0) {
      redirectUrl = `${process.env.ALLOWED_ORIGINS}/dashboard?whatsapp=partial&message=no_accounts_found`;
    }
    if (!hasBusinessManagement) {
      redirectUrl += "&limited_permissions=true";
    }

    return res.redirect(redirectUrl);
  } catch (err: any) {
    console.error("WhatsApp callback error:", err.response?.data ?? err.message);
    return res.redirect(
      `${process.env.ALLOWED_ORIGINS}/dashboard?error=oauth_failed`,
    );
  }
});

export default oauthRouter;
