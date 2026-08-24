import crypto from "crypto";

export const generateCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie("XSRF-TOKEN", token, {
    httpOnly: false, // frontend must read it
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
  });

  return token;
};

export const verifyCsrf = (req, res, next) => {
  const cookieToken = req.cookies["XSRF-TOKEN"];
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      message: "CSRF token missing"
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token"
    });
  }

  next();
};