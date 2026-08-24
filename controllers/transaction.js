
import Wallet from "../model/Wallet.js";
import Ledger from "../model/Ledger.js";
import Usertp from '../model/Users.js'

import  WalletService  from "../service/WalletService.js"
const transformLedger = (ledger) => {

    const amount = ledger.amount / 100;

    let title = "";
    let subtitle = "";
    let icon = "";
    let direction = "";

    switch (ledger.category) {

        case "ESCROW_DEPOSIT":

            title = "Escrow Deposit";
            subtitle = "Payment for property";
            icon = "lock";
            direction = "out";
            break;

        case "ESCROW_RELEASE":

            if (ledger.type === "CREDIT") {

                title = "Escrow Released";
                subtitle = "Money received from escrow";
                icon = "wallet";
                direction = "in";

            } else {

                title = "Escrow Release";
                subtitle = "Escrow paid to seller";
                icon = "wallet";
                direction = "out";

            }

            break;

        case "ESCROW_REFUND":

            title = "Escrow Refund";
            subtitle = "Refund processed";
            icon = "arrow-uturn-left";
            direction = ledger.type === "CREDIT"
                ? "in"
                : "out";

            break;

        case "PROPERTY_PAYMENT":

            title = "Property Payment";
            subtitle = "Property purchase";
            icon = "home";
            direction = "out";
            break;

        case "WALLET_FUNDING":

            title = "Wallet Funding";
            subtitle = "Bank payment";
            icon = "banknotes";
            direction = "in";
            break;

        case "WITHDRAWAL":

            title = "Withdrawal";
            subtitle = "Money sent to bank";
            icon = "arrow-up";
            direction = "out";
            break;

        default:

            title = ledger.category;
            subtitle = ledger.description;
            direction = ledger.type === "CREDIT"
                ? "in"
                : "out";
    }

    return {

        id: ledger._id,

        reference: ledger.reference,

        transactionReference: ledger.transactionReference,

        title,

        subtitle,

        direction,

        amount,

        currency: ledger.currency,

        status: ledger.status,

        icon,

        createdAt: ledger.createdAt,

        property: ledger.order?.property?.title,

        orderNumber: ledger.order?.orderNumber

    };

};

export const getTransactions = async (req, res) => {
    console.log(req.user._id,);
    
    const wallet = await Wallet.findOne({

        owner: req.user._id,
        ownerType: "USER"

    });
    console.log(wallet, 'wallet');
    
    if (!wallet) {

        return res.json({
            success: true,
            transactions: []
        });

    }

    const ledgers = await Ledger.find({

        wallet: wallet._id

    })

    .populate({
        path: "order",
        populate: {
            path: "property",
            select: "title slug media"
        }
    })

    .sort({ createdAt: -1 });
 console.log(ledgers.map(transformLedger), 'ledgers.map(transformLedger)');
    return res.json({

        success: true,

        transactions: ledgers.map(transformLedger)

    });

};

export const getWalletDashboard = async (req, res) => {

    try {

        const data = await WalletService.getWalletDashboard(
            req.user._id
        );

        return res.json({
            success: true,
            data
        });

    } catch (err) {
                console.log();
                
        return res.status(400).json({
            success: false,
            message: err.message
        });

    }

};