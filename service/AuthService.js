import axios from 'axios'
import jwt from 'jsonwebtoken'
import Usertp from '../model/Users.js'

export default class AuthService {

  // =========================
  // GENERATE JWT
  // =========================
  static generateToken(userId) {
    return jwt.sign(
      { userId },
      process.env.ACCESS_TOKEN_SECRETY,
      { expiresIn: '1d' }
    )
  }

    static generateRefreshToken(userId) {
    return jwt.sign(
      { id:userId },
      process.env.REFRESH_TOKEN_SECRETY,
      { expiresIn: '1d' }
    )
  }


  // =========================
  // GOOGLE AUTH
  // =========================
  static async googleAuth(code) {

    try {

      // =========================
      // EXCHANGE CODE FOR TOKEN
      // =========================
      const tokenResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/google/callback`,
          grant_type: 'authorization_code'
        }
      )

      const { access_token } = tokenResponse.data

      // =========================
      // GET GOOGLE USER
      // =========================
      const profileResponse = await axios.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${access_token}`
          }
        }
      )

      const googleUser = profileResponse.data

      console.log(googleUser)

      const {
        id: googleId,
        email,
        given_name,
        family_name,
        picture
      } = googleUser

      // =========================
      // FIND USER
      // =========================
      let user = await Usertp.findOne({ email })
       let refreshToken;    
      // =========================
      // LOCAL ACCOUNT EXISTS
      // =========================
      if (user && user.authProvider === 'local') {
        throw new Error(
          'Email already registered with password login'
        )
      }

      // =========================
      // CREATE USER
      // =========================
      if (!user) {
        console.log(" new user")
        
        user = await Usertp.create({
          firstName: given_name,
          lastName: family_name,
          email,
          avatar: picture,
          authProvider: 'google',
          googleId,
         
          emailVerified: true,
          isActive: true
        })
         refreshToken = this.generateRefreshToken(user._id)
          user.refreshToken = refreshToken
          await user.save()
      } else {
           refreshToken = this.generateRefreshToken(user._id)
        // update google data
        user.googleId = googleId
        user.emailVerified = true
        user.refreshToken = refreshToken
        if(!user.avatar){
           user.avatar = picture
        }
         
        await user.save()
      }
     
      
      // =========================
      // CREATE JWT
      // =========================
      const accessToken = this.generateToken(user._id)
     

      return {
        user,
        accessToken,
        refreshToken
      }

    } catch (error) {

    

      throw new Error(
        error.response?.data?.error || error.message
      )
    }
  }
}