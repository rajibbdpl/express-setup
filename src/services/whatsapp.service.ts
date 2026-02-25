import axios from "axios";

const WHATSAPP_API_URL = "https://graph.facebook.com/v19.0";
const PHONE_NUMBER_ID = process.env.WHATS_APP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const whatsappApi = axios.create({
  baseURL: `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export const sendTextMessage = async (to: string, message: string) => {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to, // e.g. "9779800000000" (with country code, no +)
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  };

  const res = await whatsappApi.post("/messages", payload);

  return res.data;
};

//send template message, i.e for first contact
export const sendTemplateMessage = async (
  to: string,
  templateName: string,
  langCode = "en_US",
) => {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName, // e.g. "hello_world" (default Meta template)
      language: { code: langCode },
    },
  };

  const res = await whatsappApi.post("/messages", payload);
  return res.data;
};

export const markAsRead = async (messageId: string) => {
  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };

  const res = await whatsappApi.post("/messages", payload);
  return res.data;
};

export const sendImageMessage = async (
  to: string,
  imageUrl: string,
  caption?: string,
) => {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption: caption || "",
    },
  };

  const res = await whatsappApi.post("/messages", payload);
  return res.data;
};


