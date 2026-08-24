import dotenv from "dotenv";
dotenv.config();
import Propert from "../model/Property.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import jwt from 'jsonwebtoken'; 
import mongoose from 'mongoose'
import slugify from "slugify"
import puppeteer from "puppeteer"
import PropertyOrder from "../model/PropertyOrder.js";
import OrderStatusService from "../service/OrderStatusService.js";



export const OrderEvidenImageUpload = async (req, res) => {
  try {
    const { id, type } = req.params;
    console.log('reach1', id, type);
    
    /*---------------------------------------
    Validate upload type
    ---------------------------------------*/
    const allowedTypes = [
      "buyerPhoto",
      "propertyPhoto",
      "agreementPhoto"
    ];
    console.log('reach2');
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid evidence type."
      });
    }
    console.log('reach3');
    /*---------------------------------------
    Validate image
    ---------------------------------------*/
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload an image."
      });
    }
    console.log('reach4',id);
    console.log(req.user._id);
    
    /*---------------------------------------
    Only buyer can upload evidence
    ---------------------------------------*/
    const order = await PropertyOrder.findOne({
      _id: id,
      buyer: req.user._id
    });
    console.log('reach5');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    /*---------------------------------------
    Buyer must have paid
    ---------------------------------------*/
    if (
      ![
        "FUNDED",
        "PARTIALLY_FUNDED",
        "HELD"
      ].includes(order.escrowStatus)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Inspection evidence can only be uploaded after payment has been successfully received."
      });
    }

    /*---------------------------------------
    Upload to Cloudinary
    ---------------------------------------*/
    const result = await uploadToCloudinary(req.file, type);
    console.log(result);
    console.log('reach7');
    const newImage = {
      url: result.secure_url,
      public_id: result.public_id,
      type
    };

    /*---------------------------------------
    Only one buyer photo
    ---------------------------------------*/
    if (type === "buyerPhoto") {
      order.inspectionEvidence = order.inspectionEvidence.filter(
        img => img.type !== "buyerPhoto"
      );
    }

    /*---------------------------------------
    Only one agreement photo
    ---------------------------------------*/
    if (type === "agreementPhoto") {
      order.inspectionEvidence = order.inspectionEvidence.filter(
        img => img.type !== "agreementPhoto"
      );
    }

    /*---------------------------------------
    Save new image
    ---------------------------------------*/
    order.inspectionEvidence.push(newImage);

    await order.save();
 
    /*---------------------------------------
    Return grouped data
    ---------------------------------------*/
    return res.status(200).json({
      success: true,
      message: "Inspection evidence uploaded successfully.",
      data: {
        buyerPhoto:
          order.inspectionEvidence.find(
            img => img.type === "buyerPhoto"
          ) || null,

        agreementPhoto:
          order.inspectionEvidence.find(
            img => img.type === "agreementPhoto"
          ) || null,

        propertyImages:
          order.inspectionEvidence.filter(
            img => img.type === "propertyPhoto"
          ),

        inspectionEvidence: order.inspectionEvidence
      }
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: err.message
    });
  }
};

export const getOrderEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id,'fddddd');
    
    const order = await PropertyOrder.findOne({
      _id: id,
      buyer: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    const inspectionEvidence = order.inspectionEvidence || [];

    const buyerPhoto =
      inspectionEvidence.find(
        img => img.type === "buyerPhoto"
      ) || null;

    const agreementPhoto =
      inspectionEvidence.find(
        img => img.type === "agreementPhoto"
      ) || null;

    const propertyImages =
      inspectionEvidence.filter(
        img => img.type === "propertyPhoto"
      );

    return res.status(200).json({
      success: true,
      data: {
        buyerPhoto,
        agreementPhoto,
        propertyImages,
        inspectionEvidence
      }
    });

  } catch (error) {
    console.error("ORDER EVIDENCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message
    });
  }
};

