import Usertp from "../model/Users.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import  Others from "../model/Others.js";
import axios from "axios";
import mongoose from 'mongoose';
import Propert from "../model/Property.js";
import {  bravo_sendEmail } from "../service/bravoemail.js";
import {propertyBlockedTemplate} from "../template/block_template.js";
export const getallusers = async (req, res) => {
  try {


    /* =====================================================
       QUERY PARAMS
    ===================================================== */

    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    const search = req.query.search || ""
    const role = req.query.role || ""
    const verified = req.query.verified

    /* =====================================================
       FILTER
    ===================================================== */

    const matchFilter = {}

    // SEARCH BY NAME OR EMAIL
    if (search) {
      matchFilter.$or = [
        {
          fullname: {
            $regex: search,
            $options: "i",
          },
        },
        {
          email: {
            $regex: search,
            $options: "i",
          },
        },
      ]
    }

    // FILTER ROLE
    if (role) {
      matchFilter.role = role
    }

    // FILTER VERIFIED USERS
    if (verified === "true") {
      matchFilter.emailVerified = true
    }

    if (verified === "false") {
      matchFilter.emailVerified = false
    }

    /* =====================================================
       AGGREGATION
    ===================================================== */

    const users = await Usertp.aggregate([

      /* =====================================================
         MATCH FILTERS
      ===================================================== */

      {
        $match: matchFilter,
      },

      /* =====================================================
         JOIN OTHERS
      ===================================================== */

      {
        $lookup: {
          from: "others",
          localField: "_id",
          foreignField: "userId",
          as: "other",
        },
      },

      {
        $unwind: {
          path: "$other",
          preserveNullAndEmptyArrays: true,
        },
      },

      /* =====================================================
         JOIN PROPERTIES
      ===================================================== */

      {
        $lookup: {
          from: "properts",
          localField: "_id",
          foreignField: "userId",
          as: "properties",
        },
      },

      /* =====================================================
         PROPERTY COUNT
      ===================================================== */

      {
        $addFields: {
          totalProperties: {
            $size: "$properties",
          },
        },
      },

      /* =====================================================
         MERGE USER + OTHER
      ===================================================== */

      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$$ROOT",
              "$other",
            ],
          },
        },
      },

      /* =====================================================
         REMOVE SENSITIVE FIELDS
      ===================================================== */

      {
        $project: {
          password: 0,
          walletBalance: 0,
          refreshToken: 0,
          emailVerificationToken: 0,
          resetPasswordExpires: 0,
          resetPasswordToken: 0,
          __v: 0,
          other: 0,
          nin: 0,
          certificates: 0,
        },
      },

      /* =====================================================
         SORT
      ===================================================== */

      {
        $sort: {
          createdAt: -1,
        },
      },

      /* =====================================================
         PAGINATION
      ===================================================== */

      {
        $skip: skip,
      },

      {
        $limit: limit,
      },

    ])

    /* =====================================================
       TOTAL USERS
    ===================================================== */

    const totalUsers = await Usertp.countDocuments()
       

    /* =====================================================
       RESPONSE
    ===================================================== */

    res.status(200).json({
      success: true,

      pagination: {
        totalUsers,
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        limit,
      },
     
      data: users,
    })

  } catch (error) {

    console.log(error)

    res.status(500).json({
      success: false,
      message: "Server error",
    })

  }
}

