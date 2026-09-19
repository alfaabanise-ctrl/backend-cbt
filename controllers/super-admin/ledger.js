
/* ================================================================
 * GET MY LEDGER HISTORY
 * ================================================================ */

import mongoose from "mongoose";
import Ledger from "../../model/Ledger.js";
import Wallet from "../../model/Wallet.js";
import Usercbt from "../../model/Users.js";


/* ================================================================
 * SUPER ADMIN - GET ALL LEDGER HISTORY
 * ================================================================
 *
 * Shows ledger records for:
 *
 * ADMIN
 * TEACHER
 * PLATFORM
 *
 * Super Admin can filter by:
 *
 * search
 * ownerType
 * direction
 * status
 * entryType
 *
 * ================================================================ */

export const getAllLedgerHistory = async (
  req,
  res,
  next
) => {
  try {

    /* ============================================================
     * PAGINATION
     * ============================================================ */

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const skip =
      (page - 1) * limit;


    /* ============================================================
     * QUERY PARAMETERS
     * ============================================================ */

    const search =
      String(
        req.query.search || ""
      ).trim();


    const ownerType =
      String(
        req.query.ownerType || ""
      ).toUpperCase();


    const direction =
      String(
        req.query.direction || ""
      ).toUpperCase();


    const status =
      String(
        req.query.status || ""
      ).toUpperCase();


    const entryType =
      String(
        req.query.entryType || ""
      ).toUpperCase();


    /* ============================================================
     * BASE FILTER
     * ============================================================ */

    const filter = {};


    /* ============================================================
     * OWNER TYPE
     * ============================================================ */

    if (
      [
        "ADMIN",
        "TEACHER",
        "PLATFORM",
      ].includes(ownerType)
    ) {
      filter.ownerType =
        ownerType;
    }


    /* ============================================================
     * DIRECTION
     * ============================================================ */

    if (
      [
        "CREDIT",
        "DEBIT",
      ].includes(direction)
    ) {
      filter.direction =
        direction;
    }


    /* ============================================================
     * STATUS
     * ============================================================ */

    if (
      [
        "PENDING",
        "COMPLETED",
        "FAILED",
        "REVERSED",
        "CANCELLED",
      ].includes(status)
    ) {
      filter.status =
        status;
    }


    /* ============================================================
     * ENTRY TYPE
     * ============================================================ */

    if (
      [
        "COMMISSION",
        "REFERRAL_BONUS",
        "WITHDRAWAL",
        "PAYOUT",
        "REFUND",
        "REVERSAL",
        "ADJUSTMENT",
      ].includes(entryType)
    ) {
      filter.entryType =
        entryType;
    }


    /* ============================================================
     * SEARCH
     *
     * Search:
     *
     * reference
     * description
     * externalReference
     * ============================================================ */

    if (search) {

      const escaped =
        search.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      filter.$or = [
        {
          reference: {
            $regex:
              escaped,
            $options: "i",
          },
        },

        {
          description: {
            $regex:
              escaped,
            $options: "i",
          },
        },

        {
          externalReference: {
            $regex:
              escaped,
            $options: "i",
          },
        },
      ];
    }


    /* ============================================================
     * TOTAL
     * ============================================================ */

    const total =
      await Ledger.countDocuments(
        filter
      );


    /* ============================================================
     * LEDGER RECORDS
     * ============================================================ */

    let ledgerRecords =
      await Ledger.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean();


    /* ============================================================
     * GET OWNER INFORMATION
     *
     * Ledger.owner -> Usercbt
     * ============================================================ */

    const ownerIds =
      ledgerRecords
        .map(
          (ledger) =>
            ledger.owner
        )
        .filter(Boolean)
        .map(
          (id) =>
            String(id)
        );


    const uniqueOwnerIds =
      [
        ...new Set(
          ownerIds
        ),
      ];


    let owners = [];


    if (
      uniqueOwnerIds.length
    ) {

      owners =
        await Usercbt.find({
          _id: {
            $in:
              uniqueOwnerIds.map(
                (id) =>
                  new mongoose.Types.ObjectId(
                    id
                  )
              ),
          },
        })
          .select(
            "_id firstName middleName lastName email phone role avatar"
          )
          .lean();
    }


    /* ============================================================
     * OWNER MAP
     * ============================================================ */

    const ownerMap =
      new Map(
        owners.map(
          (owner) => [
            String(
              owner._id
            ),
            owner,
          ]
        )
      );


    /* ============================================================
     * ATTACH OWNER TO LEDGER
     * ============================================================ */

    ledgerRecords =
      ledgerRecords.map(
        (ledger) => ({
          ...ledger,

          ownerUser:
            ledger.owner
              ? ownerMap.get(
                  String(
                    ledger.owner
                  )
                ) || null
              : null,
        })
      );


    /* ============================================================
     * SUMMARY
     * ============================================================ */

    const [
      credits,
      debits,
      pending,
      completed,
      failed,
      reversed,
      cancelled,
    ] = await Promise.all([

      Ledger.countDocuments({
        ...filter,
        direction:
          "CREDIT",
      }),

      Ledger.countDocuments({
        ...filter,
        direction:
          "DEBIT",
      }),

      Ledger.countDocuments({
        ...filter,
        status:
          "PENDING",
      }),

      Ledger.countDocuments({
        ...filter,
        status:
          "COMPLETED",
      }),

      Ledger.countDocuments({
        ...filter,
        status:
          "FAILED",
      }),

      Ledger.countDocuments({
        ...filter,
        status:
          "REVERSED",
      }),

      Ledger.countDocuments({
        ...filter,
        status:
          "CANCELLED",
      }),

    ]);


    /* ============================================================
     * TOTAL CREDIT / DEBIT AMOUNTS
     *
     * Ledger amount is KOBO.
     * ============================================================ */

    const amountSummary =
      await Ledger.aggregate([
        {
          $match:
            filter,
        },

        {
          $group: {
            _id:
              "$direction",

            total:
              {
                $sum:
                  "$amount",
              },
          },
        },
      ]);


    let totalCreditAmount =
      0;

    let totalDebitAmount =
      0;


    for (
      const item
      of amountSummary
    ) {

      if (
        item._id ===
        "CREDIT"
      ) {
        totalCreditAmount =
          Number(
            item.total || 0
          );
      }


      if (
        item._id ===
        "DEBIT"
      ) {
        totalDebitAmount =
          Number(
            item.total || 0
          );
      }
    }


    /* ============================================================
     * RESPONSE
     * ============================================================ */

    return res.status(200).json({

      success: true,

      data: {

        ledgers:
          ledgerRecords,

        summary: {

          total,

          credits,

          debits,

          pending,

          completed,

          failed,

          reversed,

          cancelled,

          /*
           * Amounts are KOBO.
           */

          totalCreditAmount,

          totalDebitAmount,

          netAmount:
            totalCreditAmount -
            totalDebitAmount,
        },


        pagination: {

          page,

          limit,

          total,

          totalPages:
            Math.ceil(
              total / limit
            ) || 1,
        },
      },
    });

  } catch (error) {

    console.error(
      "GET ALL LEDGER HISTORY ERROR:",
      error
    );

    next(error);
  }
};