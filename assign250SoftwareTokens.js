
import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";

import Usercbt from "./model/Users.js";
import SoftwareToken from "./model/SoftwareToken.js";

dotenv.config();

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

// Number of students to randomly select
const MAX_TOKENS = 200;


/*
|--------------------------------------------------------------------------
| GENERATE RANDOM TOKEN
|--------------------------------------------------------------------------
|
| Example:
|
| 7KQ9-X4PM-82ZT-H6RW
|
| Characters that can easily be confused such as:
| 0, O, 1, I are removed.
|
|--------------------------------------------------------------------------
*/

function generateToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function part(length) {
    let result = "";

    for (let i = 0; i < length; i++) {
      const index = crypto.randomInt(0, chars.length);
      result += chars[index];
    }

    return result;
  }

  return `${part(4)}-${part(4)}-${part(4)}-${part(4)}`;
}


/*
|--------------------------------------------------------------------------
| GENERATE UNIQUE TOKEN
|--------------------------------------------------------------------------
*/

async function generateUniqueToken() {
  while (true) {
    const token = generateToken();

    const existingToken = await SoftwareToken.exists({
      token: token,
    });

    if (!existingToken) {
      return token;
    }
  }
}


/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

async function main() {
  try {
    console.log("");
    console.log("==============================================");
    console.log(" RANDOM STUDENT SOFTWARE TOKEN ASSIGNMENT");
    console.log("==============================================");
    console.log("");

    /*
    |--------------------------------------------------------------------------
    | CHECK DATABASE CONNECTION STRING
    |--------------------------------------------------------------------------
    */

    if (!process.env.DATA_BASE) {
      throw new Error(
        "DATA_BASE is missing from your .env file."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | CONNECT TO MONGODB
    |--------------------------------------------------------------------------
    */

    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.DATA_BASE);

    console.log("MongoDB connected successfully.");
    console.log("");


    /*
    |--------------------------------------------------------------------------
    | COUNT STUDENTS WITHOUT TOKENS
    |--------------------------------------------------------------------------
    */

    const availableStudents = await Usercbt.countDocuments({
      role: "student",

      $or: [
        {
          softwareToken: null,
        },
        {
          softwareToken: {
            $exists: false,
          },
        },
      ],
    });

    console.log(
      `Students without tokens: ${availableStudents}`
    );

    console.log(
      `Maximum students to select: ${MAX_TOKENS}`
    );

    console.log("");


    /*
    |--------------------------------------------------------------------------
    | NOTHING TO DO
    |--------------------------------------------------------------------------
    */

    if (availableStudents === 0) {
      console.log(
        "No students without software tokens were found."
      );

      return;
    }


    /*
    |--------------------------------------------------------------------------
    | DETERMINE HOW MANY STUDENTS TO SELECT
    |--------------------------------------------------------------------------
    |
    | If 500 students are available:
    |     randomly select 200
    |
    | If 100 students are available:
    |     select all 100
    |
    |--------------------------------------------------------------------------
    */

    const numberToPick = Math.min(
      MAX_TOKENS,
      availableStudents
    );

    console.log(
      `Randomly selecting ${numberToPick} student(s)...`
    );

    console.log("");


    /*
    |--------------------------------------------------------------------------
    | RANDOMLY SELECT STUDENTS
    |--------------------------------------------------------------------------
    |
    | $sample guarantees random selection.
    |
    |--------------------------------------------------------------------------
    */

    const students = await Usercbt.aggregate([
      {
        $match: {
          role: "student",

          $or: [
            {
              softwareToken: null,
            },
            {
              softwareToken: {
                $exists: false,
              },
            },
          ],
        },
      },

      {
        $sample: {
          size: numberToPick,
        },
      },

      {
        $project: {
          _id: 1,
          firstName: 1,
          middleName: 1,
          lastName: 1,
          email: 1,
          softwareToken: 1,
        },
      },
    ]);


    /*
    |--------------------------------------------------------------------------
    | VERIFY RANDOM SELECTION
    |--------------------------------------------------------------------------
    */

    if (!students.length) {
      console.log(
        "No students were selected."
      );

      return;
    }

    console.log(
      `Successfully selected ${students.length} random students.`
    );

    console.log("");
    console.log("----------------------------------------------");
    console.log("STARTING TOKEN ASSIGNMENT");
    console.log("----------------------------------------------");
    console.log("");


    /*
    |--------------------------------------------------------------------------
    | ASSIGN TOKENS
    |--------------------------------------------------------------------------
    */

    let assigned = 0;
    let skipped = 0;

    const results = [];


    for (const student of students) {

      /*
      |--------------------------------------------------------------------------
      | SAFETY CHECK
      |--------------------------------------------------------------------------
      |
      | Check again before creating the token.
      |
      | This protects against another process assigning a token
      | after the random selection was made.
      |
      |--------------------------------------------------------------------------
      */

      const currentStudent = await Usercbt.findOne({
        _id: student._id,

        role: "student",

        $or: [
          {
            softwareToken: null,
          },
          {
            softwareToken: {
              $exists: false,
            },
          },
        ],
      }).select(
        "_id firstName middleName lastName email softwareToken"
      );


      /*
      |--------------------------------------------------------------------------
      | STUDENT ALREADY GOT A TOKEN
      |--------------------------------------------------------------------------
      */

      if (!currentStudent) {
        skipped++;

        console.log(
          `SKIPPED: ${student.email} already has a token.`
        );

        continue;
      }


      /*
      |--------------------------------------------------------------------------
      | GENERATE UNIQUE TOKEN
      |--------------------------------------------------------------------------
      */

      const tokenValue =
        await generateUniqueToken();


      /*
      |--------------------------------------------------------------------------
      | CREATE SOFTWARE TOKEN
      |--------------------------------------------------------------------------
      */

      const token =
        await SoftwareToken.create({

          token: tokenValue,

          /*
          | Student who owns the token
          */
          owner: currentStudent._id,

          /*
          | Token is immediately active
          */
          status: "active",

          /*
          | Student who activated it
          */
          activatedBy: currentStudent._id,

          activatedAt: new Date(),

          /*
          | No expiration date
          */
          expiresAt: null,

          /*
          | No special feature restriction
          */
          features: [],

          /*
          | One device by default
          */
          deviceLimit: 1,

          deviceCount: 0,
        });


      /*
      |--------------------------------------------------------------------------
      | ATTACH TOKEN TO STUDENT
      |--------------------------------------------------------------------------
      |
      | The condition ensures that we do not overwrite
      | an existing token.
      |
      |--------------------------------------------------------------------------
      */

      const updateResult =
        await Usercbt.updateOne(
          {
            _id: currentStudent._id,

            role: "student",

            $or: [
              {
                softwareToken: null,
              },
              {
                softwareToken: {
                  $exists: false,
                },
              },
            ],
          },

          {
            $set: {
              softwareToken: token._id,
            },
          }
        );


      /*
      |--------------------------------------------------------------------------
      | UPDATE FAILED
      |--------------------------------------------------------------------------
      |
      | If another process assigned a token between our check
      | and update, delete the token we just created.
      |
      |--------------------------------------------------------------------------
      */

      if (updateResult.modifiedCount !== 1) {

        await SoftwareToken.deleteOne({
          _id: token._id,
        });

        skipped++;

        console.log(
          `SKIPPED: ${currentStudent.email} changed before assignment.`
        );

        continue;
      }


      /*
      |--------------------------------------------------------------------------
      | SUCCESS
      |--------------------------------------------------------------------------
      */

      assigned++;

      const studentName = [
        currentStudent.firstName,
        currentStudent.middleName,
        currentStudent.lastName,
      ]
        .filter(Boolean)
        .join(" ");


      results.push({
        studentId:
          currentStudent._id.toString(),

        studentName:
          studentName || "Student",

        email:
          currentStudent.email,

        token:
          tokenValue,
      });


      console.log(
        `[${assigned}/${students.length}] ` +
        `${studentName || "Student"} | ` +
        `${currentStudent.email} | ` +
        `${tokenValue}`
      );
    }


    /*
    |--------------------------------------------------------------------------
    | FINAL SUMMARY
    |--------------------------------------------------------------------------
    */

    console.log("");
    console.log("");
    console.log("==============================================");
    console.log(" TOKEN ASSIGNMENT COMPLETE");
    console.log("==============================================");

    console.log(
      `Students available: ${availableStudents}`
    );

    console.log(
      `Students randomly selected: ${students.length}`
    );

    console.log(
      `Tokens successfully assigned: ${assigned}`
    );

    console.log(
      `Students skipped: ${skipped}`
    );

    console.log("==============================================");
    console.log("");


    /*
    |--------------------------------------------------------------------------
    | PRINT GENERATED TOKENS
    |--------------------------------------------------------------------------
    */

    if (results.length > 0) {

      console.log("GENERATED TOKENS");
      console.log("----------------------------------------------");

      results.forEach((item, index) => {

        console.log(
          `${index + 1}. ` +
          `${item.studentName} | ` +
          `${item.email} | ` +
          `${item.token}`
        );

      });

      console.log("----------------------------------------------");
    }


    /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    */

    console.log("");
    console.log(
      "IMPORTANT: Save the generated token list securely."
    );

    console.log(
      "The tokens have been assigned to the selected students."
    );

    console.log("");
  }

  catch (error) {

    console.error("");
    console.error("==============================================");
    console.error(" TOKEN ASSIGNMENT FAILED");
    console.error("==============================================");

    console.error(error);

    console.error("");
    console.error(
      "No further students were processed after the error."
    );

    process.exitCode = 1;
  }

  finally {

    /*
    |--------------------------------------------------------------------------
    | CLOSE DATABASE CONNECTION
    |--------------------------------------------------------------------------
    */

    try {
      await mongoose.connection.close();

      console.log(
        "MongoDB connection closed."
      );

    } catch (closeError) {

      console.error(
        "Error closing MongoDB connection:",
        closeError
      );
    }
  }
}


/*
|--------------------------------------------------------------------------
| RUN SCRIPT
|--------------------------------------------------------------------------
*/

main();

