import { ESCROW_RULES } from "./OrderStatusRules.js";
import PropertyOrder from "../model/PropertyOrder.js";

// class OrderStatusService {

//     /*-------------------------------------------------------
//     Determine who is performing the action
//     -------------------------------------------------------*/
//     static getActor(order, user) {

//         try {

//             if (user.roles === "Admin") {
//                 return "admin";
//             }
//             if (order.buyer.equals(user._id)) {
//                 return "buyer";
//             }

//             if (order.seller.equals(user._id)) {
//                 return "seller";
//             }

//             if (user.roles === "Admin") {
//                 return "admin";
//             }

//             return null;
//         } catch (error) {
//             throw new Error(error);
//         }
//     }

//     /*-------------------------------------------------------
//     Change Escrow Status
//     -------------------------------------------------------*/
//     static async changeStatus({ order, action, user, reason, session }) {
//         try {

//             console.log(reason,'reasondd');
            
//             /*------------------------------------
//             Current Escrow State
//             ------------------------------------*/

//             const state = ESCROW_RULES[order.escrowStatus];

//             if (!state) {
//                 throw new Error(
//                     `Unknown escrow status '${order.escrowStatus}'.`
//                 );
//             }
           

//             /*------------------------------------
//             Action Rule
//             ------------------------------------*/

//             const rule = state.actions[action];
          
//             if (!rule) {
//                 throw new Error(
//                     `Action '${action}' is not allowed while escrow is '${order.escrowStatus}'.`
//                 );
//             }

//             /*------------------------------------
//             Determine Actor
//             ------------------------------------*/

//             const actor = this.getActor(order, user, reason);
//             console.log(actor, "actor");

//             if (!actor) {
//                 throw new Error(
//                     "You are not part of this order."
//                 );
//             }

//             /*------------------------------------
//             Permission
//             ------------------------------------*/

//             if (!rule.roles.includes(actor)) {
//                 throw new Error(
//                     `${actor} cannot perform '${action}'.`
//                 );
//             }

//             /*------------------------------------
//             Validation
//             ------------------------------------*/

//             if (typeof rule.validate === "function") {

//                 await rule.validate({ order });
//                 console.log('validate other suvive', 'ffff');

//             }

//             /*------------------------------------
//             Change Escrow Status
//             ------------------------------------*/

//             const nextStatus =
//                 typeof rule.to === "function"
//                     ? rule.to({ order })
//                     : rule.to;

//             order.escrowStatus = nextStatus;

//             /*------------------------------------
//             Execute Business Logic
//             ------------------------------------*/

//             if (typeof rule.execute === "function") {

//                 await rule.execute({
//                     reason,
//                     order,
//                     user,
//                     actor,
//                     session

//                 });
//                 console.log(' execute', 'ffff');
//             }

//             /*------------------------------------
//             Save Changes
//             ------------------------------------*/

//             await order.save({ session });

//             console.log(order);
            
//             return order;
//         } catch (error) {

//             throw new Error(error);


//         }
//     }

// }

class OrderStatusService {

    /*-------------------------------------------------------
    Determine who is performing the action
    -------------------------------------------------------*/
    static getActor(order, user) {

        if (!order || !user) {
            return null;
        }

        // Admin
        if (
            user.roles === "Admin" ||
            user.roles?.includes?.("Admin")
        ) {
            return "admin";
        }

        // Buyer
        if (
            order.buyer &&
            order.buyer.toString() === user._id.toString()
        ) {
            return "buyer";
        }

        // Seller
        if (
            order.seller &&
            order.seller.toString() === user._id.toString()
        ) {
            return "seller";
        }

        return null;
    }


    /*-------------------------------------------------------
    Change Escrow Status
    -------------------------------------------------------*/
    static async changeStatus({
        order,
        action,
        user,
        reason,
        session
    }) {

        if (!order) {
            throw new Error("Order not found.");
        }

        if (!session) {
            throw new Error(
                "MongoDB session is required for order status changes."
            );
        }

        /*------------------------------------
        1. Determine Actor
        ------------------------------------*/

        const actor = this.getActor(order, user);

        if (!actor) {
            throw new Error(
                "You are not part of this order."
            );
        }


        /*------------------------------------
        2. Get Current State
        ------------------------------------*/

        const currentStatus = order.escrowStatus;

        const state = ESCROW_RULES[currentStatus];

        if (!state) {
            throw new Error(
                `Unknown escrow status '${currentStatus}'.`
            );
        }


        /*------------------------------------
        3. Find Action Rule
        ------------------------------------*/

        const rule = state.actions[action];

        if (!rule) {
            throw new Error(
                `Action '${action}' is not allowed while escrow is '${currentStatus}'.`
            );
        }


        /*------------------------------------
        4. Check Permission
        ------------------------------------*/

        if (!rule.roles.includes(actor)) {
            throw new Error(
                `${actor} cannot perform '${action}'.`
            );
        }


        /*------------------------------------
        5. Validate Business Rules
        ------------------------------------*/

        if (typeof rule.validate === "function") {

            await rule.validate({
                order,
                user,
                actor,
                reason,
                session
            });

        }


        /*------------------------------------
        6. Determine Next Status
        ------------------------------------*/

        const nextStatus =
            typeof rule.to === "function"
                ? rule.to({
                    order,
                    user,
                    actor,
                    reason
                })
                : rule.to;


        if (!nextStatus) {
            throw new Error(
                "Next escrow status is not defined."
            );
        }


        /*------------------------------------
        7. Execute Business Logic
        ------------------------------------*/

        if (typeof rule.execute === "function") {

            await rule.execute({
                reason,
                order,
                user,
                actor,
                session
            });

        }


        /*------------------------------------
        8. Atomic Status Update
        ------------------------------------
        
        IMPORTANT:

        Only update if escrowStatus is still
        the same status we originally read.

        This protects against:

        Request A:
        HELD -> RELEASE_PENDING

        Request B:
        HELD -> RELEASE_PENDING

        Only one request can succeed.
        ------------------------------------*/

        const updatedOrder =
            await PropertyOrder.findOneAndUpdate(

                {
                    _id: order._id,

                    // Concurrency check
                    escrowStatus: currentStatus
                },

                {
                    $set: {
                        escrowStatus: nextStatus
                    }
                },

                {
                    session,

                    new: true,

                    runValidators: true
                }
            );


        /*------------------------------------
        9. Detect Concurrent Modification
        ------------------------------------*/

        if (!updatedOrder) {

            throw new Error(
                "This order was already updated by another request. Please refresh and try again."
            );

        }


        /*------------------------------------
        10. Update Local Order Object
        ------------------------------------*/

        order.escrowStatus =
            updatedOrder.escrowStatus;


        return updatedOrder;
    }

}

export default OrderStatusService;

// export default OrderStatusService;