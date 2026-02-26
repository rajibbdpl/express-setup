import { Router } from "express";
import axios from "axios";

const authRouter = Router();

//redirect user to tiktok oauth
authRouter.get("/tiktok", (req, res) => {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: "user.info.basic,video.list,video.upload",
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state: "random_state_string", // Use a real random value + session in production
  });

  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
});

// handle callback and exchange code for tokens
authRouter.get("/tiktok/callback", async (req, res) => {
  const { code, error, scopes } = req.query;
  console.log("🚀 ~ error:", error);
  if (error) {
    console.error("TikTok returned error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/connect?error=${error}`);
  }

  if (!code) {
    console.error("No code in callback");
    return res.status(400).json({ error: "Missing code" });
  }

  console.log("Code received:", code);
  console.log("Scopes granted:", scopes);
  const body = {
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
  };
  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token, refresh_token, open_id } = response.data;

    //save tokens in database associated with user

    req.app.locals.tiktokTokens = { access_token, refresh_token, open_id };

    res.redirect("http://localhost:3000/tiktok?tiktok=connected");
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "OAuth failed" });
  }
});

authRouter.post("/tiktok/logout", (req, res) => {
  req.app.locals.tiktokTokens = null;
  res.json({ success: false });
});

export default authRouter;
