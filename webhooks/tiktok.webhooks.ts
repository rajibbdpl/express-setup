import { raw, Router } from "express";
import crypto from "crypto";

const router = Router();

// TikTok sends a GET challenge to verify your endpoint
router.get("/tiktok", (req, res) => {
  const challenge = req.query.challenge;
  res.json({ challenge }); // Echo back to verify
});

//tiktok sends post with events
router.post("/tiktok", raw({ type: "application/json" }), (req, res) => {
  //verify signature
  const signature = req.headers["x-tiktok-signature"];
  const hmac = crypto
    .createHmac("sha256", process.env.TIKTOK_WEBHOOK_SECRET!)
    .update(req.body)
    .digest("hex");

  if (signature !== `sha256=${hmac}`) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = JSON.parse(req.body);
  const { event, data } = payload;

  console.log("TikTok Webhook Event:", event, data);

  //switch to handle different events
});
