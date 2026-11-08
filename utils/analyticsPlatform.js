export const ANALYTICS_PLATFORMS = [
  "windows",
  "android",
  "ios",
  "macos",
  "linux",
  "other",
];

export function getAnalyticsPlatform(userAgent = "") {
  const value = String(userAgent).toLowerCase();

  if (/iphone|ipad|ipod/.test(value)) return "ios";
  if (/android/.test(value)) return "android";
  if (/windows/.test(value)) return "windows";
  if (/macintosh|mac os/.test(value)) return "macos";
  if (/linux/.test(value)) return "linux";

  return "other";
}
