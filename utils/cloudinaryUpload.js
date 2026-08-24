import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadImage = (file) => {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      { folder: "avatars" },
      (error, result) => {

        if (result) {
          resolve(result);
        } else {
          reject(error);
        }

      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);

  });
};