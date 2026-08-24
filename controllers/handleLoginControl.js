// loginController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usertp from "../model/Users.js";
import { renderOtpTemplateHtml } from "../template/verifyEmail.js";
import { sendEmail } from "../service/emailService.js";
import {  bravo_sendEmail } from "../service/bravoemail.js";
import AuthService from '../service/AuthService.js'
export const handleLogin = async (req, res) => {
  const { authProvider } = req.params;
 
  
  try {
  if (authProvider === 'local') {
    const { emaillOrPhone, pwd } = req.body;
    if (!emaillOrPhone || !pwd) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const isPhoneNumber = /^\d+$/.test(emaillOrPhone);
    let foundUser;

    if (!isPhoneNumber) {
      foundUser = await Usertp.findOne({ email: emaillOrPhone }).exec();
    } else {
      foundUser = await Usertp.findOne({ phone: emaillOrPhone }).exec();
    }

    if (!foundUser) {
      return res.status(401).json({ message: "Invalid email or phone number" });
    }
  
    // Check email verification
      if (!foundUser.emailVerified || !foundUser.password) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        foundUser.emailVerificationToken = otp;
        await foundUser.save();
          const emailRes = await bravo_sendEmail({
                  to: foundUser.email,
                  subject: "Your Abanise Verification Code",
                  html: renderOtpTemplateHtml({
                    name: `${foundUser.firstName} ${foundUser.lastName}`,
                    otp,
                    expiryMinutes: 15
                  })
                })
        // Send OTP email (uncomment in production)
        // await sendEmail({
        //   to: foundUser.email,
        //   from: process.env.SENDGRID_SENDER,
        //   subject: "Your TruePeople Verification Code",
        //   html: renderOtpTemplateHtml({
        //     name: `${foundUser.firstName} ${foundUser.lastName}`,
        //     otp,
        //     expiryMinutes: 15,
        //   }),
        // });

        return res.status(403).json({
          success: true,
          message: "Email not verified. Verification code re-sent."
        });
      }
      
      // Compare password
      const match = await bcrypt.compare(pwd, foundUser.password);
      if (!match) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const roles = Object.values(foundUser.roles);

      // Generate access token
      const accessToken = jwt.sign(
        { UserInfo: { id: foundUser._id, roles } },
        process.env.ACCESS_TOKEN_SECRETY,
        { expiresIn: "1h" }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {id: foundUser._id },
        process.env.REFRESH_TOKEN_SECRETY,
        { expiresIn: "1d" }
      );

      // Save refresh token in DB
      foundUser.refreshToken = refreshToken;
      await foundUser.save();

      // Set HTTP-only cookie
        res.cookie('jwt', refreshToken, {
           httpOnly: true,
           secure: true, // localhost
           sameSite: 'none', // important
          maxAge: 24 * 60 * 60 * 1000,
          });

      //  res.cookie('jwt', refreshToken, {
      //       httpOnly: true,
      //       secure: process.env.NODE_ENV === 'production',
      //       sameSite: 'none',
      //       maxAge: 24 * 60 * 60 * 1000,
      //   });

      // Send access token
      res.status(200).json({ data: foundUser  });
  } else if (authProvider === 'google') {
                const redirect =  req.query.redirect || `${process.env.FRONTEND_BASE_URL}/search`;
                console.log(redirect, 'redirect url trhehjlasajlc salsdahlsjk awdjhasldjkah sjdhlasjk ');
     const googleOAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
                const params = new URLSearchParams({
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/google/callback`,
                    response_type: 'code',
                    scope: 'email profile',
                    access_type: 'offline',
                    prompt: 'consent',
                     state: redirect
                });
               
                
                
                const url = `${googleOAuthUrl}?${params.toString()}`;
              
                
                return res.status(200).json({ url });
  }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
};


export const googleCallback = async (req, res) => {
    try {
        const { code, state } = req.query;

        const result = await AuthService.googleAuth(code);
         result.refreshToken
        console.log( result.refreshToken);
        
        // Save refresh token in cookie
        res.cookie('jwt', result.refreshToken, {
           httpOnly: true,
           secure: true, // localhost
           sameSite: 'none', // important
          maxAge: 24 * 60 * 60 * 1000,
          });
          // for Prodduct
//           res.cookie('jwt', result.refreshToken, {
//     httpOnly: true,
//     secure: true,
//     sameSite: 'none',
//     maxAge: 24 * 60 * 60 * 1000,
// });
        // res.cookie('jwt', result.refreshToken, {
        //     httpOnly: true,
        //     secure: process.env.NODE_ENV === 'production',
        //     sameSite: 'none',
        //     maxAge: 24 * 60 * 60 * 1000,
        // });
        console.log(state);
        
        const redirectUrl = state || `${process.env.FRONTEND_BASE_URL}/search`
        // Redirect to frontend with access token
         return res.redirect(redirectUrl);

    } catch (error) {
        return res.redirect(
            `${process.env.FRONTEND_BASE_URL}user/?error=${encodeURIComponent(error.message)}`
        );
    }
};




export const updatePassword = async (req, res) => {
  try {
    const userId = req.user._id

    const foundUser = await Usertp.findById(userId).exec()

    if (!foundUser) {
      return res.status(404).json({
        message: "User not found"
      })
    }

    const { currentPassword, newPassword } = req.body

    // validate new password
    if (!newPassword) {
      return res.status(400).json({
        message: "New password is required"
      })
    }

    // if user already has password, verify old password
    if (foundUser.password) {
      if (!currentPassword) {
        return res.status(400).json({
          message: "Current password is required"
        })
      }

      const isOldPasswordCorrect = await bcrypt.compare(
        currentPassword,
        foundUser.password
      )

      if (!isOldPasswordCorrect) {
        return res.status(401).json({
          message: "Incorrect current password"
        })
      }
    }

    // hash new password
    const hashedPwd = await bcrypt.hash(newPassword, 10)

    // save password
    foundUser.password = hashedPwd

    await foundUser.save()

    return res.status(200).json({
      success: true,
      message: "Password reset successful"
    })
  } catch (error) {
    console.error("Password update error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    })
  }
}

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.jwt;

    if (!refreshToken) {
      return res.sendStatus(204); // No cookie
    }

    // Find the user by refresh token
    const user = await Usertp.findOne({ refreshToken });

    if (user) {
      user.refreshToken = "";
      await user.save();
    }

    // Clear the cookie
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.log(err);
    
    return res.status(500).json({
      success: false,
      message: "Logout failed",
      error: err.message,
    });
  }
};