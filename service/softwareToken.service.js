import crypto from "crypto";
import SoftwareToken from "../model/SoftwareToken.js";

const CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/*
|--------------------------------------------------------------------------
| Generate Random Block
|--------------------------------------------------------------------------
*/

const randomBlock = (length = 4) => {
  let result = "";

  for (let i = 0; i < length; i++) {
    const index = crypto.randomInt(
      0,
      CHARACTERS.length
    );

    result += CHARACTERS[index];
  }

  return result;
};

/*
|--------------------------------------------------------------------------
| Generate Software Token
|--------------------------------------------------------------------------
|
| Example:
| ABCD-7K9P-X2LM-Q8RT
|
*/

export const generateSoftwareToken = () => {
  return [
    randomBlock(),
    randomBlock(),
    randomBlock(),
    randomBlock(),
  ].join("-");
};

/*
|--------------------------------------------------------------------------
| Generate Software Token For User
|--------------------------------------------------------------------------
*/

export const generateSoftwareTokenforuser = async ({
  user,
  payment,
  features = [],
  expiresAt = null,
  deviceLimit = 1,
  session = null,
} = {}) => {

  /*
  |--------------------------------------------------------------------------
  | Validate User
  |--------------------------------------------------------------------------
  */

  if (!user?._id) {
    throw new Error("Owner account is required.");
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Unique Token
  |--------------------------------------------------------------------------
  */

  let token;

  while (true) {

    token = generateSoftwareToken();

    const existingToken =
      await SoftwareToken.exists({
        token,
      }).session(session);

    if (!existingToken) {
      break;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Create Token
  |--------------------------------------------------------------------------
  */

  const softwareToken =
    await SoftwareToken.create(
      [
        {
          token,

          // Account that owns the token
          owner: user._id,
          amount : payment.amount,  
          paymentReference: payment.txRef,
          // Token has not been used yet
          status: "unused",

          // Nobody has activated it yet
          activatedBy: null,

          activatedAt: null,

          expiresAt,

          features,

          deviceLimit,

          deviceCount: 0,
        },
      ],
      {
        session,
      }
    );

  /*
  |--------------------------------------------------------------------------
  | Return Token ID
  |--------------------------------------------------------------------------
  */

  return softwareToken[0]._id;
};