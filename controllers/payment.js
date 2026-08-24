// services/payment.service.js
import PaymentService from "../service/payment.service.js";
import Payment from "../model/payments.js";
import Propert from "../model/Property.js";
import { paymentEscrowNotificationTemplate } from "../template/payment.js";
import Usertp from "../model/Users.js";
import { bravo_sendEmail } from "../service/bravoemail.js";
export const createOrderPayment = async (req, res) => {

  try {
    console.log('pamentc1');

    const result = await PaymentService.createOrderPayment({
      totalPlot: req.body.totalPlot,
      buyer: req.user,
      propertyId: req.body.propertyId,
      amount: req.body.amount

    });
    console.log(" payment initialized successful");
    return res.status(200).json({

      success: true,

      message: "Payment initialized successfully.",

      data: result

    });

  } catch (err) {
    console.log(err);

    return res.status(400).json({

      success: false,

      message: err.message

    });

  }

};



import Wallet from "../model/Wallet.js";
import PropertyOrder from "../model/PropertyOrder.js";

//  async function initializePlatformWallet() {

//     const wallet = await Wallet.findOne({
//         ownerType: "PLATFORM"
//     });

//     if (wallet) {
//         console.log("Platform wallet already exists.");
//         return wallet;
//     }

//     const newWallet = await Wallet.create({
//         ownerType: "PLATFORM",
//         owner: null,
//         balance: 0,
//         currency: "NGN",
//         status: "ACTIVE"
//     });

//     console.log("Platform wallet created.");

//     return newWallet;
// }

// initializePlatformWallet()
export const verifyOrder = async (req, res) => {

  try {
    const ref = req.body.ref;
    const result = await PaymentService.verifyOrderPayment(ref);


    const property = await Propert.findById(result.property).populate("userId");

    const seller = property.userId;

    const buyer = await Usertp.findById(result.payer);

    const order = await PropertyOrder.findById(result.order);

    const emailRes = await bravo_sendEmail({
      to: property.userId.email,
      subject: "You've Received a New Property Payment (Held in Escrow)",
      html: paymentEscrowNotificationTemplate(
        `${seller.firstName} ${seller.lastName}`,
        `${buyer.firstName} ${buyer.lastName}`,
        result.creditAmount,
        order.escrowAmount,
        property.title,
        `${process.env.FRONTEND_BASE_URL}property/payment/${property.slug}`
      )
    })
    console.log(emailRes);

    return res.status(200).json({

      success: true,

      message: "Payment initialized successfully.",

      data: result

    });

  } catch (err) {
    console.log(err);

    return res.status(400).json({

      success: false,

      message: err.message

    });

  }

};

export const getTransactionbyProperty = async (req, res) => {
  try {
    console.log('getTransactionbyProperty');
    const { slug } = req.params;

    console.log(slug, 'slug');


    // Find all payments for this property
    const transactions = await Payment.find({
      property: slug,
      status: "SUCCESS",
      $or: [
        {

          payer: req.user._id,
        },
        {
          receiver: req.user._id,
        },
      ],
    })
      .populate("payer", "firstName lastName phone")
      .populate("receiver", "firstName lastName email")
      .populate("property", "title location")
      .sort({ createdAt: -1 });
    const wallet = await Wallet.findOne({
      ownerType: "PLATFORM"
    });
    return res.status(200).json({
      success: true,
      message: "Property transactions fetched successfully.",
      data: transactions,
      wallet: wallet,
    });


  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch property transactions."
    });
  }
};

export const getTransactionpayemt= async (req,res) => {
   try {


    // Find all payments for this property
    const transactions = await Payment.find({ status: "SUCCESS", payer: req.user._id,})
      .populate("property", "title location")
      .sort({ createdAt: -1 });
    const wallet = await Wallet.findOne({
      ownerType: "PLATFORM"
    });
    return res.status(200).json({
      success: true,
      message: "Property transactions fetched successfully.",
      data: transactions,
      wallet: wallet,
    });


  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch property transactions."
    });
  } 
}

export const verifyPendingPayments = async (req, res) => {
    try {
        console.log(
            "Starting pending payment verification..."
        );

        const result =
            await PaymentService.verifyAllPendingPayments();

        console.log(
            "Verification result:",
            result
        );

        return res.status(200).json({
            success: true,
            message:
                result?.message ||
                "Pending payment verification completed.",

            total:
                result?.total || 0,

            successful:
                result?.successful || 0,

            failed:
                result?.failed || 0,

            results:
                result?.results || []
        });

    } catch (error) {

        console.error(
            "Pending payment verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Failed to verify pending payments."
        });
    }
};
// verifyPendingPayments()
export const testPaymentConcurrency = async (req, res) => {

    try {

        const { txRef } = req.body;

        if (!txRef) {
            return res.status(400).json({
                success: false,
                message: "txRef is required"
            });
        }

        console.log(
            `Starting concurrency test for ${txRef}`
        );


        /*
        |--------------------------------------------------------------------------
        | Send 5 requests simultaneously
        |--------------------------------------------------------------------------
        */

        const results = await Promise.allSettled([

            PaymentService.verifyOrderPayment(txRef),

            PaymentService.verifyOrderPayment(txRef),

            PaymentService.verifyOrderPayment(txRef),

            PaymentService.verifyOrderPayment(txRef),

            PaymentService.verifyOrderPayment(txRef)

        ]);


        console.log(
            "Concurrency test completed."
        );


        return res.status(200).json({

            success: true,

            message:
                "Concurrency test completed.",

            results: results.map((result, index) => {

                if (result.status === "fulfilled") {

                    return {
                        request: index + 1,
                        status: "SUCCESS"
                    };

                }

                return {
                    request: index + 1,
                    status: "FAILED",
                    error: result.reason?.message
                };

            })

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

};