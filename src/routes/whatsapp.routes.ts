import { Router } from "express";
import {
  sendWhatsappMessage,
  handleWhatsappWebhook,
} from "../controllers/whatsapp.controllers";
const router = Router();

// POST webhook — receives incoming messages from WhatsApp
router.post("/", handleWhatsappWebhook);

// POST send a message
router.post("/send", sendWhatsappMessage);

export default router;
