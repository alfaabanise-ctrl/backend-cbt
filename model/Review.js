import mongoose from "mongoose";

const { Schema } = mongoose;

const ReviewSchema = new Schema(
{
    // Buyer writing the review
    buyer: {
        type: Schema.Types.ObjectId,
        ref: "Usertp",
        required: true,
        index: true
    },

    // Seller being reviewed
    seller: {
        type: Schema.Types.ObjectId,
        ref: "Usertp",
        required: true,
        index: true
    },

    // Property purchased
    property: {
        type: Schema.Types.ObjectId,
        ref: "Propert",
        required: true,
        index: true
    },

    // Completed order
    order: {
        type: Schema.Types.ObjectId,
        ref: "PropertyOrder",
        required: true,
        unique: true
    },

    /* ===========================
       Overall Rating
    =========================== */

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    /* ===========================
       What buyer liked
    =========================== */

    liked: {
        communication: {
            type: Boolean,
            default: false
        },

        propertyAccuracy: {
            type: Boolean,
            default: false
        },

        fastResponse: {
            type: Boolean,
            default: false
        },

        trustworthySeller: {
            type: Boolean,
            default: false
        }
    },

    /* ===========================
       Review
    =========================== */

    comment: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
    },

    /* ===========================
       Admin
    =========================== */

    status: {
        type: String,
        enum: [
            "VISIBLE",
            "HIDDEN",
            "REPORTED"
        ],
        default: "VISIBLE"
    },

    reportedCount: {
        type: Number,
        default: 0
    },

    adminNote: {
        type: String,
        default: ""
    }

},
{
    timestamps: true
});

ReviewSchema.index({
    seller: 1,
    createdAt: -1
});

ReviewSchema.index({
    property: 1,
    createdAt: -1
});



export default mongoose.model("Review", ReviewSchema);