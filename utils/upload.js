// upload.js
import cloudinary from "../config/cloudinary.js";

/**
 * Upload file to Cloudinary
 */
// export async function uploadToCloudinary(filePath, folder = "uploads") {
//   try {
//     const result = await cloudinary.uploader.upload(filePath, { folder });
//     console.log("✅ Uploaded:", result.secure_url);
//     return {
//       url: result.secure_url,
//       publicId: result.public_id, // save this for deletion
//     };
//   } catch (error) {
//     console.error("❌ Upload failed:", error);
//     throw error;
//   }
// }

// import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

export const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      { folder: folder},
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};
/**
 * Delete file from Cloudinary by publicId
 */

export async function deleteFromCloudinary(publicId) {
  try {

    if (!publicId) {
      throw new Error("publicId is required");
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });

    if (result.result === "ok") {
      console.log(`🗑️ Deleted: ${publicId}`);
    } else {
      console.warn(`⚠️ Delete response:`, result);
    }

    return result;

  } catch (error) {
    console.error("❌ Delete failed:", error);
    throw error;
  }
}
