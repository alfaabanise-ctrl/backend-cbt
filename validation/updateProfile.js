// validation/updateProfile.js

import { z } from "zod";

export const updateProfileSchema = z.object({

  /* ================= USER ================= */

  firstName: z.string().trim().min(2).max(50).optional(),

  middleName: z.string().trim().max(50).nullable().optional(),

  lastName: z.string().trim().min(2).max(50).optional(),

  avatar: z.string().url().nullable().optional(),

  avatar_public_id: z.string().nullable().optional(),

  ogImage: z.string().url().nullable().optional(),

  ogImage_public_id: z.string().nullable().optional(),

  authProvider: z.enum([
    "google",
    "email",
    "facebook",
    "apple"
  ]).optional(),

  email: z.string().email().optional(),

  phone: z
    .string()
    .regex(/^\d{11}$/, "Phone must be 11 digits")
    .optional(),

  whatsapp_no: z
    .string()
    .regex(/^\d{11}$/, "WhatsApp number must be 11 digits")
    .optional(),

  location: z.object({

    country: z.string().optional(),

    state: z.string().optional(),

    city: z.string().optional(),

    address: z.string().optional()

  }).optional(),

  roles: z.enum([
    "user",
    "Surveyor",
    "Owner",
    "Admin",
    "Agent",
    "Arc",
    "Architect",
    "Property Agent",
    "Senior Property Agent",
    "Property Manager",
    "Broker",
    "Agency Manager",
    "Independent Agent",
    "Mechanic",
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
    "Refrigeration Technician",
    "HVAC Technician",
    "Solar Installer",
    "Interior Designer",
    "Land Agent",
    "Property Consultant",
    "Real Estate Agent",
    "Contractor",
    "Builder",
    "Technician"
  ]).optional(),

  password: z.string().min(6).optional(),

  walletBalance: z.number().optional(),

  refreshToken: z.string().optional(),

  emailVerificationToken: z.string().optional(),

  emailVerified: z.boolean().optional(),

  resetPasswordExpires: z.coerce.date().nullable().optional(),

  googleId: z.string().nullable().optional(),

  resetPasswordToken: z.string().optional(),

  /* ================= OTHERS ================= */

  yearOfExperience: z.string().optional(),

  name: z.string().trim().optional(),

  about: z.string().max(5000).optional(),

  skills: z.array(

    z.object({

      name: z.string(),

      level: z.enum([
        "Beginner",
        "Intermediate",
        "Advanced"
      ])

    })

  ).optional(),

  workExperience: z.array(

    z.object({

      company: z.string().optional(),

      role: z.string().optional(),

      duration: z.string().optional(),

      description: z.string().optional()

    })

  ).optional(),

  nin: z
    .string()
    .regex(/^\d{11}$/, "NIN must be exactly 11 digits")
    .optional(),

  education: z.array(

    z.object({

      school: z.string().optional(),

      level: z.string().optional(),

      degree: z.string().optional(),

      year: z.string().optional()

    })

  ).optional(),

  languages: z.array(
    z.string()
  ).optional(),

  certificates: z.array(

    z.object({

      certificate: z.string().optional(),

      place: z.string().optional(),

      year: z.string().optional()

    })

  ).optional(),

  social_media: z.object({

    tiktok: z.string().url().optional(),

    facebook: z.string().url().optional(),

    instagram: z.string().url().optional(),

    whatsapp: z.string().optional(),

    youtube: z.string().url().optional()

  }).optional()

}).strict();