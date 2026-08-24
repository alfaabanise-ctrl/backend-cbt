
// Protect routes
/// it is a  unknown user , user, 
import jwt from 'jsonwebtoken';
import axios from 'axios';
import Usertp from '../model/Users.js';

export const inspectAuth = async (
  req,
  res,
  next
) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith(
        'Bearer '
      )
    ) {
      token =
        req.headers.authorization.split(
          ' '
        )[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    console.log(token,'auth token from inspectAuth middleware');
    
    // No token → continue as guest
    if (!token) {
      req.user = null;
      return next();
    }

    /* ==========================
       TRY LOCAL JWT
    ========================== */

    try {
      const decoded = jwt.verify(
        token,
        process.env.REFRESH_TOKEN_SECRETY
      );
      console.log(decoded, 'decoded token in inspectAuth middleware');
      const user =
        await Usertp.findById(
          decoded.id
        );

      if (user) {
        req.user = user;
      }

      return next();
    } catch (err) {
      console.log(
        "Invalid local token, trying Google"
      );
    }

    /* ==========================
       TRY GOOGLE TOKEN
    ========================== */

    try {
      const googleRes =
        await axios.get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
        );

      const user =
        await Usertp.findOne({
          email:
            googleRes.data.email,
          authProvider: "google"
        });

      if (user) {
        req.user = user;
      }

      return next();
    } catch (err) {
      console.log(
        "Invalid Google token"
      );

      // Treat as guest instead of blocking
      req.user = null;

      return next();
    }

  } catch (error) {
    console.error(error);

    // Allow guest access
    req.user = null;

    return next();
  }
};

// Grant access to specific roles
// export const authorize = (...roles) => {
//   return (req, res, next) => {
//     if (!req.user) {
//       return next(new ErrorResponse('Authentication required', 401));
//     }

//     if (!roles.includes(req.user.role)) {
//       return next(
//         new ErrorResponse(
//           `User role ${req.user.role} is not authorized to access this route`,
//           403
//         )
//       );
//     }
//     next();
//   };
// };

// Verify email before allowing certain actions
// export const verifiedOnly = asyncHandler(async (req, res, next) => {
//   if (!req.user) {
//     return next(new ErrorResponse('Authentication required', 401));
//   }

//   if (!req.user.emailVerified) {
//     return next(
//       new ErrorResponse('Email verification required to access this route', 403)
//     );
//   }
//   next();
// });

// Check if 2FA is required for the user
// export const check2FA = asyncHandler(async (req, res, next) => {
//   if (!req.user) {
//     return next(new ErrorResponse('Authentication required', 401));
//   }

//   if (req.user.twoFactorEnabled && !req.session.twoFactorVerified) {
//     return next(
//       new ErrorResponse('Two-factor authentication required', 403)
//     );
//   }
//   next();
// });
