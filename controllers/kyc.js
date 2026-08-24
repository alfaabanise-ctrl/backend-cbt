import dotenv from "dotenv";
dotenv.config();
import Kyc from "../model/kyc.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import jwt from 'jsonwebtoken'; 
import Propert from "../model/Property.js";
import mongoose from 'mongoose'
import Usertp from "../model/Users.js";
import Property from "../model/Property.js";
import { isValid } from "date-fns";


export const updateKyc = async (req, res) => {
  try {
    const userId = req.user._id;

    let kyc = await Kyc.findOne({ userId });

    if (!kyc) {
      kyc = await Kyc.create({ userId, status: "draft" });
    }
   
    
    const {
      nin,
      phone,
      kycType,
      faceVector,
      faceImage,
      propertyId,
      businessName,
      cacNumber,      forceUpdateNin
    } = req.body;
    console.log(faceVector, 'faceVector');
    console.log(req.files, 'req.files');
     const user = await Usertp.findById(userId);
      if (!user) {
        return res.status(404).json({success: false, message: ""});
      }
    /* ================= NIN STEP ================= */
    if(nin && phone ) {
      if (!kyc.ninVerified ) {
       
        if (!nin || !phone ) {
          return res.status(400).json({
            success: false,
            message: "NIN details are required"
          });
        }
      if(req.files?.ninImage){
          if(kyc.ninImage?.public_id ) {
            
            await deleteFromCloudinary(kyc.ninImage.public_id);
          }
          
          const ninUpload = await uploadToCloudinary(
            req.files.ninImage[0],
            "nins"
          );

          kyc.ninImage = {
              url: ninUpload.secure_url,
              public_id: ninUpload.public_id,
            };
      }
        
       
        
        
      if(user.role === "user"){
        user.role = "Owner";
        await user.save();
      }
        kyc.nin = nin;
        kyc.phone = phone;
        if(propertyId) {
          const isValidPropertyId = mongoose.Types.ObjectId.isValid(propertyId);
          if (!isValidPropertyId) {
            return res.status(400).json({
              success: false,
              message: "Invalid property ID"
            });
          }
           const property = await Propert.findOne({
              _id: propertyId,
              userId: req.user._id
            });

            property.ownership = {
              listingType: "owner",
              ownerId: req.user._id,
              verifiedOwner: true
            };
            await property.save();
        }
       
        

        kyc.ninVerified = false; // waiting admin approval
        kyc.currentStep = "instruction";
     
        await kyc.save();
      }
    }
 
    
    /* ================= FACE STEP ================= */
    if( req.files?.faceImage) {

      
      if (!kyc.faceVerified  ) {
        // if (!req.body.faceVector) {
        //   return res.status(400).json({
        //     success: false,
        //     message: "Face verification required"
        //   });
        // }
        if(kyc.faceImage?.public_id ) {
           
          await deleteFromCloudinary(kyc.faceImage.public_id);
        }
        const faceUpload = await uploadToCloudinary(
          req.files.faceImage[0],
          "faces"
        );
        if(faceVector !== undefined) {
           kyc.faceVector = JSON.parse(req.body.faceVector);
        }
       
   
         
        kyc.faceImage = {
          url: faceUpload.secure_url,
          public_id: faceUpload.public_id
        };

        kyc.faceVerified = false;
        
        
        // next step
        kyc.currentStep = kycType === "business" ? "cac" : "review";
           
            
        await kyc.save();
      }
    }

    /* ================= BUSINESS STEP ================= */
    if (kycType === "business" && (businessName || cacNumber || req.files?.cacImage)) {

      if (!kyc.faceVerified) {

        if (!businessName || !cacNumber || !req.files?.cacImage) {
          return res.status(400).json({
            success: false,
            message: "Business details required"
          });
        }
        if(kyc.cacImage?.public_id ) {
           
          await deleteFromCloudinary(kyc.business.cacImage.public_id);
        }
        const cacUpload = await uploadToCloudinary(
          req.files.cacImage[0],
          "cac"
        );
        if ( user.role === "user") {
           user.role = "Agent"
        }
       
        kyc.business = {
          name: businessName,
          cacNumber,
          cacImage: {
            url: cacUpload.url,
            public_id: cacUpload.public_id
          }
        };
        kyc.businessType = "Agent";
        kyc.businessVerified = false;
        kyc.currentStep = "review";

        
        

         if(propertyId) {
          const isValidPropertyId = mongoose.Types.ObjectId.isValid(propertyId);
          if (!isValidPropertyId) {
            return res.status(400).json({
              success: false,
              message: "Invalid property ID"
            });
          }
           const property = await Propert.findOne({
              _id: propertyId,
              userId: req.user._id
            });

            property.ownership = {
              listingType: "agent",
              ownerId: req.user._id,
              verifiedOwner: true
            };
            await property.save();
        }

       
      
        await user.save();
     
        await kyc.save();
      }
    }

    /* ================= FINAL ================= */
    if (kyc.currentStep === "review") {
      kyc.status = "pending";
      await kyc.save();
    }



    return res.status(200).json({
      success: false,
      message: "KYC updated successfully",
      step: kyc.currentStep,
      kyc
    });

  } catch (error) {
   

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};


export const getKyc = async (req, res) => {
  try {
    const kyc = await Kyc.findOne({ userId: req.user._id });
    
    // No KYC yet → start from type screen
    if (!kyc) {
      return res.status(200).json({
        success: true,
        exists: false,
        data: null
      });
    }

    // KYC exists → frontend resumes from where user stopped
    return res.status(200).json({
      success: true,
      exists: true,
      status: kyc.status,
      kycType: kyc.kycType,
      data: kyc
    });

  } catch (error) {
    console.error("GET KYC ERROR:", error);
     
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

















