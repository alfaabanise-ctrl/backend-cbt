const Sms = require('../model/sms');
const axios = require('axios');
const User = require("../model/Users");

const verifyNumber = async (Phone_Number) => {


    
  const now = new Date();

  
  // fetch number record
  const activeNumber = await Sms.findOne({ Phone_Number, status: "ACTIVE" });
  console.log(activeNumber);
  if (!activeNumber) {
    return 'No Active Number Found';
  }
  

  // fetch user
  const user = await User.findOne({ email: activeNumber.email });
  if (!user) {
    return 'User Not Found';
  }

  try {
    const smsResponse = await axios.get(
      `https://api.pvapins.com/user/api/get_sms.php?customer=${process.env.PVAPIN}&number=${activeNumber.Phone_Number}&country=${activeNumber.Country}&app=${activeNumber.App}`
    );

    // extract status string (handle both object + plain string)
    const statusMsg =  smsResponse.data;
    const normalizedMsg = String(statusMsg).trim().toLowerCase();

    const errors = [
      "customer not found.",
      "number not found.",
      "you have not received any code yet.",
      "your balance is expired.",
      "error 102, check back later."
    ];

    if ((errors.some((e) => normalizedMsg.includes(e.toLowerCase())) || !smsResponse.data)) {
      // error branch
      console.log('number as error and no time for check');
      console.log(activeNumber.expireAt < now);
      
      if (activeNumber.expireAt < now) {
        // refund user
        user.walletBalance += activeNumber.Amount;
        await user.save();
        console.log('Number has expired and we have refunded user:', user.email);
        activeNumber.status = "REJECTED";
         await activeNumber.save();
      }
       console.log('number not expired and no message so we can refund the user');
    } else {
      console.log('Verification successful for number:', activeNumber);
      // success branch → store activation code if provided
      activeNumber.Activation_Code = smsResponse.data;
      activeNumber.status = "USED";
    }

    // always save updates
    await activeNumber.save();
    return activeNumber;

  } catch (err) {
    console.error("Error checking number", activeNumber.Phone_Number, err.message);
    throw err; // rethrow so caller knows there was an error
  }
};

module.exports = verifyNumber;
