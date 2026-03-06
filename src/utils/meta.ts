import axios from "axios";

export const subscribePageToWebHook = async (
  pageId: string,
  pageAccessToken: string,
) => {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      {
        subscribed_fields: [
          "messages",
          "messaging_postbacks",
          "message_echoes",
        ],
        access_token: pageAccessToken,
      },
    );
    console.log(`✅ Page ${pageId} subscribed to Facebook webhooks:`, res.data);
  } catch (err: any) {
    console.error(
      "❌ Failed to subscribe page:",
      err.response?.data ?? err.message,
    );
  }
};

export const getSenderName = async (
  senderId: string,
  pageId: string,
  pageAccessToken: string,
): Promise<string | null> => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${senderId}`,
      {
        params: {
          fields: "name,first_name,last_name",
          access_token: pageAccessToken,
        },
      },
    );

    const userData = response.data;
    return userData?.name || `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() || null;
  } catch (error: any) {
    console.error(
      "Failed to fetch sender name via Graph API:",
      error.response?.data ?? error.message,
    );
    return null;
  }
};

export const subscribeAppToInstagramWebhook = async () => {
  try {
    const META_APP_ID = process.env.META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
    const WEBHOOK_URL = process.env.NGROK_LINK;

    if (!META_APP_ID || !META_APP_SECRET || !VERIFY_TOKEN || !WEBHOOK_URL) {
      throw new Error("Missing required environment variables for Instagram webhook subscription");
    }

    console.log("🔄 Getting Facebook App access token...");
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
    console.log("✅ App access token obtained");

    console.log("🔄 Subscribing app to Instagram webhooks...");
    console.log(`📍 Callback URL: ${WEBHOOK_URL}/webhook/meta`);
    
    const subscribeRes = await axios.post(
      `https://graph.facebook.com/v19.0/${META_APP_ID}/subscriptions`,
      {
        object: 'instagram',
        callback_url: `${WEBHOOK_URL}/webhook/meta`,
        verify_token: VERIFY_TOKEN,
        fields: 'messages,messaging_postbacks',
      },
      {
        params: { access_token: appAccessToken },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log('✅ Instagram webhook subscribed successfully:', subscribeRes.data);
    return subscribeRes.data;
  } catch (err: any) {
    console.error('❌ Instagram webhook subscription failed:', 
      err.response?.data || err.message);
    throw err;
  }
};
