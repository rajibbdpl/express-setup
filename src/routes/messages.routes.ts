import { Router, Request, Response } from "express";
import { prisma } from "@/config/database";
import { auth } from "@/lib/auth";

const messagesRouter = Router();

messagesRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    
    if (!session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [fbPages, igAccounts] = await Promise.all([
      prisma.metaPage.findMany({
        where: { userId: session.user.id },
      }),
      prisma.instagramAccount.findMany({
        where: {
          metaPage: { userId: session.user.id }
        },
      }),
    ]);

    const [fbConversations, igConversations] = await Promise.all([
      fbPages.length > 0 
        ? prisma.facebookConversation.findMany({
            where: { 
              metaPageId: { in: fbPages.map(p => p.id) }
            },
            orderBy: { updatedTime: "desc" },
            include: {
              messages: {
                orderBy: { createdTime: "desc" },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      igAccounts.length > 0
        ? prisma.igConversation.findMany({
            where: { 
              igAccountId: { in: igAccounts.map(a => a.id) }
            },
            orderBy: { updatedAt: "desc" },
            include: {
              messages: {
                orderBy: { timestamp: "desc" },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const unifiedConversations = [
      ...fbConversations.map(conv => ({
        id: conv.id,
        platform: "FACEBOOK" as const,
        participantId: conv.participantId,
        participantName: conv.participantName || conv.participantId,
        snippet: conv.snippet || conv.messages[0]?.text || "",
        updatedAt: conv.updatedTime,
        accountId: conv.metaPageId,
      })),
      ...igConversations.map(conv => ({
        id: conv.id,
        platform: "INSTAGRAM" as const,
        participantId: conv.participantIgId,
        participantName: conv.participantUsername || conv.participantIgId,
        snippet: conv.messages[0]?.text || "",
        updatedAt: conv.updatedAt,
        accountId: conv.igAccountId,
      })),
    ].sort((a, b) => {
      const bTime = b.updatedAt?.getTime() || 0;
      const aTime = a.updatedAt?.getTime() || 0;
      return bTime - aTime;
    });

    res.json({ conversations: unifiedConversations });
  } catch (err) {
    console.error("Fetch unified conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

export default messagesRouter;
