import { Request, Response } from "express";

export const verifyWebHook =
  (label: string) => (req: Request, res: Response) => {
    const VERIFY_TOKEN = process.env.NGROK_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log(`WEBHOOK VERIFIED for ${label}`);
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  };