export const deleteOrderEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: imageId } = req.body;

    if (!imageId) {
      return res.status(400).json({
        success: false,
        message: "Image id is required."
      });
    }

    // Only the buyer can delete evidence
    const order = await PropertyOrder.findOne({
      _id: id,
      buyer: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    const image = order.inspectionEvidence.id(imageId);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Evidence image not found."
      });
    }

    // Delete from Cloudinary
    if (image.public_id) {
      await deleteFromCloudinary(image.public_id);
    }

    // Remove from MongoDB
    image.deleteOne();

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Evidence removed successfully.",
      data: {
        buyerPhoto:
          order.inspectionEvidence.find(
            img => img.type === "buyerPhoto"
          ) || null,

        agreementPhoto:
          order.inspectionEvidence.find(
            img => img.type === "agreementPhoto"
          ) || null,

        propertyImages:
          order.inspectionEvidence.filter(
            img => img.type === "propertyPhoto"
          ),

        inspectionEvidence: order.inspectionEvidence
      }
    });

  } catch (error) {
    console.error("DELETE EVIDENCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message
    });
  }
};




export const changeEscrowStatus = async (req, res) => {

    const session = await mongoose.startSession();

    try {

        await session.startTransaction();

        const { id, action } = req.params;

        const order = await PropertyOrder
            .findById(id)
            .populate("property")
            .session(session);

        if (!order) {
            throw new Error("Order not found.");
        }
        console.log(req.body.reason);
        
        const updatedOrder =
            await OrderStatusService.changeStatus({
                reason: req.body.reason,
                order,
                action,
                user: req.user,
                session

            });

        await session.commitTransaction();

        return res.status(200).json({

            success: true,
            message: `Escrow action '${action}' completed successfully.`,
            data: updatedOrder.toObject()

        });

    } catch (err) {

        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        return res.status(500).json({

            success: false,
            message: err.message

        });

    } finally {

        await session.endSession();

    }

};