export const adminDashboardStats = async (req, res) => {
  try {

    /* =====================================================
       TOTAL USERS
    ===================================================== */

    const totalUsers = await Usertp.countDocuments()

    /* =====================================================
       TOTAL VERIFIED USERS
    ===================================================== */

    const totalVerifiedUsers = await Usertp.countDocuments({
      emailVerified: true,
    })

    /* =====================================================
       TOTAL UNVERIFIED USERS
    ===================================================== */

    const totalUnverifiedUsers = await Usertp.countDocuments({
      emailVerified: false,
    })

    /* =====================================================
       TOTAL AGENTS
    ===================================================== */

    const totalAgents = await Usertp.countDocuments({
      role: "Agent",
    })

    /* =====================================================
       TOTAL LANDLORDS
    ===================================================== */

    const totalLandlords = await Usertp.countDocuments({
      role: "landlord",
    })

    /* =====================================================
       TOTAL PROPERTY OWNERS
    ===================================================== */

    const totalPropertyOwners = await Usertp.countDocuments({
      role: "property-owner",
    })

    /* =====================================================
       TOTAL ADMINS
    ===================================================== */

    const totalAdmins = await Usertp.countDocuments({
      role: "Admin",
    })

    /* =====================================================
       TOTAL PROPERTIES
    ===================================================== */

    const totalProperties = await Propert.countDocuments()

    /* =====================================================
       TOTAL ACTIVE PROPERTIES
    ===================================================== */

    const totalActiveProperties = await Propert.countDocuments({
      status: "approved",
    })

    /* =====================================================
       TOTAL SOLD PROPERTIES
    ===================================================== */

    const totalSoldProperties = await Propert.countDocuments({
      status: "sold",
    })

    /* =====================================================
       TOTAL PENDING PROPERTIES
    ===================================================== */

    const totalPendingProperties = await Propert.countDocuments({
      status: "draft",
    })

    /* =====================================================
       TOTAL FEATURED PROPERTIES
    ===================================================== */

    const totalFeaturedProperties = await Propert.countDocuments({
      featured: true,
    })

    /* =====================================================
       TOTAL USERS WITH PROPERTIES
    ===================================================== */

    const usersWithProperties = await Propert.distinct("userId")

    /* =====================================================
       USERS REGISTERED TODAY
    ===================================================== */

    const today = new Date()

    today.setHours(0, 0, 0, 0)

    const usersToday = await Usertp.countDocuments({
      createdAt: {
        $gte: today,
      },
    })

    /* =====================================================
       PROPERTIES POSTED TODAY
    ===================================================== */

    const propertiesToday = await Propert.countDocuments({
      createdAt: {
        $gte: today,
      },
    })

    /* =====================================================
       RESPONSE
    ===================================================== */

    res.status(200).json({
      success: true,

      data: {

        users: {
          totalUsers,
          totalVerifiedUsers,
          totalUnverifiedUsers,
          usersToday,
        },

        roles: {
          totalAgents,
          totalLandlords,
          totalPropertyOwners,
          totalAdmins,
        },

        properties: {
          totalProperties,
          totalActiveProperties,
          totalSoldProperties,
          totalPendingProperties,
          totalFeaturedProperties,
          propertiesToday,
          usersWithProperties: usersWithProperties.length,
        },

      },

    })

  } catch (error) {

    console.log(error)

    res.status(500).json({
      success: false,
      message: "Server error",
    })

  }
}

