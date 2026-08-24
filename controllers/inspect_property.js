import Inspection from "../model/Inspection.js";
import Property from "../model/Property.js";
import Usertp from "../model/Users.js";
import { renderOtpTemplateHtmlBeforeInspection } from "../template/verifyEmail.js";
import { inspectionRequestTemplate } from "../template/inspection_template.js";
import { bravo_sendEmail } from "../service/bravoemail.js";
export const bookInspection = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const {
      inspectionDate,
      inspectionTime,
      message,
      fullName,
      email,
      phone
    } = req.body;

    /* ==========================
       PROPERTY
    ========================== */

    const property = await Property.findById(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    if (property.status === "sold") {
      return res.status(400).json({
        success: false,
        message: "Property already sold"
      });
    }

    /* ==========================
       LOGGED IN USER
    ========================== */

    if (req.user) {
      if (property.userId.equals(req.user._id)) {
        return res.status(400).json({
          success: false,
          message: "You cannot book an inspection for your own property"
        });
      }
      const existingInspection =
        await Inspection.findOne({
          property: propertyId,
          buyer: req.user._id,
          status: {
            $in: ["pending", "approved"]
          }
        });

      if (existingInspection) {
        return res.status(400).json({
          success: false,
          message: "Inspection already booked"
        });
      }

      
      const inspection =
        await Inspection.create({
          property: property._id,
          seller: property.userId,
          buyer: req.user._id,
          phone: phone || req.user.phone,
          inspectionDate,
          inspectionTime,
          message
        });
       
        
        const seller = await Usertp.findById(property.userId)
     
        
      const emailRes = await bravo_sendEmail({
        to: seller.email,
        subject: "Inspection Notices",
        html: inspectionRequestTemplate(
          `${seller.firstName} ${seller.lastName}`,
          `${req.user.firstName} ${req.user.lastName}`,
          req.user.email,
          phone,
          property.title,
          `${property.location.state}, ${property.location.city} ${property.location.address}`,
          inspectionDate,
          inspectionTime,
          message,
          `${process.env.FRONTEND_BASE_URL}property/${property.slug}`




        )
      })
    
      
      return res.status(201).json({
        success: true,
        message: "Inspection booked successfully",
        inspection
      });
    }

    /* ==========================
       GUEST USER
    ========================== */

    if (
      !fullName ||
      !email ||
      !phone ||
      !inspectionDate ||
      !inspectionTime
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields are needed"
      });
    }

    const [firstName, ...lastNameParts] =
      fullName.trim().split(" ");

    const lastName =
      lastNameParts.join(" ") || "";

    let user;

    const existingUser =
      await Usertp.findOne({ email });
    
    
    if (existingUser) {

      if (existingUser.emailVerified) {

        return res.status(400).json({
          success: false,
          message:
            "Email already associated with an account. Please login to book inspection."
        });
      }
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      existingUser.emailVerificationToken = otp;
      await existingUser.save();
    

     

      const emailRes = await bravo_sendEmail({
        to: existingUser.email,
        subject: "Abanise Email Verification Code",
        html: renderOtpTemplateHtmlBeforeInspection({
          name: `${existingUser.firstName} ${existingUser.lastName}`,
          otp,
          expiryMinutes: 15
        })
      })

      return res.status(403).json({
        success: false,
        message: "Verify Your Email to Complete Inspection Booking. Verification code sent to email."
      });



    } else {


      const newuser = await Usertp.create({
        firstName,
        lastName,
        email,
        phone
      });

   
   
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    newuser.emailVerificationToken = otp;
    await newuser.save();
    
    const emailRes = await bravo_sendEmail({
      to: newuser.email,
      subject: "Abanise Email Verification Code",
      html: renderOtpTemplateHtmlBeforeInspection({
        name: `${newuser.firstName} ${newuser.lastName}`,
        otp,
        expiryMinutes: 15
      })
    })

 
    

      return res.status(403).json({
        success: false,
        message: "Verify Your Email to Complete Inspection Booking. Verification code sent to email."
      });

 }

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

export const bookInspections = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const users = await Usertp.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
   
    
    const userIds = users.map(user => user._id);

    const inspectionResult = await Inspection.deleteMany({});

    const userResult = await Usertp.deleteMany({
      _id: { $in: userIds }
    });

    return res.status(200).json({
      success: true,
      inspectionsDeleted: inspectionResult.deletedCount,
      usersDeleted: userResult.deletedCount
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getSellerInspections = async (req, res) => {
  try {
    const inspections = await Inspection.find({
      seller: req.user._id
    })
      .populate({
        path: "property",
        select: "title price avatar location status"
      })
      .populate({
        path: "buyer",
        select: "firstName avatar lastName  phone"
      })
      .sort({ createdAt: -1 });
      
      
    return res.status(200).json({
      success: true,
      count: inspections.length,
      inspections
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getOutgoingInspections = async (req, res) => {
  try {
  const inspections = await Inspection.find({
    buyer: req.user._id
  })
  .populate(
    'seller',
    'firstName lastName phone avatar'
  )
  .populate(
    'property',
    'title location status'
  )
  .sort({ createdAt: -1 });
     

      
    res.json({
      success: true,
      data: inspections
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const checkPropertyBook = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false, message: " Property Not FUnd"
      });
    }
   

    const existingInspection = await Inspection.findOne({
      property: propertyId,
      buyer: req.user._id,
      status: {
        $in: ["pending", "approved"]
      }
    });
    if (existingInspection) {


      return res.status(200).json({
        success: true,
        message: "Property is already booked.",
        IsBooked: true
      });
    } else {
      return res.status(200).json({
        success: true,
        message: "Property is available for booking.",
        isBooked: false
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}


export const updateInspectionStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "approved",
      "rejected",
      "completed",
      "cancelled"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const inspection = await Inspection.findById(id)
      .populate("property");

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: "Inspection not found"
      });
    }

    const isSeller =
      inspection.property.userId.toString() ===
      req.user._id.toString();

    const isBuyer =
      inspection.buyer.toString() ===
      req.user._id.toString();

    if (
      ["approved", "rejected", "completed"].includes(status) &&
      !isSeller
    ) {
      return res.status(403).json({
        success: false,
        message: "Only seller can perform this action"
      });
    }

    if (
      status === "cancelled" &&
      !isBuyer &&
      !isSeller
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    inspection.status = status;

    await inspection.save();

    return res.status(200).json({
      success: true,
      message: `Inspection ${status} successfully`,
      inspection
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};