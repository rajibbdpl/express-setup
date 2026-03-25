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

export const subscribeAppToWhatsAppWebhook = async () => {
  try {
    const META_APP_ID = process.env.META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
    const WEBHOOK_URL = process.env.NGROK_LINK || process.env.ALLOWED_ORIGINS;

    if (!META_APP_ID || !META_APP_SECRET || !VERIFY_TOKEN || !WEBHOOK_URL) {
      throw new Error("Missing required environment variables for WhatsApp webhook subscription");
    }

    console.log("🔄 Getting Facebook App access token for WhatsApp webhooks...");
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

    console.log("🔄 Subscribing app to WhatsApp Business webhooks...");
    console.log(`📍 Callback URL: ${WEBHOOK_URL}/webhook/meta`);
    
    const subscribeRes = await axios.post(
      `https://graph.facebook.com/v19.0/${META_APP_ID}/subscriptions`,
      {
        object: 'whatsapp_business_account',
        callback_url: `${WEBHOOK_URL}/webhook/meta`,
        verify_token: VERIFY_TOKEN,
        // Only subscribe to messages field - message_status may require additional permissions
        fields: 'messages',
      },
      {
        params: { access_token: appAccessToken },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log('✅ WhatsApp webhook subscribed successfully:', subscribeRes.data);
    return subscribeRes.data;
  } catch (err: any) {
    const errorData = err.response?.data?.error;
    
    // Check for specific permission-related errors
    if (errorData?.error_subcode === 1929002) {
      // Permission error - some fields couldn't be subscribed
      console.warn('⚠️ WhatsApp webhook: Some fields require additional app permissions');
      console.warn('⚠️ WABA-level subscriptions will be used for webhook delivery');
      console.warn('ℹ️ To fix: Submit your app for App Review to get whatsapp_business_management permission');
      // Don't throw - this is expected for apps without advanced permissions
      return { success: false, reason: 'permission_error', message: errorData?.error_user_msg };
    }
    
    if (errorData?.code === 1 && errorData?.message?.includes('already subscribed')) {
      // Already subscribed - this is fine
      console.log('✅ App already subscribed to WhatsApp webhooks');
      return { success: true, alreadySubscribed: true };
    }
    
    console.error('❌ WhatsApp webhook subscription failed:', 
      err.response?.data || err.message);
    throw err;
  }
};

/**
 * Subscribe a specific WhatsApp Business Account (WABA) to webhooks
 * This is required for each WABA to receive webhook events
 * @param wabaId - The WhatsApp Business Account ID
 * @param accessToken - The access token with appropriate permissions
 */
export const subscribeWabaToWebhook = async (
  wabaId: string, 
  accessToken: string
): Promise<any> => {
  try {
    console.log(`🔄 Subscribing WABA ${wabaId} to webhooks...`);
    
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`,
      {},
      {
        params: {
          access_token: accessToken,
        },
      }
    );
    
    console.log(`✅ WABA ${wabaId} subscribed to webhooks:`, res.data);
    return res.data;
  } catch (err: any) {
    console.error(
      `❌ Failed to subscribe WABA ${wabaId}:`,
      err.response?.data ?? err.message,
    );
    // Don't throw - allow other WABAs to be processed
    return null;
  }
};
