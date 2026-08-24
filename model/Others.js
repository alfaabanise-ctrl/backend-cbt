import mongoose from "mongoose";

const { Schema } = mongoose;

const othersSchema = new Schema(
{
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
yearOfExperience: {
type: String,
default: "0"
},
    phone: {
    type: String,
    match: [/^\d{11}$/, "Phone must be 11 digits"],
  },
  name: {
     type: String,
    trim: true
  },

  about: {
    type: String,
    default: ""
  },

  skills: [
    {
      name: String,
      level: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"]
      }
    }
  ],

  workExperience: [
    {
      company: String,
      role: String,
      duration: String,
      description: String
    }
  ],
 
  nin: {
    type: String,
    unique: true,
    sparse: true,
    match: [/^\d{11}$/, "NIN must be exactly 11 digits"]
  },

  education: [
    {
      school: String,
      level: String,
      degree: String,
      year: String
    }
  ],
  languages: {
    type: [String], // 👈 important
    default: []
  },

  certificates: [
    {
      certificate: String,
      place: String,
      year: String
    }
  ],
  social_media: {
    tiktok: String,
    facebook: String,
    instagram: String,
    whatsapp: String,
    youtube: String,

  },

},
{ timestamps: true }
);

export default mongoose.model("Others", othersSchema);