import mongoose from "mongoose";

const { Schema } = mongoose;

const Userscheme = new Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  middleName: {
    type: String,
    default:null
  },
    lastName: {
    type: String,
    default:null
  },
  avatar: {
    type: String,
    default: null
  },
  avatar_public_id: {
    type: String,
    default: null
  },
  ogImage: {
    type: String,
    default: null
  },
  ogImage_public_id: {
    type: String,
    default: null
  },

  lastName: {
    type: String,
    required: true,
    trim: true
  },
  authProvider: {
    type: String,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  whatsapp_no: {
    type: String,
    trim: true
  },

    location: {
    country: {
      type: String,
      default: "Nigeria"
    },
    state: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      default: ""
    },
    address: {
      type: String,
      default: ""
    },
  }, 
  roles: {
      type: String,
      default: "user",
       enum : ["user",
      "Surveyor",
      "Owner",
      "Admin",
      "Agent",
      "Arc",
      "Architect",
      'Property Agent',
      "Senior Property Agent",
      "Property Manager",
      "Broker",
      "Agency Manager",
      "Independent Agent",
      "Surveyor",
      "Mechanic",
      "Architect",
      "Bricklayer",
      "Agent",
      "Land Seller",
      "Civil Engineer",
      "Structural Engineer",
      "Building Engineer",
      "Site Supervisor",
      "Project Manager",
      "Electrician",
      "Plumber",
      "Carpenter",
      "Welder",
      "Mason",
      "Painter",
      "Tiler",
      "Bricklayer",
      "Refrigeration Technician",
      "HVAC Technician",
      "Solar Installer",
      "Interior Designer",
      "Land Agent",
      "Property Consultant",
      "Real Estate Agent",
      "Contractor",
      "Builder",
      "Technician"]
    },


    
  
  
  password: {
    type: String,
    
  },

  walletBalance: {
    type: Number,
    default: 0
  },
  refreshToken: {
    type: String,
    default: undefined
  },
  emailVerificationToken: {
    type: String,
    default: undefined
  },
  emailVerified: {
    type: Boolean,
    default: false
  }, 
resetPasswordExpires: {
  type: Date,
  default: null
},
googleId : {
  type: String,
  default: null,
},
  resetPasswordToken: String
}, {
  timestamps: true // automatically adds createdAt and updatedAt
});

// Export using ESM syntax
export default mongoose.model("Usertp", Userscheme);