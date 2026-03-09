import axios from "axios";
import { prisma } from "@/config/database";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000);
}

export async function refreshTikTokToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "tiktok" },
  });

  if (!account?.refreshToken) {
    throw new Error("No TikTok refresh token found");
  }

  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + (expires_in ?? 86400) * 1000),
      },
    });

    console.log(`✅ TikTok token refreshed for user: ${userId}`);
    return access_token;
  } catch (error: any) {
    console.error("Failed to refresh TikTok token:", error.response?.data || error.message);
    throw new Error("Failed to refresh TikTok token");
  }
}

export async function ensureValidToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "tiktok" },
  });

  if (!account?.accessToken) {
    throw new Error("TikTok account not connected");
  }

  if (isTokenExpired(account.accessTokenExpiresAt)) {
    console.log(`🔄 TikTok token expired, refreshing...`);
    return await refreshTikTokToken(userId);
  }

  return account.accessToken;
}

export async function getTikTokConversations(accessToken: string) {
  try {
    const response = await axios.get(`${TIKTOK_API_BASE}/message/conversation/list/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error: any) {
    console.error("Failed to fetch TikTok conversations:", error.response?.data || error.message);
    throw error;
  }
}

export async function getTikTokMessages(
  accessToken: string,
  conversationId: string,
  options?: { limit?: number; cursor?: string }
) {
  try {
    const params: any = { conversation_id: conversationId };
    if (options?.limit) params.limit = options.limit;
    if (options?.cursor) params.cursor = options.cursor;

    const response = await axios.get(`${TIKTOK_API_BASE}/message/list/`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error: any) {
    console.error("Failed to fetch TikTok messages:", error.response?.data || error.message);
    throw error;
  }
}

export async function sendTikTokMessage(
  accessToken: string,
  conversationId: string,
  message: string
) {
  try {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/message/send/`,
      {
        conversation_id: conversationId,
        message: {
          message_type: "TEXT",
          content: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error("Failed to send TikTok message:", error.response?.data || error.message);
    throw error;
  }
}

export async function getTikTokUserProfile(accessToken: string) {
  try {
    const response = await axios.get(`${TIKTOK_API_BASE}/user/info/`, {
      params: { fields: "open_id,union_id,avatar_url,display_name,username" },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error: any) {
    console.error("Failed to fetch TikTok user profile:", error.response?.data || error.message);
    throw error;
  }
}
