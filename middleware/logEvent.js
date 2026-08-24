import { format } from "date-fns";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { promises as fspromise } from "fs";

// Log an event to a file
export const logEvent = async (message, logName) => {
  const date = format(new Date(), "yyyy MMM ddd\tHHH:mm:ss ");
  const ui = uuid();
  const logLine = `${ui}\t${date}\t${message}\n`;
  // await fspromise.appendFile(path.join(path.resolve(), logName), logLine);
};

// Middleware to log HTTP requests
export const logger = (req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  logEvent(`${req.method}\t${req.headers.origin}\t${req.url}`, "newfile.txt");
  next();
};