import express from "express";
import "dotenv/config";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.middleware";
import { verifyWebHook } from "./utils/verify-webhook";
import whatsappRoutes from "./routes/whatsapp.routes";
import authRouter from "./routes/auth";
import tiktokRouter from "./routes/tiktok.routes";


const app = express();
app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  next();
});


//trust the first proxy, clients original IP even if comming from cloudflare
app.set("trust proxy", 1);

//this is used to set various HTTP headers and implement security in express
app.use(helmet());

console.log("allowed", process.env.ALLOWED_ORIGINS);
// allow the requests from these origins to be processed
app.use(
  cors({ origin: process.env.ALLOWED_ORIGINS?.split(","), credentials: true }),
);

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

// app.get("/", (req: Request, res: Response) => {
//   try {
//     return res.status(200).json({ message: "Hello demo ai", success: true });
//   } catch (error: unknown) {
//     console.log("🚀 ~ error:", error);
//     res.status(500).json({ message: "Failed to get", success: true });
//   }
// });

app.get("/messenger", verifyWebHook("messenger"));
app.get("/webhook", verifyWebHook("webhook"));
app.get("/facebook", verifyWebHook("facebook"));
app.get("/instagram", verifyWebHook("instagram"));
app.get("/whatsapp", verifyWebHook("whatsapp"));


app.use("/auth", authRouter);
app.use("/api/tiktok", tiktokRouter);


app.use("/whatsapp", whatsappRoutes);

app.get("/auth/instagram/callback", (req, res) => {
  // Here you will handle the code returned by Instagram
  const code = req.query.code;
  res.send("Instagram OAuth code received: " + code);
});

//global error handler (must be last)
app.use(errorMiddleware);

export default app;
