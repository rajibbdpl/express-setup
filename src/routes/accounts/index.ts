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

    const [metaPages, whatsappAccounts, tiktokAccounts] = await Promise.all([
      prisma.metaPage.findMany({
        where: { userId },
        include: {
          instagramAccount: true,
        },
      }),
      prisma.whatsAppAccount.findMany({
        where: { userId },
      }),
      prisma.tikTokAccount.findMany({
        where: { userId },
      }),
    ]);

    console.log("Meta pages found:", metaPages.length);
    console.log("Instagram accounts found:", metaPages.filter(p => p.instagramAccount).length);
    console.log("TikTok accounts found:", tiktokAccounts.length);

    const connectedAccounts = {
      facebook: metaPages.map((page) => ({
        id: page.id,
        pageId: page.pageId,
        name: page.pageName,
        category: page.pageCategory,
        pictureUrl: page.pictureUrl,
      })),
      instagram: metaPages
        .filter((page) => page.instagramAccount)
        .map((page) => ({
          id: page.instagramAccount!.id,
          igAccountId: page.instagramAccount!.igAccountId,
          username: page.instagramAccount!.username,
          name: page.instagramAccount!.name,
          profilePicUrl: page.instagramAccount!.profilePicUrl,
          followersCount: page.instagramAccount!.followersCount,
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

accountsRouter.post("/sync-instagram", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.metaAccessToken) {
      return res.status(400).json({ error: "No Meta account connected" });
    }

    const metaPages = await prisma.metaPage.findMany({
      where: { userId },
    });

    if (metaPages.length === 0) {
      return res.status(400).json({ error: "No Facebook pages found" });
    }

    let syncedCount = 0;

    for (const page of metaPages) {
      try {
        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${page.pageId}`,
          {
            params: {
              fields: "instagram_business_account{id,username,name,profile_picture_url,followers_count}",
              access_token: page.pageAccessToken,
            },
          }
        );

        const igAccount = igRes.data.instagram_business_account;
        console.log(`Page ${page.pageName} Instagram response:`, JSON.stringify(igRes.data, null, 2));
        
        if (igAccount) {
          await prisma.instagramAccount.upsert({
            where: { igAccountId: igAccount.id },
            create: {
              metaPageId: page.id,
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
          console.log(`Instagram account @${igAccount.username} synced for page ${page.pageName}`);
          syncedCount++;
        } else {
          console.log(`No Instagram account linked to page ${page.pageName}`);
        }
      } catch (igErr: any) {
        console.error(`Error fetching Instagram for page ${page.pageName}:`, igErr.response?.data || igErr.message);
      }
    }

    res.json({
      status: "success",
      data: { syncedCount, totalPages: metaPages.length },
      errors: null,
    });
  } catch (error) {
    console.error("Error syncing Instagram accounts:", error);
    res.status(500).json({
      status: "error",
      data: null,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to sync Instagram accounts" }],
    });
  }
});

export default accountsRouter;
