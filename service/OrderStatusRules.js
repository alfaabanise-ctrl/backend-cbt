import WalletService from "./WalletService.js";

/* =====================================================
| Validators
===================================================== */

const Validators = {

    hasEscrow(order) {
        if (order.escrowAmount <= 0) {
            throw new Error("No escrow funds available.");
        }
    },

    fullyPaid(order) {
        if (order.remainingAmount > 0) {
            throw new Error("Buyer has not completed payment.");
        }
    },

    notFullyPaid(order) {
        if (order.remainingAmount <= 0) {
            throw new Error("Order is already fully paid.");
        }
    },

    paymentExists(order) {
        if (order.amountPaid <= 0) {
            throw new Error("No payment has been made.");
        }
    },

    releaseNotRequested(order) {

        
        if (order.metadata?.releaseRequestedAt) {
            throw new Error("Release has already been requested.");
        }
    },

    refundNotRequested(order) {
        console.log(order.metadata?.refundRequestedAt, 'refundNotRequestedssssss');
         console.log(order, 'refundNotRequested')
        
        if (order.metadata?.refundRequestedAt !== null) {
            // throw new Error("Refund has already been requested.");
        }
    }

};


/* =====================================================
| Escrow Rules
===================================================== */

export const ESCROW_RULES = {

    /*--------------------------------------------------*/
    NOT_FUNDED: {

        actions: {

            pay: {

                to: "PARTIALLY_FUNDED",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.notFullyPaid(order);

                },

                async execute({ order }) {

                    order.orderStatus = "ACTIVE";

                }

            }

        }

    },

    /*--------------------------------------------------*/
    PARTIALLY_FUNDED: {

        actions: {

            pay: {

                to: "FUNDED",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.fullyPaid(order);

                },

                async execute({ order }) {

                    order.paymentStatus = "FULLY_PAID";

                    order.orderStatus = "PAID";

                    order.paidAt = new Date();

                }

            },

            requestRefund: {

                to: "REFUND_PENDING",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.refundNotRequested(order);

                },

                async execute({ order }) {

                    order.metadata.refundRequestedAt = new Date();

                }

            },

            cancel: {

                to: "CANCELLED",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.refundNotRequested(order);

                },

                async execute({ order, reason }) {

                    order.metadata.refundRequestedAt = new Date();
                  order.reasoncancel = reason;
                  console.log(reason, ' reason ');
                   console.log( order.reasoncancel,'order resen');
                  
                },

                response: {

                    title: "Refund Request Submitted",

                    message:
                        "Your refund request has been received.",

                    description:
                        "The escrow team will investigate the issue and contact both parties before making a decision.",

                    nextStep:
                        "Please provide any photos, videos or supporting documents if requested.",

                    estimatedTime: "2-5 business days",

                    type: "info"

                }

            }

        }

    },

    /*--------------------------------------------------*/
    FUNDED: {

        actions: {

            requestRelease: {

                to: "RELEASE_PENDING",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.fullyPaid(order);

                    Validators.hasEscrow(order);

                    Validators.releaseNotRequested(order);

                },

                async execute({ order }) {

                    order.metadata.releaseRequestedAt = new Date();

                },

                response: {
                    description: "The escrow team will contact both buyer and seller to confirm that the property has been inspected and handed over.",
                    nextStep: "Funds will remain securely held until verification is complete.",
                    estimatedTime: "1-3 business days",
                    type: "success"
                }

            },

             cancel: {

                to: "CANCELLED",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.refundNotRequested(order);

                },

                async execute({ order, reason }) {

                    order.metadata.refundRequestedAt = new Date();
                  order.reasoncancel = reason;
                  console.log(reason, ' reason ');
                   console.log( order.reasoncancel,'order resen');
                  
                },

                response: {

                    title: "Refund Request Submitted",

                    message:
                        "Your refund request has been received.",

                    description:
                        "The escrow team will investigate the issue and contact both parties before making a decision.",

                    nextStep:
                        "Please provide any photos, videos or supporting documents if requested.",

                    estimatedTime: "2-5 business days",

                    type: "info"

                }

            },

            requestRefund: {

                to: "REFUND_PENDING",

                roles: ["buyer"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.refundNotRequested(order);

                },

                async execute({ order }) {

                    order.metadata.refundRequestedAt = new Date();

                },

                response: {

                    title: "Refund Request Submitted",

                    message:
                        "Your refund request has been received.",

                    description:
                        "The escrow team will investigate the issue and contact both parties before making a decision.",

                    nextStep:
                        "Please provide any photos, videos or supporting documents if requested.",

                    estimatedTime: "2-5 business days",

                    type: "info"

                }

            }

        }

    },

        /*--------------------------------------------------*/
    CANCELLED: {

        actions: {

            reactivate: {

               to: ({ order }) => {
                    return Number(order.remainingAmount) === 0
                        ? "FUNDED"
                        : "PARTIALLY_FUNDED"
                },

                roles: ["buyer"],

                validate({ order }) {

                   

                    Validators.hasEscrow(order);
                     Validators.releaseNotRequested(order);

                },

                async execute({ order }) {
                     console.log('action perform  other cancer reactivate');
                    order.reasoncancel = null;
                    // refundRequestedAt
                    order.metadata.releaseRequestedAt = null;
                    order.metadata.refundRejectedAt = null;
                    order.metadata.releaseRejectedAt = null;
                    order.metadata.refundRequestedAt = null;
                },

                response: {
                    description: "The escrow team will contact both buyer and seller to confirm that the property has been inspected and handed over.",
                    nextStep: "Funds will remain securely held until verification is complete.",
                    estimatedTime: "1-3 business days",
                    type: "success"
                }

            },

           

        }

    },


    /*--------------------------------------------------*/
    RELEASE_PENDING: {

        actions: {

            approveRelease: {

                to: "RELEASED",

                roles: ["admin"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.fullyPaid(order);

                },

                async execute({ order, session }) {

                    await WalletService.debitPlatformWallet({

                        order,

                        amount: order.escrowAmount,

                        category: "ESCROW_RELEASE",

                        reference: order.orderNumber,

                        description: "Escrow released",

                        session

                    });
                   
                    
                    await WalletService.creditUserWallet({

                        userId: order.seller,

                        order,

                        amount: order.escrowAmount,

                        category: "ESCROW_RELEASE",

                        reference: order.orderNumber,

                        description: "Escrow received",

                        session

                    });

                    order.amountPaid = order.totalAmount;

                    order.remainingAmount = 0;

                    order.escrowAmount = 0;

                    order.paymentStatus = "FULLY_PAID";

                    order.orderStatus = "COMPLETED";

                    order.releasedAt = new Date();

                    order.completedAt = new Date();

                }

            },

            rejectRelease: {

                to: "FUNDED",

                roles: ["admin"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                },

                async execute({ order }) {

                    order.metadata.releaseRejectedAt = new Date();

                },

                response: {

                    title: "Refund Request Rejected",

                    message:
                        "Your refund request was not approved.",

                    description:
                        "Based on the investigation, the transaction does not qualify for a refund.",

                    nextStep:
                        "You may appeal the decision by contacting customer support.",

                    type: "error"

                }

            },

            


        }

    },

    /*--------------------------------------------------*/
    REFUND_PENDING: {

        actions: {

            approveRefund: {

                to: "REFUNDED",

                roles: ["admin"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                    Validators.paymentExists(order);

                },

                async execute({ order, session }) {

                    await WalletService.debitPlatformWallet({

                        order,

                        amount: order.escrowAmount,

                        category: "ESCROW_REFUND",

                        reference: order.orderNumber,

                        description: "Escrow refund  ",

                        session

                    });

                    await WalletService.creditUserWallet({

                        userId: order.buyer,

                        order,

                        amount: order.escrowAmount,

                        category: "ESCROW_REFUND",

                        reference: order.orderNumber,

                        description: "Refund to buyer",

                        session

                    });

                    order.paymentStatus = "REFUNDED";

                    order.orderStatus = "CANCELLED";

                    order.remainingAmount = order.totalAmount;

                    order.escrowAmount = 0;

                    order.refundedAt = new Date();

                }

            },

            rejectRefund: {

                to: "FUNDED",

                roles: ["admin"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                },

                async execute({ order }) {

                    order.metadata.refundRejectedAt = new Date();

                }

            },

            cancelRefund: {

                 to: ({ order }) => {
                    return Number(order.remainingAmount) === 0
                        ? "FUNDED"
                         : "PARTIALLY_FUNDED"
                },

                roles: ["buyer"],

                validate({ order }) {

                    Validators.hasEscrow(order);

                },

                async execute({ order }) {
                        console.log('action perform ');
                        
                    order.metadata.releaseRequestedAt = null;
                    order.metadata.refundRejectedAt = null;
                    order.metadata.releaseRejectedAt = null;
                     order.metadata.refundRequestedAt = null;

                },

                response: {

                    title: "Refund cancel",

                    message:
                        "Your refund request was not approved.",

                    description:
                        "Based on the investigation, the transaction does not qualify for a refund.",

                    nextStep:
                        "You may appeal the decision by contacting customer support.",

                    type: "error"

                }

            }

        }

    },

    /*--------------------------------------------------*/
    RELEASED: {

        actions: {}

    },

    /*--------------------------------------------------*/
    REFUNDED: {

        actions: {}

    }

};