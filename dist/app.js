import express from "express";
import "dotenv/config";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { errorMiddleware } from "./middlewares/error.middleware";
const app = express();
const PORT = process.env.PORT || 3000;
//this is used to set various HTTP headers and implement security in express
app.use(helmet());
// allow the requests from these origins to be processed
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(","), credentials: true }));
//trust the first proxy, clients original IP even if comming from cloudflare
app.set("trust proxy", 1);
//use that ip for rate limiting
app.use(rateLimit({
    windowMs: 5 * 60 * 1000, //15 Mins
    max: 100, // limit each IP to 100 request per window
    message: "Too many request from this IP, please try again later.",
}));
//for every req, if body contains JSON, convert it into a js object and add to req.body
app.use(express.json({ limit: "10kb" }));
//used to parse url-encoded payload i.e html forms
app.use(express.urlencoded({ extended: true }));
//converts the cookies into objects and attches to req.cookies
app.use(cookieParser());
//this is used for logging the HTTP request
app.use(morgan("dev"));
//this is used to compress the api response sent to the user.
app.use(compression({
    level: 6, //level (1-9)
    threshold: 1024, //only compress responses above 1kb
    filter: (req, res) => {
        if (req.headers["x-no-compression"]) {
            return false; //skip for the req with these headers
        }
        return compression.filter(req, res); // default filter
    },
}));
//global error handler (must be last)
app.use(errorMiddleware);
export default app;
//# sourceMappingURL=app.js.map