export const getBuyerOrders = async (req, res) => {

    try {

        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.max(Number(req.query.limit) || 10, 1);

        const skip = (page - 1) * limit;

        const {
            search = "",
            status = "",
            sort = "-createdAt"
        } = req.query;

        const filter = {

            buyer: req.user._id

        };

        if (status) {

            filter.escrowStatus = status;

        }

        /*------------------------------------
        Search Property
        ------------------------------------*/

        let propertyIds = [];

        if (search.trim()) {

            const properties = await Property.find({

                title: {

                    $regex: search,

                    $options: "i"

                }

            }).select("_id");

            propertyIds = properties.map(item => item._id);

            filter.property = {

                $in: propertyIds

            };

        }

        /*------------------------------------
        Total
        ------------------------------------*/

        const total = await PropertyOrder.countDocuments(filter);

        /*------------------------------------
        Orders
        ------------------------------------*/

        const orders = await PropertyOrder.find(filter)

            .populate({

                path: "property",

                select: "title slug media.images pricing location"

            })

            .populate({

                path: "seller",

                select: "firstName lastName profileImage phone"

            })

            .sort(sort)

            .skip(skip)

            .limit(limit);

        return res.status(200).json({

            success: true,

            orders,

            pagination: {

                page,

                limit,

                total,

                totalPages: Math.ceil(total / limit)

            }

        });

    }

    catch (err) {

        console.log(err);

        return res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

export const getOrders = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const {
      search = "",
      status = "",
      sort = "-createdAt",
      type = "all",
    } = req.query;

    const filter = {};

    /* ============================
       Incoming / Outgoing
    ============================ */

    switch (type) {
      case "in":
        // Orders placed on my properties
        filter.seller = req.user._id;
        break;

      case "out":
        // Orders I placed
        filter.buyer = req.user._id;
        break;

      case "all":
      default:
        filter.$or = [
          { buyer: req.user._id },
          { seller: req.user._id },
        ];
        break;
    }

    /* ============================
       Escrow Status
    ============================ */

    if (status) {
      filter.escrowStatus = status;
    }

    /* ============================
       Search
    ============================ */

    if (search.trim()) {
      const properties = await Property.find({
        title: {
          $regex: search,
          $options: "i",
        },
      }).select("_id");

      const propertyIds = properties.map((p) => p._id);

      const searchCondition = {
        $or: [
          {
            orderNumber: {
              $regex: search,
              $options: "i",
            },
          },
          {
            property: {
              $in: propertyIds,
            },
          },
        ],
      };

      if (filter.$or) {
        filter.$and = [
          {
            $or: filter.$or,
          },
          searchCondition,
        ];

        delete filter.$or;
      } else {
        Object.assign(filter, searchCondition);
      }
    }

    /* ============================
       Count
    ============================ */

    const total = await PropertyOrder.countDocuments(filter);

    /* ============================
       Orders
    ============================ */

    const orders = await PropertyOrder.find(filter)
      .populate({
        path: "property",
        select:
          "title slug media.images pricing location purpose type",
      })
      .populate({
        path: "buyer",
        select:
          "firstName lastName email phone profileImage",
      })
      .populate({
        path: "seller",
        select:
          "firstName lastName email phone profileImage",
      })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ============================
       Add Direction + Progress
    ============================ */

    const formattedOrders = orders.map((order) => {
      const totalAmount = Number(order.totalAmount || 0);
      const paidAmount = Number(order.amountPaid || 0);

      return {
        ...order,

        direction:
          String(order.buyer._id) === String(req.user._id)
            ? "OUT"
            : "IN",

        progress:
          totalAmount > 0
            ? Math.round((paidAmount / totalAmount) * 100)
            : 0,
      };
    });

    /* ============================
       Response
    ============================ */

    return res.status(200).json({
      success: true,

      orders: formattedOrders,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getOrdersAdmin = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const {
      search = "",
      status = "",
      sort = "-createdAt",
      buyer = "",
      seller = "",
      property = ""
    } = req.query;

    const filter = {};

    /* ==========================
       Filters
    ========================== */

    if (status) {
      filter.escrowStatus = status;
    }

    if (buyer) {
      filter.buyer = buyer;
    }

    if (seller) {
      filter.seller = seller;
    }

    if (property) {
      filter.property = property;
    }

    /* ==========================
       Search
    ========================== */

    if (search.trim()) {
      const properties = await Property.find({
        title: {
          $regex: search,
          $options: "i"
        }
      }).select("_id");

      const users = await User.find({
        $or: [
          {
            firstName: {
              $regex: search,
              $options: "i"
            }
          },
          {
            lastName: {
              $regex: search,
              $options: "i"
            }
          },
          {
            email: {
              $regex: search,
              $options: "i"
            }
          }
        ]
      }).select("_id");

      filter.$or = [
        {
          orderNumber: {
            $regex: search,
            $options: "i"
          }
        },
        {
          property: {
            $in: properties.map((p) => p._id)
          }
        },
        {
          buyer: {
            $in: users.map((u) => u._id)
          }
        },
        {
          seller: {
            $in: users.map((u) => u._id)
          }
        }
      ];
    }

    /* ==========================
       Count
    ========================== */

    const total = await PropertyOrder.countDocuments(filter);

    /* ==========================
       Orders
    ========================== */

    const orders = await PropertyOrder.find(filter)
      .populate({
        path: "property",
        select: "title slug media pricing purpose type location"
      })
      .populate({
        path: "buyer",
        select: "firstName lastName email phone avatar"
      })
      .populate({
        path: "seller",
        select: "firstName lastName email phone avatar"
      })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ==========================
       Progress
    ========================== */

    const formattedOrders = orders.map((order) => {
      const totalAmount = Number(order.totalAmount || 0);
      const paidAmount = Number(order.amountPaid || 0);

      return {
        ...order,
        progress:
          totalAmount > 0
            ? Math.round((paidAmount / totalAmount) * 100)
            : 0
      };
    });

    /* ==========================
       Response
    ========================== */

    return res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
