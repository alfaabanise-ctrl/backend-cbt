import express from "express";
const router = express.Router()
import {  updateproperty, getAllPropertyHomePage, getPropertyByIdForOgImg, updateogImage, getSitemapProperties, getAllProperty,updatePropertyStatus,  deleteProperty, getPropertyByUser, getPropertyById, deletePropertyImage, getPropertyImages, PropertyupdateImage } from "../../controllers/property_controller.js";
import { protect} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"
import  {updatePropertySchema} from "../../validation/updateProperty.js"
import { validate } from "../../middleware/validate.js";
// router.post("/upload-avatar", protect,  uploadAvatar.single("avatar"), updateproperty);


router.get("/",  protect,  getPropertyByUser);
router.get("/all",   getAllProperty);
router.get("/search",   getAllPropertyHomePage);
router.get("/sitemap",   getSitemapProperties);
router.post('/upload-og',  protect,   uploadAvatar.single("file"), updateogImage)
router.post("/:id", protect,    updateproperty);
router.patch('/:id/status', protect,  updatePropertyStatus)




router.delete("/:id", protect, deleteProperty);
router.get("/:id",   getPropertyById);
router.get("/og/:id",   getPropertyByIdForOgImg);


getAllPropertyHomePage


router.get("/images/:id", protect,  getPropertyImages);
router.delete("/image/:id", protect,  deletePropertyImage);
router.post("/upload-image/:id/:type", protect, uploadAvatar.single("image"), PropertyupdateImage)
export default router;