export const getAdminProperties = async (req, res) => {
  try {

    let {
      search,
      type,
      purpose,
      category,
      status,
      state,
      city,
      minPrice,
      maxPrice,
      featured,
      page = 1,
      limit = 10,
      sort = "newest"
    } = req.query

    /* =========================================
       PAGINATION
    ========================================= */

    page = Number(page)
    limit = Number(limit)

    const skip = (page - 1) * limit

    /* =========================================
       FILTER
    ========================================= */

    const query = {}

    /* =========================================
       SEARCH
    ========================================= */

    if (search?.trim()) {

      query.$or = [

        {
          title: {
            $regex: search.trim(),
            $options: "i"
          }
        },

        {
          description: {
            $regex: search.trim(),
            $options: "i"
          }
        },

        {
          "location.state": {
            $regex: search.trim(),
            $options: "i"
          }
        },

        {
          "location.city": {
            $regex: search.trim(),
            $options: "i"
          }
        }

      ]
    }

    /* =========================================
       TYPE
    ========================================= */

    if (type) {
      query.type = type.toLowerCase()
    }

    /* =========================================
       PURPOSE
    ========================================= */

    if (purpose) {
      query.purpose = purpose.toLowerCase()
    }

    /* =========================================
       CATEGORY
    ========================================= */

    if (category) {
      query.category = category.toLowerCase()
    }

    /* =========================================
       STATUS
    ========================================= */

    if (status) {
      query.status = status
    }

    /* =========================================
       LOCATION
    ========================================= */

    if (state) {
      query["location.state"] = state
    }

    if (city) {
      query["location.city"] = city
    }

    /* =========================================
       FEATURED
    ========================================= */

    if (featured === "true") {
      query.featured = true
    }

    if (featured === "false") {
      query.featured = false
    }

    /* =========================================
       PRICE RANGE
    ========================================= */

    if (minPrice || maxPrice) {

      query["pricing.price"] = {}

      if (minPrice) {
        query["pricing.price"].$gte = Number(minPrice)
      }

      if (maxPrice) {
        query["pricing.price"].$lte = Number(maxPrice)
      }

    }

    /* =========================================
       SORT
    ========================================= */

    let sortOption = {}

    switch (sort) {

      case "price_asc":
        sortOption = {
          "pricing.price": 1
        }
        break

      case "price_desc":
        sortOption = {
          "pricing.price": -1
        }
        break

      case "oldest":
        sortOption = {
          createdAt: 1
        }
        break

      default:
        sortOption = {
          createdAt: -1
        }

    }

    /* =========================================
       GET PROPERTIES
    ========================================= */

    const properties = await Propert.aggregate([

      /* =========================================
         MATCH
      ========================================= */

      {
        $match: query
      },

      /* =========================================
         OWNER
      ========================================= */

      {
        $lookup: {
          from: "usertps",
          localField: "userId",
          foreignField: "_id",
          as: "owner"
        }
      },

      {
        $unwind: {
          path: "$owner",
          preserveNullAndEmptyArrays: true
        }
      },

      /* =========================================
         REMOVE SENSITIVE
      ========================================= */

      {
        $project: {
          "__v": 0,

          "owner.password": 0,
          "owner.refreshToken": 0,
          "owner.resetPasswordToken": 0,
          "owner.resetPasswordExpires": 0,
          "owner.emailVerificationToken": 0
        }
      },

      /* =========================================
         SORT
      ========================================= */

      {
        $sort: sortOption
      },

      /* =========================================
         PAGINATION
      ========================================= */

      {
        $skip: skip
      },

      {
        $limit: limit
      }

    ])

    /* =========================================
       TOTAL
    ========================================= */

    const totalProperties = await Propert.countDocuments(query)

    /* =========================================
       RESPONSE
    ========================================= */

    return res.status(200).json({
      success: true,

      pagination: {
        totalProperties,
        currentPage: page,
        totalPages: Math.ceil(totalProperties / limit),
        limit
      },

      results: properties.length,

      data: properties
    })

  } catch (error) {

    console.log(error)

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })

  }
}



export const updatePropertyStatus = async (req, res) => {
  try {

    const { propertyId } = req.params

    const {
      status,
      reason
    } = req.body

    /* =========================================
       VALID STATUS
    ========================================= */

    const validStatus = [
      "approved",
      "draft",
      "pending",
      "sold",
      "rented",
      "off_market",
      "verifying",
      "suspended"
    ]

    if (!validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      })
    }

    /* =========================================
       FIND PROPERTY
    ========================================= */

    const property = await Propert.findById(propertyId)
      .populate("userId")

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      })
    }

    const existingUser = property.userId

    /* =========================================
       UPDATE STATUS
    ========================================= */

    property.status = status

    /* =========================================
       SUSPENSION
    ========================================= */

    if (status === "suspended") {

      property.suspended = {
        isSuspended: true,
        reason: reason || "Violation detected",
        suspendedAt: new Date()
      }

      /* =========================================
         SEND EMAIL
      ========================================= */

      if (existingUser?.email) {

        await bravo_sendEmail({
          to: existingUser.email,

          subject: "Your Property Listing Has Been Blocked",

          html: propertyBlockedTemplate({
            userName: `${existingUser.firstName || ""} ${existingUser.lastName || ""}`,

            propertyTitle: property.title,

            reason: reason || "Violation detected",

            websiteName: "Abanise",

            websiteUrl: "https://truepeople.com"
          })
        })

      }

    } else {

      property.suspended = {
        isSuspended: false,
        reason: null,
        suspendedAt: null
      }

    }

    /* =========================================
       SAVE
    ========================================= */

    await property.save()

    /* =========================================
       RESPONSE
    ========================================= */

    return res.status(200).json({
      success: true,
      message: `Property ${status} successfully`,
      data: property
    })

  } catch (error) {

    console.log(error)

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    })

  }
}

