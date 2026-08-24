// utils/transactionReference.js

import crypto from "crypto";

export function generateTransactionReference() {
    return `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}