import axios from "axios";

export const subscribePageToWebHook = async (
  pageId: string,
  pageAccessToken: string,
) => {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      {
        subscribed_fields: ["messages", "messaging_postbacks"],
        access_token: pageAccessToken,
      },
    );
    console.log(`Page ${pageId} subscribed:`, res.data);
  } catch (err: any) {
    console.error(
      "Failed to subscribe page:",
      err.response?.data ?? err.message,
    );
  }
};
