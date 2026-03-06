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
    console.log(`🔍 Attempting to fetch name for user ${senderId} via Graph API...`);
    
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
    const name = userData?.name || `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() || null;
    
    if (name) {
      console.log(`✅ Successfully fetched name for ${senderId}: ${name}`);
    } else {
      console.log(`⚠️ API returned empty name for ${senderId}`);
    }
    
    return name;
  } catch (error: any) {
    const errorData = error.response?.data?.error;
    console.error(
      `❌ Failed to fetch sender name for ${senderId}:`,
      {
        message: errorData?.message,
        type: errorData?.type,
        code: errorData?.code,
        subcode: errorData?.error_subcode,
        fbtrace_id: errorData?.fbtrace_id,
      }
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

export const subscribeAppToFacebookPageWebhook = async () => {
  try {
    const META_APP_ID = process.env.META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
    const WEBHOOK_URL = process.env.NGROK_LINK || process.env.ALLOWED_ORIGINS;

    if (!META_APP_ID || !META_APP_SECRET || !VERIFY_TOKEN || !WEBHOOK_URL) {
      throw new Error("Missing required environment variables for Facebook Page webhook subscription");
    }

    console.log("🔄 Getting Facebook App access token for Page webhooks...");
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

    console.log("🔄 Subscribing app to Facebook Page webhooks...");
    console.log(`📍 Callback URL: ${WEBHOOK_URL}/webhook/meta`);
    
    const subscribeRes = await axios.post(
      `https://graph.facebook.com/v19.0/${META_APP_ID}/subscriptions`,
      {
        object: 'page',
        callback_url: `${WEBHOOK_URL}/webhook/meta`,
        verify_token: VERIFY_TOKEN,
        fields: 'messages,messaging_postbacks,message_echoes',
      },
      {
        params: { access_token: appAccessToken },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log('✅ Facebook Page webhook subscribed successfully:', subscribeRes.data);
    return subscribeRes.data;
  } catch (err: any) {
    console.error('❌ Facebook Page webhook subscription failed:', 
      err.response?.data || err.message);
    throw err;
  }
};
