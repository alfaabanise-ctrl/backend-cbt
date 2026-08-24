
const nodemailer = require('nodemailer');
const Virexscheme = require('../model/Users');
const jwt = require('jsonwebtoken');

const bcrypt = require('bcryptjs');
const notices = require("./emailSms")
const forgetPasswordTemplate = require("../template/forgetingtemplate")




const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const foundUser = await Virexscheme.findOne({ email }).exec();

    if (!foundUser) {
      return res.status(400).json({ message: "Email does not exist" });
    }

   
    const randomPassword = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the random password
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

   
    foundUser.password = hashedPassword;
    await foundUser.save();
const first_name = foundUser.full_name?.trim().split(" ")[1] || "";
    notices(foundUser.email, forgetPasswordTemplate(randomPassword, first_name, 'https://www.virex.codes/login') , 'Forget Password - Virex.com')
    res.status(200).json({success:" check your email for new passoword"})
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};



const resetPassword = async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(402);
  const refreshToken = cookies.jwt;
  
  const foundUser = await Virexscheme.findOne({ refreshToken }).exec();

  if (!foundUser) return res.sendStatus(403);

  const { full_name, currentpassword, newPassword } = req.body;
  console.log(full_name);
  
if(currentpassword) {
  if(!newPassword) return res.status(400).json({ message: "An error as occur" });
  if (foundUser) {
    const isOldPasswordCorrect = await bcrypt.compare(currentpassword, foundUser.password);
    if (!isOldPasswordCorrect) return res.status(401).json({ message: "Incorrect current password " });

    const hashedPwd = await bcrypt.hash(newPassword, 10);
    foundUser.password = hashedPwd
    foundUser.full_name = full_name

    await foundUser.save()
    
    return res.json({ success: "passwords reset sucesssful" })
  } else {
    return res
      .status(400)
      .json({ message: "usermane and password are require" });
  }
}
if(full_name) {
  foundUser.full_name = full_name;
await foundUser.save();

return res
.status(200)
.json({ message: "Your profile update successfully" });
};

return res.status(200).json({ message: "nothing update" });

}


const resetTransactionCode = async (req, res) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const refreshToken = cookies.jwt;
    const foundUser = await User.findOne({ refreshToken }).exec();

    if (!foundUser) {
      return res.status(403).json({ message: "User not found" });
    }

    const { newTransactionCode } = req.body;
    if (!newTransactionCode) {
      return res.status(400).json({ message: "Transaction code is required" });
    }

    if (newTransactionCode.length !== 4) {
      return res.status(400).json({ message: "Transaction code must be 4 digits" });
    }

    foundUser.transaction = newTransactionCode;
    await foundUser.save();

    console.log("Transaction code updated:", foundUser.email);
    return res.json({ message: "Transaction code reset successful" });
  } catch (error) {
    console.error("Error resetting transaction code:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


module.exports = { requestPasswordReset, resetPassword, resetTransactionCode }
