import { Router, Request } from "express";
import axios from "axios";

const getTokens = (req: Request) => req.app.locals.tiktokTokens; // Replace with DB lookup

const router = Router();

router.get("/webhook", (req, res) => {
  res.send(req.query.challenge); // verification
});

router.post("/webhook", async (req, res) => {
  const event = req.body;
  // handle event
  res.status(200).send("ok");
});

router.post("/post/init", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens)
    return res.status(401).json({ error: "Not authenticated with TikTok" });
  const { access_token } = tokens;
  const { caption, video_size, chunk_size, total_chunk_count } = req.body;

  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      {
        post_info: {
          title: caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_comment: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size,
          chunk_size,
          total_chunk_count,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      },
    );
    res.json(response.data); // Returns upload_url and publish_id
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

//get commensts for a video
router.get("/comments/:videoId", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens)
    return res.status(401).json({ error: "Not authenticated with TikTok" });
  const { access_token } = tokens;
  try {
    const response = await axios.get(
      `https://open.tiktokapis.com/v2/comment/list/`,
      {
        params: {
          video_id: req.params.videoId,
          fields: "id,text,like_count,reply_count,create_time,user",
        },
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

//get conversations

router.get("/messages/conversations", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens)
    return res.status(401).json({ error: "Not authenticated with TikTok" });
  const { access_token } = tokens;
  try {
    const response = await axios.get(
      "https://open.tiktokapis.com/v2/message/conversation/list/",
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Send a message reply
router.post("/messages/reply", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens)
    return res.status(401).json({ error: "Not authenticated with TikTok" });
  const { access_token } = tokens;
  const { conversation_id, message } = req.body;
  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/message/send/",
      { conversation_id, message: { message_type: "TEXT", content: message } },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      },
    );
    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
