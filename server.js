
import dotenv from "dotenv";
dotenv.config();
import dns from "node:dns"

import express from "express"
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import path from "path"
import cors from "cors"
dotenv.config()

// Force Node.js DNS to use Google DNS
dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
])


import cookieParser from "cookie-parser"
import mongoose from "mongoose"
// import csrfRoute from "./route/csrf.js";

import { fileURLToPath } from "url"

import { logger } from "./middleware/logEvent.js"
import errorHandle from "./middleware/erroHandle.js"


// import {
//   csrfSynchronisedProtection
// } from "./middleware/csrf.js";



import connectDB from "./config/db.js"




// import inspectRoute from "./route/api/inpection.js"
import  rootRoute from "./route/root.js";
import lessonRoutes from "./route/api/lessonRoutes.js"
import authRoute from './route/api/auth.js'
import superAdminRoute from './route/api/super-admin.js'
import paymentRoute  from './route/api/payment.routes.js'
import softwareToken  from './route/api/softwareToken.js'
import profileRoutes from './route/api/profileRoutes.js'
import adminDashboardRoutes from "./route/api/admin.js";

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/



const app = express()





const PORT = process.env.PORT || 5000

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
console.log("connecting.............:");
// Connect DB
connectDB()


// app.set("trust proxy", 1);
// app.disable("x-powered-by");


// Logger middleware
app.use(logger)



// app.use(
//   helmet({
//     crossOriginEmbedderPolicy: false,

//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'self'"],

//         scriptSrc: [
//           "'self'",
//           "https://js.paystack.co",
//           "https://checkout.flutterwave.com"
//         ],

//         connectSrc: [
//           "'self'",
//           "https://api.paystack.co",
//           "https://api.flutterwave.com",
//           "https://res.cloudinary.com"
//         ],

//         imgSrc: [
//           "'self'",
//           "data:",
//           "blob:",
//           "https://res.cloudinary.com"
//         ],

//         styleSrc: [
//           "'self'",
//           "'unsafe-inline'"
//         ],

//         objectSrc: ["'none'"],

//         frameSrc: [
//           "https://js.paystack.co",
//           "https://checkout.flutterwave.com"
//         ],

//         upgradeInsecureRequests: []
//       }
//     },

//     hsts: {
//       maxAge: 31536000,
//       includeSubDomains: true,
//       preload: true
//     },

//     frameguard: {
//       action: "sameorigin"
//     },

//     dnsPrefetchControl: {
//       allow: false
//     },

//     referrerPolicy: {
//       policy: "strict-origin-when-cross-origin"
//     }
//   })
// );


// CORS configuration
const corsOptions = {
  origin: [
    "https://cbt-desktop.vercel.app",
    "https://cbt-desktop.vercel.app/",
    "http://localhost:3000",
    "https://truep-lpag.vercel.app"
  ],
  credentials: true,
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))



// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 200,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: {
//     success: false,
//     message: "Too many requests. Please try again later."
//   }
// });

// app.use(limiter);
// Middleware
app.use(express.json({
    limit: "5mb"
}));

app.use(express.urlencoded({
    extended: false,
    limit: "5mb"
}));
// app.use(mongoSanitize());

// app.use(hpp())
app.use(cookieParser())
// app.use(csrfSynchronisedProtection);
// app.use("/csrf", csrfRoute);

// Static files
app.use("/", express.static(path.join(__dirname, "public")))

// Routes
app.use("/", rootRoute)

app.use("/api/lessons", lessonRoutes)
app.use("/auth", authRoute)
app.use("/superadmin", superAdminRoute)
app.use("/payments", paymentRoute)
app.use("/token", softwareToken)
app.use("/profile", profileRoutes)
app.use('/admin', adminDashboardRoutes);
// app.use('/payment', paymentRoute)
// app.use('/order', orderRoutes)
// app.use("/transactions", transactionRoutes)
// app.use("/payout", payoutRoutes)
// app.use("/review", reviewRoutes)
// app.use("/csrf", csrfRoute);
// Test route
app.get(
  "/red(.html)?",
  (req, res, next) => {
    console.log("e")
    next()
  },
  (req, res) => {
    res.send("it is okay")
  }
)

// Error handler
app.use(errorHandle)

// Start server after DB connection
mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB")

  app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
  )
  //  startPaymentVerificationJob();
})