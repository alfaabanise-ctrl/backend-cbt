import mongoose from "mongoose";
import User from "./Users.js";
const { Schema } = mongoose;

/* ================= IMAGE SCHEMA ================= */
const ImageSchema = new Schema({
  url: { type: String, required: true },
  public_id: String,
  type: {
    type: String,
    enum: ['image', 'survey', 'titleDocs', 'ogimage'],
    default: 'image'
  }
}, { timestamps: true });

/* ================= OG-image SCHEMA ================= */
const OgImageSchema = new Schema({
  image: ImageSchema,
  previews_template: {
    type: String,
    default: ""
  }
});
/* ================= MAIN PROPERTY SCHEMA ================= */
const PropertSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "Usertp", required: true },

  title: { type: String, required: true, trim: true },
  description: String,

  type: { type: String, enum: ["land", "house","hostel"], required: true },
  purpose: { type: String, enum: ["sale", "rent"], required: true },
  category: { type: String, required: true },
  ogimage:OgImageSchema,
  pricing: {
  price: {
    type: Number,
    required: true
  },

  currency: {
    type: String,
    default: "NGN"
  },

  negotiable: {
    type: Boolean,
    default: false
  },

  paymentType: {
    type: String,
    enum: ["outright", "installment", "rent"],
    default: "outright"
  },

  // ✅ RENT (FLEXIBLE)
  rent: {
    duration: {
      value: {
        type: Number,   // e.g 1, 2, 6
        default: null
      },
      unit: {
        type: String,
        enum: ["day", "weekly", "monthly", "yearly"],
        default: null
      }
    }
  },

  // ✅ INSTALLMENT
  installment: {
    months: {
      type: Number,
      default: null
    },
    monthlyAmount: {
      type: Number,
      default: null
    }
  }
},

  location: {
    country: { type: String, default: "Nigeria" },
    state: String,
    lga: String,
    city: String,
    address: String,
    source: { type: String, enum: ["gps", "manual"], default: "gps" },
    geometry: {
      type: {
        type: String,
        enum: ["Point", "Polygon"]
      },
      coordinates: Array
    }
  },

  landDetails: {
    unit: { type: String, enum: ["plot", "hectare", "sqm", "acre"], default: "plot" },
    size: Number,
    quantity: { type: Number, default: 1 },
    totalSqm: Number,
  },

  houseDetails: { type: Object, default: null },
  hostelDetails: {
  school: {
    abbreviation: String,
    name: String
  },
  gender: String,
  name: String
},
  /* ✅ FIXED MEDIA */
  media: {
    files: { type: [ImageSchema], default: [] },
    video: String
  },


  suspended: {
  isSuspended: {
    type: Boolean,
    default: false
  },

  reason: {
    type: String,
    default: null
  },

  suspendedAt: {
    type: Date,
    default: null
  }
},

  features: [
    {
      key: {
        type: String,
        required: true
      },
      label: {
        type: String,
        required: true
      },
      icon: {
        type: String,
        required: true
      },
      value: {
        type: mongoose.Schema.Types.Mixed, // number | boolean
        required: true
      }
    }
  ],

  status: {
    type: String,
    enum: ["draft", "sold","approved", "verifing", "rented", "off_market", "suspended", "pending"],
    default: "draft"
  },
    slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  ownership: {
  listingType: {
    type: String,
    enum: ["owner", "agent"],
    default: 'owner'
  },

  ownerId: {
    type: Schema.Types.ObjectId,
    ref: "Usertp",
    default: null
  },

  agentId: {
    type: Schema.Types.ObjectId,
    ref: "Usertp",
    default: null
  },

  verifiedOwner: {
    type: Boolean,
    default: false
  }
},

}, { timestamps: true });




PropertSchema.index({
  title: "text",
  "location.address": "text",
  "location.city": "text",
  "location.state": "text",
  "location.lga": "text",
  "features.label":"text",
})

/* =========================================
   COMPOUND INDEXES
========================================= */

PropertSchema.index({
  type: 1,
  category: 1,
  purpose: 1,
  description: 1,
})

PropertSchema.index({
  "location.state": 1,
  "location.city": 1
})

PropertSchema.index({
  createdAt: -1
})


export default mongoose.model("Propert", PropertSchema);