const jwt = require("jsonwebtoken");
import Usertp from "../model/Users.js";

const verifyJWT = (req, res, next)=>{
    const authHeader = req.headers.authorization || req.headers.Authorization;
   

    const token = authHeader.split(' ')[1];
    jwt.verify(
        token,
        process.env.REFRESH_TOKEN_SECRETY,
        (err, decoded)=>{
            if(err) return res.sendStatus(403)
            req.email = decoded.email;
           const user =  Usertp.findOne({email: req.email}).exec();
          
            if(!user) return res.sendStatus(401);
             if(user){return res.sendStatus(200)}
        next()
        }
    )
}

module.exports= verifyJWT