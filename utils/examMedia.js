import ExamMedia from "../model/ExamMedia.js";

export function collectMediaIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaIds(item, ids);
    return ids;
  }

  if (!value || typeof value !== "object") return ids;

  if (value.type === "image" && value.mediaId) {
    ids.add(String(value.mediaId));
  }

  for (const child of Object.values(value)) {
    collectMediaIds(child, ids);
  }

  return ids;
}

export async function assertMediaExists(value) {
  const mediaIds = [...collectMediaIds(value)];
  if (mediaIds.length === 0) return;

  const media = await ExamMedia.find({ _id: { $in: mediaIds } })
    .select("_id")
    .lean();
  const foundIds = new Set(media.map((item) => String(item._id)));
  const missingIds = mediaIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    const error = new Error("One or more image blocks reference missing media.");
    error.statusCode = 400;
    throw error;
  }
}

export async function resolveMedia(value) {
  const mediaIds = [...collectMediaIds(value)];
  if (mediaIds.length === 0) return value;

  const media = await ExamMedia.find({ _id: { $in: mediaIds } })
    .select("url alt")
    .lean();
  const mediaById = new Map(
    media.map((item) => [String(item._id), item])
  );
  const missingIds = mediaIds.filter((id) => !mediaById.has(id));
  if (missingIds.length > 0) {
    throw new Error("Exam content references missing media records.");
  }

  const resolve = (item) => {
    if (Array.isArray(item)) return item.map(resolve);
    if (!item || typeof item !== "object") return item;

    if (item.type === "image") {
      const { mediaId, ...block } = item;
      const resolved = mediaById.get(String(mediaId));
      return {
        ...block,
        url: resolved.url,
        src: resolved.url,
        alt: resolved.alt || item.caption || "",
      };
    }

    return Object.fromEntries(
      Object.entries(item).map(([key, child]) => [key, resolve(child)])
    );
  };

  return resolve(value);
}
