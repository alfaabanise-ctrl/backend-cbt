import jwt from 'jsonwebtoken';
import Usertp from '../model/Users.js';
;
import axios from 'axios';

// Protect routes
export const protect = async (req, res, next) => {
  let token;
 

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  else if (req.cookies && req.cookies.token) {

    token = req.cookies.jwt;

    if (!token) {
      token = req.cookies.jwt
    }

    
    
    
    

  }
  token = req.cookies.jwt 

 
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
 
  

  try {
    // First, try to verify as a JWT token (for local users)
    try {
      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRETY);
      decoded.id = decoded.id; // Ensure id is available at top level
      
      // If JWT is valid, find user by decoded.userId
      const user = await Usertp.findById(decoded.id);

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      // Check if user is active
      // if (user.status !== 'active') {
      //   return next(new ErrorResponse('User account is deactivated', 401));
      // }

      req.user = user;

      // const now = new Date();
      // if (!req.user.lastLogin || ((now - req.user.lastLogin) / (1000 * 60 * 60) > 1)) {
      //   req.user.lastLogin = now;
      //   await req.user.save({ validateBeforeSave: false });

       
      // }
     
      
      return next();
    } catch (jwtError) {
      // If JWT verification fails, try to verify as Google access token
      try {
        // Verify Google access token with Google's API
        const googleRes = await axios.get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
        );

        const googleData = googleRes.data;
        const googleEmail = googleData.email;
        const expires_in = googleData.expires_in;

        if (!googleEmail) {
          return next(new ErrorResponse('Invalid Google access token', 401));
        }

        // Check if token is expired
        if (parseInt(expires_in) <= 0) {
          return next(new ErrorResponse('Google access token has expired', 401));
        }

        // Find user by email and authProvider
        const user = await Usertp.findOne({
          email: googleEmail,
          authProvider: 'google'
        });

        if (!user) {
          return next(new ErrorResponse('Google user not found', 401));
        }

        // Check if user is active
        if (user.status !== 'active') {
          return next(new ErrorResponse('User account is deactivated', 401));
        }

        req.user = user;

        const now = new Date();
        if (!req.user.lastLogin || ((now - req.user.lastLogin) / (1000 * 60 * 60) > 1)) {
          req.user.lastLogin = now;
          await req.user.save({ validateBeforeSave: false });

         
        }

        return next();
      } catch (googleError) {
        logger.error(`Google token verification error: ${googleError.message}`);
        return next(new ErrorResponse('Invalid token', 401));
      }
    }
  } catch (err) {
    return res.status(401).json({message:err});
  }
};
export const admin = async (req, res, next) => {
  let token;
 

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  else if (req.cookies && req.cookies.token) {
  
    token = req.cookies.jwt;
    
   
    if (!token) {
      token = req.cookies.jwt
    }

    
    
    
    

  }
  token = req.cookies.jwt 

 
  if (!token) {
  
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
 
  

  try {
    // First, try to verify as a JWT token (for local users)
    try {
      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRETY);
      decoded.id = decoded.id; // Ensure id is available at top level
      
      // If JWT is valid, find user by decoded.userId
      const user = await Usertp.findById(decoded.id);

      if (!user) {

        
        return res.status(401).json({ message: 'User not found' });
      }
      
      // Check if user is active
      if (user.roles !== 'Admin') {
       
        
        return next(new ErrorResponse('Error', 402));
      }

      req.user = user;

      // const now = new Date();
      // if (!req.user.lastLogin || ((now - req.user.lastLogin) / (1000 * 60 * 60) > 1)) {
      //   req.user.lastLogin = now;
      //   await req.user.save({ validateBeforeSave: false });

       
      // }
     
      
      return next();
    } catch (jwtError) {
       
      // If JWT verification fails, try to verify as Google access token
      try {
        // Verify Google access token with Google's API
        const googleRes = await axios.get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
        );

        const googleData = googleRes.data;
        const googleEmail = googleData.email;
        const expires_in = googleData.expires_in;

        if (!googleEmail) {
          return next(new ErrorResponse('Invalid Google access token', 401));
        }

        // Check if token is expired
        if (parseInt(expires_in) <= 0) {
          return next(new ErrorResponse('Google access token has expired', 401));
        }

        // Find user by email and authProvider
        const user = await Usertp.findOne({
          email: googleEmail,
          authProvider: 'google'
        });

        if (!user) {
          return next(new ErrorResponse('Google user not found', 401));
        }

        // Check if user is active
        if (user.status !== 'active') {
          return next(new ErrorResponse('User account is deactivated', 401));
        }

        req.user = user;

        const now = new Date();
        if (!req.user.lastLogin || ((now - req.user.lastLogin) / (1000 * 60 * 60) > 1)) {
          req.user.lastLogin = now;
          await req.user.save({ validateBeforeSave: false });

         
        }

        return next();
      } catch (googleError) {
        logger.error(`Google token verification error: ${googleError.message}`);
        return next(new ErrorResponse('Invalid token', 401));
      }
    }
  } catch (err) {
    console.log('error hear');
    
    return res.status(401).json({message:err});
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
