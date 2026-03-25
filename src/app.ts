import express from "express";
import "dotenv/config";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.middleware";
import oauthRouter from "./routes/oauth.routes";
import tiktokRouter from "./routes/tiktok.routes";
import metaWebHookRouter from "./webhooks/meta.webhook";
import tiktokWebhookRouter from "./webhooks/tiktok.webhooks";
import accountsRouter from "./routes/accounts";
import facebookRouter from "./routes/facebook.routes";
import instagramRouter from "./routes/instagram.routes";
import messagesRouter from "./routes/messages.routes";
import webhookDiagnosticsRouter from "./routes/webhook-diagnostics.routes";
import whatsappRouter from "./routes/whatsapp.routes";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";

const app = express();

//trust the first proxy, clients original IP even if comming from cloudflare
app.set("trust proxy", 1);

//this is used to set various HTTP headers and implement security in express
app.use(helmet());

// allow the requests from these origins to be processed
app.use(
  cors({ origin: process.env.ALLOWED_ORIGINS?.split(","), credentials: true }),
);

app.use("/webhook", metaWebHookRouter);
app.use("/api/tiktok", tiktokWebhookRouter);

//for every req, if body contains JSON, convert it into a js object and add to req.body
app.use(express.json({ limit: "10kb" }));

//used to parse url-encoded payload i.e html forms
app.use(express.urlencoded({ extended: true }));

//converts the cookies into objects and attches to req.cookies
app.use(cookieParser());

//this is used for logging the HTTP request
app.use(morgan("dev"));

//this is used to compress the api response sent to the user.
app.use(
  compression({
    level: 6, //level (1-9)
    threshold: 1024, //only compress responses above 1kb
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false; //skip for the req with these headers
      }
      return compression.filter(req, res); // default filter
    },
  }),
);

app.use("/api/auth", toNodeHandler(auth));

app.use("/oauth", oauthRouter);
app.use("/auth", oauthRouter);
app.use("/api/v1/tiktok", tiktokRouter);
app.use("/api/v1/accounts", accountsRouter);
app.use("/api/v1/facebook", facebookRouter);
app.use("/api/v1/instagram", instagramRouter);
app.use("/api/v1/messages", messagesRouter);
app.use("/api/v1/webhooks", webhookDiagnosticsRouter);
app.use("/api/v1/whatsapp", whatsappRouter);

//global error handler (must be last)
app.use(errorMiddleware);

export default app;
