import PaymentService from "../service/payment.service.js";
import Payment from "../model/payments.js";
import Usertp from "../model/Users.js";
import { bravo_sendEmail } from "../service/bravoemail.js";
import   PaystackService from "../service/paystack.service.js"



export const getBanks = async (req, res) => {

    try {

        const response = await PaystackService.getBanks()

        return res.status(200).json({

            success: true,
            banks: response.data

        })

    } catch (err) {

        return res.status(500).json({

            success: false,
            message: err.message

        })

    }

}

export const verifyBankAccount = async (req, res) => {

    try {

        const {

            accountNumber,
            bankCode

        } = req.body

        const response = await PaystackService.resolveAccountNumber({

            accountNumber,
            bankCode

        })

        return res.status(200).json({

            success: true,
            account: response.data

        })

    } catch (err) {

        return res.status(400).json({

            success: false,
            message: err.message

        })

    }

}


export const createPayout = async (req, res) => {

    try {

        const payout = await PayoutService.createPayout(
            req.user._id,
            req.body.amount
        );

        return res.status(201).json({
            success: true,
            message: "Withdrawal request submitted. we will contact you ",
            data: payout,
        });

    } catch (err) {

        return res.status(400).json({
            success: false,
            message: err.message,
        });

    }

};


