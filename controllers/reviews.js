import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Review from "../model/Review.js";
import PropertyOrder from "../model/PropertyOrder.js";
import Usertp from "../model/Users.js";
import Others from "../model/Others.js";

export const createOrUpdateReview = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const userId = req.user._id;

        const {
            orderId,
            rating,
            liked,
            comment
        } = req.body;

        /* ==========================
           Find Order
        ========================== */

        const order = await PropertyOrder.findById(orderId).session(session);

        if (!order) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        /* ==========================
           Buyer Only
        ========================== */

        if (String(order.buyer) !== String(userId)) {
            await session.abortTransaction();

            return res.status(403).json({
                success: false,
                message: "Only the buyer can review this order."
            });
        }

        /* ==========================
           Order Completed
        ========================== */

        if (
            order.orderStatus !== "COMPLETED" &&
            order.escrowStatus !== "RELEASE_PENDING"
        ) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "You can only review after the order has been completed."
            });
        }

        /* ==========================
           Create or Update
        ========================== */

        let review = await Review.findOne({
            order: order._id
        }).session(session);

        if (review) {
            review.rating = rating;
            review.liked = liked;
            review.comment = comment;

            await review.save({ session });

        } else {

            review = await Review.create(
                [{
                    buyer: order.buyer,
                    seller: order.seller,
                    property: order.property,
                    order: order._id,
                    rating,
                    liked,
                    comment
                }],
                { session }
            );

            review = review[0];
        }

        /* ==========================
           Update Seller Rating
        ========================== */

        const stats = await Review.aggregate([
            {
                $match: {
                    seller: order.seller,
                    status: "VISIBLE"
                }
            },
            {
                $group: {
                    _id: "$seller",
                    averageRating: {
                        $avg: "$rating"
                    },
                    totalReviews: {
                        $sum: 1
                    }
                }
            }
        ]);

        await Others.findOneAndUpdate(
            {
              userId: order.seller
             },
            {
                averageRating:
                    stats.length > 0
                        ? Number(stats[0].averageRating.toFixed(1))
                        : 0,

                totalReviews:
                    stats.length > 0
                        ? stats[0].totalReviews
                        : 0
            },
            {
                session
            }
        );

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Review saved successfully.",
            review
        });

    } catch (err) {

        await session.abortTransaction();

        console.error(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    } finally {

        session.endSession();

    }
};

export const getReview = async (req, res) => {
  try {
    // const { orderId } = req.params;
    const id = req.params.id;
    const order = await PropertyOrder.findById(id)
      .populate({
        path: "seller",
        select: "firstName lastName avatar"
      })
      .populate({
        path: "property",
        select: "title slug media"
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    // Only buyer or seller can view
    if (
      String(order.buyer) !== String(req.user._id) &&
      String(order.seller._id) !== String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized."
      });
    }

    const review = await Review.findOne({
      order: order._id
    }).populate({
      path: "buyer",
      select: "firstName lastName avatar"
    });

    return res.status(200).json({
      success: true,
      review,
      seller: order.seller,
      property: order.property
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getReviews = async (req, res) => {
  try {
    const {
      sellerId,
      page = 1,
      limit = 10
    } = req.query;

    const filter = {};

    // If sellerId is provided use it
    if (sellerId) {
      filter.seller = sellerId;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const total = await Review.countDocuments(filter);

    const reviews = await Review.find(filter)
      .populate({
        path: "buyer",
        select: "firstName lastName avatar"
      })
      .populate({
        path: "property",
        select: "title slug media"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const stats = await Review.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: "$seller",
          averageRating: {
            $avg: "$rating"
          },
          totalReviews: {
            $sum: 1
          },
          five: {
            $sum: {
              $cond: [{ $eq: ["$rating", 5] }, 1, 0]
            }
          },
          four: {
            $sum: {
              $cond: [{ $eq: ["$rating", 4] }, 1, 0]
            }
          },
          three: {
            $sum: {
              $cond: [{ $eq: ["$rating", 3] }, 1, 0]
            }
          },
          two: {
            $sum: {
              $cond: [{ $eq: ["$rating", 2] }, 1, 0]
            }
          },
          one: {
            $sum: {
              $cond: [{ $eq: ["$rating", 1] }, 1, 0]
            }
          }
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",
      reviews,
      stats: stats[0] || {
        averageRating: 0,
        totalReviews: 0,
        five: 0,
        four: 0,
        three: 0,
        two: 0,
        one: 0
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
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



export const getReviewsBySeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller id."
      });
    }

    const filter = {
      seller: sellerId
    };

    /* =============================
       Count
    ============================== */

    const total = await Review.countDocuments(filter);

    /* =============================
       Reviews
    ============================== */

    const reviews = await Review.find(filter)
      .populate({
        path: "buyer",
        select: "firstName lastName avatar"
      })
      .populate({
        path: "property",
        select: "title slug type location media"
      })
      .populate({
        path: "order",
        select: "totalAmount orderNumber"
      })
      .sort({
        createdAt: -1
      })
      .skip(skip)
      .limit(limit)
      .lean();

    /* =============================
       Statistics
    ============================== */

    const [stats] = await Review.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(sellerId)
        }
      },
      {
        $group: {
          _id: null,

          averageRating: {
            $avg: "$rating"
          },

          totalReviews: {
            $sum: 1
          },

          five: {
            $sum: {
              $cond: [
                { $eq: ["$rating", 5] },
                1,
                0
              ]
            }
          },

          four: {
            $sum: {
              $cond: [
                { $eq: ["$rating", 4] },
                1,
                0
              ]
            }
          },

          three: {
            $sum: {
              $cond: [
                { $eq: ["$rating", 3] },
                1,
                0
              ]
            }
          },

          two: {
            $sum: {
              $cond: [
                { $eq: ["$rating", 2] },
                1,
                0
              ]
            }
          },

          one: {
            $sum: {
              $cond: [
                { $eq: ["$rating", 1] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",

      reviews,

      stats: stats || {
        averageRating: 0,
        totalReviews: 0,
        five: 0,
        four: 0,
        three: 0,
        two: 0,
        one: 0
      },

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

