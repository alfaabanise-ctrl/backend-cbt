import { z } from "zod";

const imageSchema = z.object({
  url: z.string().url(),

  public_id: z.string().optional(),

  type: z.enum([
    "image",
    "survey",
    "titleDocs",
    "ogimage"
  ]).optional()
});

export const updatePropertySchema = z.object({

  title: z.string().min(5).max(150).optional(),

  description: z.string().min(20).optional(),

  type: z.enum([
    "land",
    "house",
    "hostel"
  ]).optional(),

  purpose: z.enum([
    "sale",
    "rent"
  ]).optional(),

  category: z.string().optional(),

  slug: z.string().optional(),

  status: z.enum([
    "draft",
    "sold",
    "approved",
    "verifing",
    "rented",
    "off_market",
    "suspended",
    "pending"
  ]).optional(),

  pricing: z.object({

    price: z.number().positive().optional(),

    currency: z.string().optional(),

    negotiable: z.boolean().optional(),

    paymentType: z.enum([
      "outright",
      "installment",
      "rent"
    ]).optional(),

    rent: z.object({

      duration: z.object({

        value: z.number().positive().optional(),

        unit: z.enum([
          "day",
          "weekly",
          "monthly",
          "yearly"
        ]).optional()

      }).optional()

    }).optional(),

    installment: z.object({

      months: z.number().positive().optional(),

      monthlyAmount: z.number().positive().optional()

    }).optional()

  }).optional(),

  location: z.object({

    country: z.string().optional(),

    state: z.string().optional(),

    lga: z.string().optional(),

    city: z.string().optional(),

    address: z.string().optional(),

    source: z.enum([
      "gps",
      "manual"
    ]).optional(),

    geometry: z.object({

      type: z.enum([
        "Point",
        "Polygon"
      ]).optional(),

      coordinates: z.array(z.number()).optional()

    }).optional()

  }).optional(),

  landDetails: z.object({

    unit: z.enum([
      "plot",
      "hectare",
      "sqm",
      "acre"
    ]).optional(),

    size: z.number().positive().optional(),

    quantity: z.number().positive().optional(),

    totalSqm: z.number().positive().optional()

  }).optional(),

  houseDetails: z.any().optional(),

  hostelDetails: z.object({

    school: z.object({

      abbreviation: z.string().optional(),

      name: z.string().optional()

    }).optional(),

    gender: z.string().optional(),

    name: z.string().optional()

  }).optional(),

  media: z.object({

    files: z.array(imageSchema).optional(),

    video: z.string().optional()

  }).optional(),

  suspended: z.object({

    isSuspended: z.boolean().optional(),

    reason: z.string().nullable().optional(),

    suspendedAt: z.coerce.date().nullable().optional()

  }).optional(),

  features: z.array(

    z.object({

      key: z.string(),

      label: z.string(),

      icon: z.string(),

      value: z.union([
        z.string(),
        z.number(),
        z.boolean()
      ])

    })

  ).optional(),

  ownership: z.object({

    listingType: z.enum([
      "owner",
      "agent"
    ]).optional(),

    ownerId: z.string().optional(),

    agentId: z.string().optional(),

    verifiedOwner: z.boolean().optional()

  }).optional()

}).strict();