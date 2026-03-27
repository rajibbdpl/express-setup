import { Router, Request, Response } from "express";
import { auth } from "@/lib/auth";
import { prisma } from "@/config/database";
import axios from "axios";

const accountsRouter = Router();

accountsRouter.get("/connected", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    const [metaPages, instagramAccounts, whatsappAccounts, tiktokAccounts] = await Promise.all([
      prisma.metaPage.findMany({
        where: { userId },
      }),
      prisma.instagramAccount.findMany({
        where: { userId },
      }),
      prisma.whatsAppAccount.findMany({
        where: { userId },
      }),
      prisma.tikTokAccount.findMany({
        where: { userId },
      }),
    ]);

    console.log("Meta pages found:", metaPages.length);
    console.log("Instagram accounts found:", instagramAccounts.length);
    console.log("TikTok accounts found:", tiktokAccounts.length);

    const connectedAccounts = {
      facebook: metaPages.map((page) => ({
        id: page.id,
        pageId: page.pageId,
        name: page.pageName,
        category: page.pageCategory,
        pictureUrl: page.pictureUrl,
      })),
      instagram: instagramAccounts.map((ig) => ({
        id: ig.id,
        igAccountId: ig.igAccountId,
        username: ig.username,
        name: ig.name,
        profilePicUrl: ig.profilePicUrl,
        followersCount: ig.followersCount,
      })),
      whatsapp: whatsappAccounts.map((wa) => ({
        id: wa.id,
        phoneNumberId: wa.phoneNumberId,
        phoneNumber: wa.phoneNumber,
        displayName: wa.displayName,
      })),
      tiktok: tiktokAccounts.length > 0
        ? {
            id: tiktokAccounts[0].id,
            openId: tiktokAccounts[0].openId,
            username: tiktokAccounts[0].username,
            displayName: tiktokAccounts[0].displayName,
            profileImageUrl: tiktokAccounts[0].profileImageUrl,
          }
        : null,
    };

    res.json({
      status: "success",
      data: connectedAccounts,
      errors: null,
    });
  } catch (error) {
    console.error("Error fetching connected accounts:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to fetch connected accounts" }],
    });
  }
});


// ============================================
// DISCONNECT ENDPOINTS
// ============================================

// Disconnect Facebook - Deletes all MetaPages for the user
// Disconnect Facebook - clears Meta tokens and deletes MetaPages
// Instagram accounts survive (metaPageId set to null via SetNull cascade)
accountsRouter.delete("/facebook", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });

    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    // Delete MetaPages - InstagramAccounts will have metaPageId set to NULL (not deleted)
    const result = await prisma.metaPage.deleteMany({
      where: { userId },
    });

    // Clear user-level Meta tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        metaAccessToken: null,
        metaUserId: null,
        metaTokenExpiry: null,
      },
    });

    res.json({
      status: "success",
      data: { deletedCount: result.count },
      errors: null,
    });
  } catch (error) {
    console.error("Error disconnecting Facebook:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to disconnect Facebook" }],
    });
  }
});

// Disconnect Instagram - deletes InstagramAccounts directly via userId
accountsRouter.delete("/instagram", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });

    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    // Delete directly by userId — no need to look up MetaPage IDs
    const result = await prisma.instagramAccount.deleteMany({
      where: { userId },
    });

    res.json({
      status: "success",
      data: { deletedCount: result.count },
      errors: null,
    });
  } catch (error) {
    console.error("Error disconnecting Instagram:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to disconnect Instagram" }],
    });
  }
});

// Disconnect WhatsApp - Deletes all WhatsAppAccounts for the user
accountsRouter.delete("/whatsapp", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    // Delete all WhatsAppAccounts for this user (cascade will delete conversations, messages)
    const result = await prisma.whatsAppAccount.deleteMany({
      where: { userId },
    });

    res.json({
      status: "success",
      data: { deletedCount: result.count },
      errors: null,
    });
  } catch (error) {
    console.error("Error disconnecting WhatsApp:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to disconnect WhatsApp" }],
    });
  }
});

// Disconnect TikTok - Deletes TikTokAccount for the user
accountsRouter.delete("/tiktok", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    // Delete TikTokAccount (cascade will delete conversations, messages)
    const result = await prisma.tikTokAccount.deleteMany({
      where: { userId },
    });

    // Also delete the Account record with OAuth tokens
    await prisma.account.deleteMany({
      where: { userId, providerId: "tiktok" },
    });

    res.json({
      status: "success",
      data: { deletedCount: result.count },
      errors: null,
    });
  } catch (error) {
    console.error("Error disconnecting TikTok:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to disconnect TikTok" }],
    });
  }
});

export default accountsRouter;
