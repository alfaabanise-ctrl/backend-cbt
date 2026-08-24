import dotenv from "dotenv";
dotenv.config();
import Propert from "../model/Property.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import jwt from 'jsonwebtoken'; 
import mongoose from 'mongoose'
import slugify from "slugify"
import puppeteer from "puppeteer"
import PropertyOrder from "../model/PropertyOrder.js";
import Usertp from "../model/Users.js";

/* =====================================================
   UPDATE / CREATE PROPERTY WITH AUTO SLUG
===================================================== */
export const updateproperty = async (req, res) => {
  try {
    const id = req.params.id
    const { details } = req.body

    /* ================= CHECK BODY ================= */
    if (!details || Object.keys(details).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Details are required"
      })
    }

    /* ================= REQUIRED ================= */
    const { title, category, type, purpose,   } = details

    const requiredFields = { title, category, type, purpose }

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({
          success: false,
          message: `${key.charAt(0).toUpperCase() + key.slice(1)} is required`
        })
      }
    }

    /* =====================================================
       CREATE UNIQUE SLUG FROM TITLE
       Example:
       3 Bedroom Duplex In Lagos
       =>
       3-bedroom-duplex-in-lagos
    ===================================================== */
    let baseSlug = slugify(title, {
      lower: true,
      strict: true,
      trim: true
    })

    let finalSlug = baseSlug

    let counter = 1

    while (
      await Propert.findOne({
        slug: finalSlug,
        ...(mongoose.Types.ObjectId.isValid(id)
          ? { _id: { $ne: id } }
          : {})
      })
    ) {
      finalSlug = `${baseSlug}-${counter}`
      counter++
    }

    details.slug = finalSlug

    /* ================= FIX GEOJSON ================= */
    if (details.location?.geometry) {
      const geo = details.location.geometry

      const isEmptyCoords =
        !geo.coordinates ||
        (Array.isArray(geo.coordinates) &&
          geo.coordinates.length === 0)

      const invalidPoint =
        geo.type === "Point" &&
        (!Array.isArray(geo.coordinates) ||
          geo.coordinates.length !== 2)

      const invalidPolygon =
        geo.type === "Polygon" &&
        (!Array.isArray(geo.coordinates) ||
          geo.coordinates.length === 0)

      if (isEmptyCoords || invalidPoint || invalidPolygon) {
        delete details.location.geometry
      }
    }

    /* ================= CLEAN DATA ================= */
    const {
      status,
      _id,
      media,
      ownership,
      documents,
      ...others
    } = details

    let property

    const isValidId = mongoose.Types.ObjectId.isValid(id)

    /* ================= UPDATE ================= */
    if (isValidId) {
      property = await Propert.findOneAndUpdate(
        {
          _id: id,
          userId: req.user._id
        },
        {
          $set: others
        },
        {
          new: true,
          runValidators: true
        }
      )

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found"
        })
      }

      return res.status(200).json({
        success: true,
        message: "Property updated successfully",
        data: property
      })
    }

    /* ================= CREATE ================= */
    property = await Propert.create({
      userId: req.user._id,
      ...others
    })

    return res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: property
    })

  } catch (error) {
   

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })
  }
}



export const updatePropertyStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    /* ================= VALIDATE ID ================= */
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid property id'
      })
    }

    /* ================= VALIDATE STATUS ================= */
    const allowedStatus = [
      'draft',
      'approved',
      'sold',
      'rented',
      'off_market'
    ]

    if (!status || !allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      })
    }

    /* ================= FIND PROPERTY (OWNER ONLY) ================= */
    const property = await Propert.findOne({
      _id: id,
      userId: req.user._id
    })

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you are not the owner'
      })
    }

    /* ================= TRANSITION RULES ================= */
    const allowedTransitions = {
      draft: ['approved'],
      approved: ['sold', 'rented', 'off_market', 'draft'],
      off_market: ['approved'],
      sold: [],
      rented: [],
       suspended: []
    }

    const currentStatus = property.status

    if (!allowedTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${currentStatus}" to "${status}"`
      })
    }

    /* ================= UPDATE ================= */
    property.status = status
    await property.save()

    return res.status(200).json({
      success: true,
      message: 'Property status updated successfully',
      data: property
    })

  } catch (error) {
    

    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    })
  }
}


