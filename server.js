import dotenv from "dotenv";
dotenv.config();
import dns from "node:dns";

import express from "express";
import compression from "compression";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

// Force Node.js DNS to use Google DNS
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import { logger } from "./middleware/logEvent.js";
import errorHandle from "./middleware/erroHandle.js";
import connectDB from "./config/db.js";

import rootRoute from "./route/root.js";
import lessonRoutes from "./route/api/lessonRoutes.js";
import authRoute from "./route/api/auth.js";
import superAdminRoute from "./route/api/super-admin.js";
import paymentRoute from "./route/api/payment.routes.js";
import softwareToken from "./route/api/softwareToken.js";
import profileRoutes from "./route/api/profileRoutes.js";
import adminDashboardRoutes from "./route/api/admin.js";
import teacherRoutes from "./route/api/teacher.js";
import walletRoutes from "./route/api/withraw.js";
import softwareRoutes from "./route/api/softwareRoutes.js";
import contentDownloadRoutes from "./route/api/contentDownload.js";
import softwareAnalyticsRoutes from "./route/softwareAnalytics.routes.js";


import {
  requestTimer,
  startStatsReporting,
  statsJson,
  statsPage,
} from "./middleware/requestTimer.js";


const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// Never let one bad request or promise kill the server
// ------------------------------------------------------------
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// ------------------------------------------------------------
// Database (connect in the background, do NOT block the server)
// ------------------------------------------------------------
mongoose.connection.on("connected", () => console.log("Connected to MongoDB"));
mongoose.connection.on("error", (err) => console.error("MongoDB error:", err.message));
mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));

console.log("connecting.............:");
Promise.resolve(connectDB()).catch((err) =>
  console.error("connectDB failed:", err?.message || err)
);

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------
app.use(requestTimer);
startStatsReporting();
app.use(logger);
// Smaller responses = much faster downloads (JSON shrinks ~5-10x)
app.use(compression({ threshold: 1024 }));

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
  "https://examtips.abanise.com",
  "https://www.examtips.abanise.com",
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : []),
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    console.warn("CORS blocked origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
    "X-Device-ID",
    "X-Timestamp",
    "X-Nonce",
    "X-Signature",
  ],
  optionsSuccessStatus: 204,
};

// cors() already answers OPTIONS preflight requests, so the old
// app.options("*") line is not needed (and crashes on Express 5).
app.use(cors(corsOptions));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
app.use(cookieParser());

// (Your disabled helmet / rate-limit / mongoSanitize / hpp blocks
//  can be pasted back here when you want them.)

// ------------------------------------------------------------
// Health check: works even when MongoDB is down
// ------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    db: mongoose.connection.readyState === 1 ? "connected" : "not connected",
  });
});

// While MongoDB is not connected, answer clearly instead of hanging
app.use((req, res, next) => {
  if (req.path === "/health" || req.method === "OPTIONS") return next();
  if (mongoose.connection.readyState === 1) return next();

  return res.status(503).json({
    success: false,
    message: "Server is starting or the database is unavailable. Try again shortly.",
  });
});

// ------------------------------------------------------------
// Static files and routes
// ------------------------------------------------------------
app.use("/", express.static(path.join(__dirname, "public")));

app.use("/", rootRoute);
app.use("/api/lessons", lessonRoutes);
app.use("/auth", authRoute);
app.use("/superadmin", superAdminRoute);
app.use("/payments", paymentRoute);
app.use("/token", softwareToken);
app.use("/profile", profileRoutes);
app.use("/admin", adminDashboardRoutes);
app.use("/teacher", teacherRoutes);
app.use("/wallet", walletRoutes);
app.use("/api/software", softwareRoutes);
app.use("/api/content/download", contentDownloadRoutes);
app.use("/api/analytics/software", softwareAnalyticsRoutes);
app.get(
  "/red(.html)?",
  (req, res, next) => {
    console.log("e");
    next();
  },
  (req, res) => {
    res.send("it is okay");
  }
);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Your error handler
app.use(errorHandle);

// ------------------------------------------------------------
// Start listening IMMEDIATELY (do not wait for MongoDB)
// ------------------------------------------------------------
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} (pid ${process.pid})`);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other server first.`);
  } else {
    console.error("Server error:", err);
  }
});