export const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;

    /*--------------------------------------------------
    Find Property by ObjectId or Slug
    --------------------------------------------------*/
    let property;

    if (mongoose.Types.ObjectId.isValid(id)) {
      property = await Propert.findById(id).populate("userId");
    } else {
      property = await Propert.findOne({ slug: id }).populate("userId");
    }

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    let isOwner = false;
    let order = null;

    const token = req.cookies?.jwt;

    /*--------------------------------------------------
    Logged In User
    --------------------------------------------------*/
    if (token) {
      try {
        const decoded = jwt.verify(
          token,
          process.env.REFRESH_TOKEN_SECRETY
        );

        isOwner =
          property.userId._id.toString() === decoded.id.toString();

        /*--------------------------------------------------
        Build Order Query
        --------------------------------------------------*/
        let orderQuery = PropertyOrder.findOne(
          isOwner
            ? {
                property: property._id,
              }
            : {
                property: property._id,
                buyer: decoded.id,
              }
        );

        /*--------------------------------------------------
        Admin
        Gets Buyer + Seller + Property
        --------------------------------------------------*/
        const user = await Usertp.findById(decoded.id.toString()) 
        
        
        if (user.roles === "Admin") {
          console.log('Admin');
          
          orderQuery = orderQuery
            .populate({
              path: "buyer",
              select:
                "firstName lastName roles email whatsapp_no phone avatar location",
            })
            .populate({
              path: "seller",
              select:
               "firstName lastName roles email whatsapp_no phone avatar location",
            })
            
        }

        /*--------------------------------------------------
        Seller
        Gets Buyer Only
        --------------------------------------------------*/
        else if (isOwner) {
           console.log('onwerner');
          orderQuery = orderQuery.populate({
            path: "buyer",
            select:
              "firstName roles lastName email whatsapp_no phone avatar location",
          });
        }

        /*--------------------------------------------------
        Buyer
        Gets Seller Only
        --------------------------------------------------*/
        else {
           console.log('buyer');
          orderQuery = orderQuery.populate({
            path: "seller",
            select:
             "firstName lastName roles email whatsapp_no phone avatar location",
          });
        }

        order = await orderQuery;
      } catch (err) {
        console.log("JWT invalid or expired:", err.message);
      }
    }

    return res.status(200).json({
      success: true,
      isOwner,
      order,
      data: property,
    });
  } catch (error) {
    console.error("PROPERTY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};






export const PropertyupdateImage = async (req, res) => {
  try {
    const { id, type } = req.params;

    const property = await Propert.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Ensure structure
    if (!property.media) property.media = { files: [] };
    if (!property.media.files) property.media.files = [];
     
    // Upload to cloudinary
    const result = await uploadToCloudinary(req.file, type);
  
    
    const newFile = {
      url: result.secure_url,
      public_id: result.public_id,
      type
    };

    // Save new image
    property.media.files.push(newFile);
    await property.save();

    // Group files by type
    const images = property.media.files.filter(f => f.type === "image");
    const survey = property.media.files.filter(f => f.type === "survey");
    const titleDocs = property.media.files.filter(f => f.type === "titleDocs");

    res.status(200).json({
      success: true,
      data: {
        images,
        survey,
        titleDocs
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


export const getPropertyImages = async (req, res) => {
  try {
    const id = req.params.id;

    const property = await Propert.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    // safe fallback (VERY IMPORTANT)
    const images = property.media.files.filter(f => f.type === "image");
    const survey = property.media.files.filter(f => f.type === "survey");
    const titleDocs = property.media.files.filter(f => f.type === "titleDocs");
    
    

    return res.status(200).json({
      success: true,
      data: {
        images,
        survey,
        titleDocs
      }
    });

  } catch (error) {
    console.error("PROPERTY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getPropertyByUser = async (req, res) => {
  try {
    const property = await Propert.find({
      userId: req.user._id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: property
    });

  } catch (error) {
    console.error("PROPERTY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};




export const deletePropertyImages = async (req, res) => {
  try {
    const id = req.params.id;
  

    // Make sure to use 'userId' instead of 'user'
    const property = await Propert.findOne({ _id: id, userId: req.user._id });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
   

    if (!req.body.id) return res.status(400).json({ message: "not not found", })


    const image = property.media.images.id(req.body.id);
    
    if (!image) return res.status(400).json({ message: "not not found", })
    if (image.public_id) {
      await deleteFromCloudinary(image.public_id)
    }



    image.deleteOne()

    await property.save()
    return res.status(200).json({
      success: true,
      data: property.media.images,
    });

  } catch (error) {
    console.error("PROPERTY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


export const deleteProperty = async (req, res) => {
  try {
    const id = req.params.id;

    // 1️⃣ Find property that belongs to this user
    const property = await Propert.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }


        if (property.media?.files?.length) {
      for (const img of property.media.files) {
       
          if (img.public_id) {
            await deleteFromCloudinary(img.public_id)
          }
        
      }
    }

    // 3️⃣ Delete property from database
     await Propert.deleteOne({ _id: id });

    return res.status(200).json({
      success: true,
      message: "Property and images deleted successfully",
    });

  } catch (error) {
    
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const deletePropertyImage = async (req, res) => {
  try {
    const { id, type } = req.body
    const propertyId = req.params.id
  
    if (!id || !type) {
      return res.status(400).json({
        success: false,
        message: "Image id and type are required"
      })
    }
    


    const property = await Propert.findOne({
      _id: propertyId,
      userId: req.user._id // ✅ SECURITY
    })

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      })
    }

    const media = property.media || {}
    

    // validate type
    if (!["image", "survey", "titleDocs"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type"
      })
    }

    const list = media[type] || []
   

    // find image
    const image = property.media.files.id(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found"
      })
    }

    /* ================= DELETE FROM CLOUDINARY ================= */
    if (image.public_id) {
      await deleteFromCloudinary(image.public_id)
    }
    image.deleteOne()
   
    await property.save()
    const images = property.media.files.filter(f => f.type === "image");
    const survey = property.media.files.filter(f => f.type === "survey");
    const titleDocs = property.media.files.filter(f => f.type === "titleDocs");

    return res.status(200).json({
      success: true,
      message: "Deleted successfully",
      data:{ images, survey, titleDocs }
    })

  } catch (error) {
    console.error("DELETE IMAGE ERROR:", error)

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })
  }
}



/* =====================================================
   UPDATE / PUBLIC ROUTE
===================================================== */

export const getAllProperty = async (req, res) => {

  try {


    let {

      search,

      category,

      location,

      purpose,

      state,

      city,

      school, // ✅ NEW SCHOOL FILTER

      minPrice,

      maxPrice,

      minRooms,

      maxRooms,

      type,

      page = 1,

      limit = 20,

      sort = "random"


    } = req.query
    
    




    page = Number(page)

    limit = Number(limit)





    const query = {}

    const orConditions = []






    /* =========================
       SEARCH
    ========================= */


    if(search){


      orConditions.push(


        {
          title:{
            $regex:search,
            $options:"i"
          }
        },


        {
          "location.address":{
            $regex:search,
            $options:"i"
          }
        },


        {
          "location.city":{
            $regex:search,
            $options:"i"
          }
        },


        {
          "location.state":{
            $regex:search,
            $options:"i"
          }
        },


        {
          "location.lga":{
            $regex:search,
            $options:"i"
          }
        },


        // ✅ search school name
        {
          "hostelDetails.school.name":{
            $regex:search,
            $options:"i"
          }
        },


        // ✅ search school abbreviation
        {
          "hostelDetails.school.abbreviation":{
            $regex:search,
            $options:"i"
          }
        }


      )

    }









    /* =========================
       LOCATION
    ========================= */


    if(state){


      query["location.state"] =
      new RegExp(`^${state}$`,"i")


    }





    if(city){


      query["location.city"] =
      new RegExp(`^${city}$`,"i")


    }






    if(location && !state && !city){


      orConditions.push(


        {
          "location.address":{
            $regex:location,
            $options:"i"
          }
        },


        {
          "location.city":{
            $regex:location,
            $options:"i"
          }
        },


        {
          "location.state":{
            $regex:location,
            $options:"i"
          }
        },


        {
          "location.lga":{
            $regex:location,
            $options:"i"
          }
        }


      )


    }









    /* =========================
       TYPE
    ========================= */


    if(type){


      query.type =
      type.toLowerCase()


    }









    /* =========================
       PURPOSE
    ========================= */


    if(purpose){


      query.purpose =
      new RegExp(`^${purpose}$`,"i")


    }









    /* =========================
       CATEGORY
    ========================= */


    if(category && category !== "All"){


      query.category =
      new RegExp(`^${category}$`,"i")


    }









    /* =========================
       HOSTEL SCHOOL FILTER
    ========================= */


    if(school){


      query[
        "hostelDetails.school.abbreviation"
      ] =

      new RegExp(`^${school}$`,"i")


    }









    /* =========================
       PRICE
    ========================= */


    if(minPrice || maxPrice){


      query["pricing.price"] = {}



      if(minPrice){


        query["pricing.price"].$gte =
        Number(minPrice)


      }




      if(maxPrice){


        query["pricing.price"].$lte =
        Number(maxPrice)


      }


    }









    /* =========================
       BEDROOMS
    ========================= */


    if(minRooms || maxRooms){


      const valueQuery = {}



      if(minRooms){


        valueQuery.$gte =
        Number(minRooms)


      }




      if(maxRooms){


        valueQuery.$lte =
        Number(maxRooms)


      }





      query.features = {


        $elemMatch:{


          key:"bedroom",


          value:valueQuery


        }


      }


    }









    /* =========================
       APPLY OR
    ========================= */


    if(orConditions.length){


      query.$or =
      orConditions


    }









    /* =========================
       PAGINATION
    ========================= */


    const skip =
    (page - 1) * limit







    /* =========================
       SORT
    ========================= */


    const sortMap = {


      newest:{
        createdAt:-1
      },


      oldest:{
        createdAt:1
      },


      price_asc:{
        "pricing.price":1
      },


      price_desc:{
        "pricing.price":-1
      },


      random:{
        randomOrder:1
      }


    }





    const sortOption =
    sortMap[sort] || {

      randomOrder:1

    }









    /* =========================
       GET DATA
    ========================= */


    const properties = await Propert.find({


      status:"approved",


      ...query


    })

    .sort(sortOption)

    .skip(skip)

    .limit(limit)









    /* =========================
       TOTAL
    ========================= */


    const total = await Propert.countDocuments({


      status:"approved",


      ...query


    })








    return res.status(200).json({


      success:true,


      results:properties.length,


      total,


      page,


      pages:Math.ceil(total / limit),


      data:properties


    })





  } catch(error){



    console.error(
      "PROPERTY ERROR:",
      error
    )



    return res.status(500).json({


      success:false,


      message:"Server error",


      error:error.message


    })


  }


}
export const getAllPropertyss = async (req, res) => {
  try {
    let {
      search,
      category,
      location,
      purpose,
      state,
      city,
      minPrice,
      maxPrice,
      minRooms,
      maxRooms,
      type,
      page = 1,
      limit = 10,
      sort = "newest"
    } = req.query

    page = Number(page)
    limit = Number(limit)


    const query = {}
    const orConditions = []

    /* =========================
       🔍 SEARCH
    ========================= */

    if (search) {
      orConditions.push(
        { title: { $regex: search, $options: "i" } },
        { "location.address": { $regex: search, $options: "i" } },
        { "location.city": { $regex: search, $options: "i" } },
        { "location.state": { $regex: search, $options: "i" } },
        { "location.lga": { $regex: search, $options: "i" } }
      )
    }

    /* =========================
       📍 LOCATION
    ========================= */

    if (state) {
      query["location.state"] = new RegExp(`^${state}$`, "i")
    }

    if (city) {
      query["location.city"] = new RegExp(`^${city}$`, "i")
    }

    // fallback location
    if (location && !state && !city) {
      orConditions.push(
        { "location.address": { $regex: location, $options: "i" } },
        { "location.city": { $regex: location, $options: "i" } },
        { "location.state": { $regex: location, $options: "i" } },
        { "location.lga": { $regex: location, $options: "i" } }
      )
    }

    /* =========================
       🏠 TYPE
    ========================= */

    if (type) {
      query.type = type.toLowerCase()
    }

    /* =========================
       🎯 PURPOSE
    ========================= */

    if (purpose) {
      query.purpose = new RegExp(`^${purpose}$`, "i")
    }

    /* =========================
       🏷 CATEGORY
    ========================= */

    if (category && category !== "All") {
      query.category = new RegExp(`^${category}$`, "i")
    }

    /* =========================
       💰 PRICE
    ========================= */

    if (minPrice || maxPrice) {
      query["pricing.price"] = {}

      if (minPrice) {
        query["pricing.price"].$gte = Number(minPrice)
      }

      if (maxPrice) {
        query["pricing.price"].$lte = Number(maxPrice)
      }
    }

    /* =========================
       🛏 ROOMS
    ========================= */

    if (minRooms || maxRooms) {
      const valueQuery = {}

      if (minRooms) {
        valueQuery.$gte = Number(minRooms)
      }

      if (maxRooms) {
        valueQuery.$lte = Number(maxRooms)
      }

      query.features = {
        $elemMatch: {
          key: "bedroom",
          value: valueQuery
        }
      }
    }

    /* =========================
       🔥 APPLY OR CONDITIONS
    ========================= */

    if (orConditions.length) {
      query.$or = orConditions
    }

    /* =========================
       📄 PAGINATION
    ========================= */

    const skip = (page - 1) * limit

    /* =========================
       🔃 SORTING
    ========================= */

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { "pricing.price": 1 },
      price_desc: { "pricing.price": -1 }
    }

    const sortOption = sortMap[sort] || {
      createdAt: -1
    }

    /* =========================
       🚀 EXECUTE
    ========================= */

    let properties = []

    // RANDOM RESULTS EVERY FETCH
    if (sort === "random") {

      properties = await Propert.aggregate([
        {
          $match: {
            status: "approved",
            ...query
          }
        },

        // random documents every request
        {
          $sample: {
            size: limit
          }
        }
      ])

    } else {

      // NORMAL SORTING
      properties = await Propert.find({
        status: "approved",
        ...query
      })
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
    }

    /* =========================
       📊 TOTAL
    ========================= */

    const total = await Propert.countDocuments({
      status: "approved",
      ...query
    })

 

    /* =========================
       ✅ RESPONSE
    ========================= */

    return res.status(200).json({
      success: true,
      results: properties.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: properties
    })

  } catch (error) {
    

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })
  }
}
export const getAPropertys = async (req, res) => {
  try {
    let {
      search,
      category,
      location,
      purpose,
      state,
      city,
      minPrice,
      maxPrice,
      type,
      page = 1,
      limit = 12,
      sort = "newest",
      status
    } = req.query

    page = Number(page)
    limit = Number(limit)

    const query = {}

    /* =================================
       SEARCH
    ================================= */

    if (search?.trim()) {
      query.$text = {
        $search: search.trim()
      }
    }

    /* =================================
       FILTERS
    ================================= */

    if (type) {
      query.type = type.toLowerCase()
    }

    if (purpose) {
      query.purpose = purpose.toLowerCase()
    }

    if (category && category !== "All") {
      query.category = category.toLowerCase()
    }

    if (state) {
      query["location.state"] = state
    }

    if (city) {
      query["location.city"] = city
    }

    if (status) {
      query.status = status
    }

    /* =================================
       LOCATION FALLBACK
    ================================= */

    if (location && !state && !city) {
      query.$or = [
        { "location.address": new RegExp(location, "i") },
        { "location.city": new RegExp(location, "i") },
        { "location.state": new RegExp(location, "i") }
      ]
    }

    /* =================================
       PRICE
    ================================= */

    if (minPrice || maxPrice) {
      query["pricing.price"] = {}

      if (minPrice) {
        query["pricing.price"].$gte = Number(minPrice)
      }

      if (maxPrice) {
        query["pricing.price"].$lte = Number(maxPrice)
      }
    }

    /* =================================
       SORT
    ================================= */

    let sortOption = {}

    switch (sort) {
      case "price_asc":
        sortOption = { "pricing.price": 1 }
        break

      case "price_desc":
        sortOption = { "pricing.price": -1 }
        break

      default:
        sortOption = { createdAt: -1 }
    }

    /* =================================
       PAGINATION
    ================================= */

    const skip = (page - 1) * limit

    /* =================================
       EXECUTE
    ================================= */

    const [properties, total] = await Promise.all([

      Property.find(query)
        .select("-__v")
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),

      Property.countDocuments(query)

    ])

    return res.status(200).json({
      success: true,

      results: properties.length,

      total,

      page,

      pages: Math.ceil(total / limit),

      data: properties
    })

  } catch (error) {
    

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })
  }
}

export const getAllPropertyHomePage = async (req, res) => {
  try {
    const keyword = (req.query.q || "").trim();
    const limit = Number(req.query.limit) || 6;

    const pipeline = [];

    // Join User collection
    pipeline.push({

       $match: {
        status: "ACTIVE",
      },
      $lookup: {
        from: "users", // Your users collection name
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Search
    if (keyword) {
      pipeline.push({
        $match: {
          $or: [
            {
              title: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              description: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              purpose: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              type: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              category: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              "location.city": {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              "location.state": {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              "location.address": {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              "user.profile.name": {
                $regex: keyword,
                $options: "i",
              },
            },
          ],
        },
      });
    }

    pipeline.push({
      $sort: {
        createdAt: -1,
      },
    });

    pipeline.push({
      $limit: limit,
    });

    const properties = await Propert.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      count: properties.length,
      data: properties,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getSitemapProperties = async (req, res) => {
  try {
    const properties = await Propert.find(
      { status: "approved" },
      { slug: 1, updatedAt: 1 }
    ).lean()

    return res.status(200).json({
      success: true,
      data: properties
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}





import { exec } from "child_process";
import { promisify } from "util";


const execAsync = promisify(exec);



export const generateOGImage = async (propertyId) => {


  let browser = null;



  console.log("========== OG START ==========");



  try {


    const property =
      await Propert.findById(propertyId);



    console.log(
      "PROPERTY FOUND:",
      !!property
    );



    if (!property) {

      throw new Error(
        "Invalid property id"
      );

    }



    // ==============================
    // TEST CHROMIUM
    // ==============================


    console.log(
      "Testing chromium..."
    );



    try {


      const { stdout, stderr } =
        await execAsync(
          "/usr/bin/chromium --version"
        );



      console.log(
        "CHROMIUM VERSION:",
        stdout
      );


      if(stderr){

        console.log(
          "CHROMIUM STDERR:",
          stderr
        );

      }



    } catch(error){


      console.log(
        "CHROMIUM TEST FAILED:",
        error.message
      );


    }





    const executablePath =
      process.env.NODE_ENV === "production"
        ? "/usr/bin/chromium"
        : undefined;



    console.log(
      "EXECUTABLE PATH:",
      executablePath
    );



    console.log(
      "Launching browser..."
    );




    browser =
      await puppeteer.launch({

        headless:"new",


        executablePath,


        timeout:120000,


        dumpio:true,


        args:[


          "--no-sandbox",


          "--disable-setuid-sandbox",


          "--disable-dev-shm-usage",


          "--disable-gpu",


          "--disable-software-rasterizer",


          "--disable-extensions",


          "--no-first-run",


          "--no-default-browser-check"



        ]

      });




    console.log(
      "BROWSER LAUNCHED SUCCESSFULLY"
    );




    const page =
      await browser.newPage();




    console.log(
      "PAGE CREATED"
    );




    page.on(
      "console",
      msg => {

        console.log(
          "FRONTEND:",
          msg.text()
        );

      }
    );



    page.on(
      "pageerror",
      error => {

        console.log(
          "PAGE ERROR:",
          error.message
        );

      }
    );



    await page.setViewport({

      width:1200,

      height:630,

      deviceScaleFactor:1

    });







    const url =
      `${process.env.FRONTEND_BASE_URL}ogImage/${propertyId}`;



  



    const response =
      await page.goto(

        url,

        {

          waitUntil:"domcontentloaded",

          timeout:60000

        }

      );



  



  




    await page.screenshot({

      path:"debug-before-card.png",

      fullPage:true

    });



    console.log(
      "DEBUG SCREENSHOT CREATED"
    );




    console.log(
      "WAITING FOR OG CARD"
    );



    await page.waitForSelector(

      ".og-card",

      {

        visible:true,

        timeout:60000

      }

    );




    console.log(
      "OG CARD FOUND"
    );





    await page.evaluate(async()=>{


      await document.fonts.ready;



      const images =
        Array.from(
          document.images
        );



      await Promise.all(

        images.map(img=>{


          if(img.complete){

            return Promise.resolve();

          }



          return new Promise(resolve=>{


            img.onload = resolve;


            img.onerror = resolve;


          });



        })


      );



    });





    console.log(
      "IMAGES READY"
    );




    const imageBuffer =
      await page.screenshot({

        type:"png",

        clip:{

          x:0,

          y:0,

          width:1200,

          height:630

        }

      });





    console.log(
      "SCREENSHOT DONE"
    );




    if(property.ogimage?.image?.public_id){


      console.log(
        "DELETING OLD IMAGE"
      );


      await deleteFromCloudinary(

        property.ogimage.image.public_id

      );


    }




    console.log(
      "UPLOADING CLOUDINARY"
    );



    const result =
      await uploadToCloudinary(

        {

          buffer:imageBuffer

        },

        "og_images"

      );




   





    property.ogimage = {


      image:{


        url:result.secure_url,


        public_id:result.public_id,


        type:"ogimage"


      }


    };




    await property.save();



    console.log(
      "DATABASE UPDATED"
    );



    console.log(
      "========== OG FINISHED =========="
    );



    return {


      url:result.secure_url,


      public_id:result.public_id


    };





  } catch(error){


    console.log(
      "========== OG FAILED =========="
    );


    console.error(
      error
    );


    throw error;



  } finally {



    if(browser){


      console.log(
        "CLOSING BROWSER"
      );


      await browser.close();


    }


  }


};
export const updateogImage = async (req, res) => {
  try {
    
    const { propertyId} = req.body;
    
    
    const property = await Propert.findById(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }


    // Delete old image if it exists
    if (property.ogimage?.public_id) {
      await deleteFromCloudinary(property.ogimage.public_id);
    }

    // Upload new image
      const result = generateOGImage(propertyId)
    // Create ogimage object if it doesn't exist
   
    

      property.ogimage.image = {
        url: result.secure_url,
        public_id: result.public_id,
        type: "ogimage"
      };

      property.ogimage.previews_template = previews_template;
    await property.save();

    return res.status(200).json({
      success: true,
      message: "OG image updated successfully",
      ogimage: property.ogimage
    });

  } catch (error) {
   

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

export const getPropertyByIdForOgImg = async (req, res) => {

  try {

    const id = req.params.id;


    const isValidId =
      mongoose.Types.ObjectId.isValid(id);



    let property;



    if (!isValidId) {


      property =
        await Propert
          .findOne({ slug:id })
          .populate("userId");


    } else {


      property =
        await Propert
          .findById(id)
          .populate("userId");


    }




    if (!property) {

      return res.status(404).json({

        success:false,

        message:"Property not found"

      });

    }



    return res.status(200).json({

      success:true,

      data:property

    });



  } catch(error){


    console.error(
      "PROPERTY ERROR:",
      error
    );


    return res.status(500).json({

      success:false,

      message:"Server error",

      error:error.message

    });


  }

};