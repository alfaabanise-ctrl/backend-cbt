
import axios  from 'axios'


export const bravo_sendEmail = async ({to, subject, html, name = "User"}) => {
  try {
    // 🔒 validate required inputs
     if (!to || !subject || !html) {
      throw new Error('Missing required email fields')
    }

    const data = {
      sender: {
        name: "Abanise",
        email: process.env.BREVO_API_EMAIL // must be verified in Brevo
      },
      to: [
        {
          email: to,
          name
        }
      ],
      subject,
      htmlContent: html
    }

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      data,
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 20000 // ⏱ prevent hanging requests
      }
    )

    return {
      success: true,
      data: response.data
    }

  } catch (error) {
    console.error('Email Error:', error.response?.data || error.message)

    return {
      success: false,
      error: error.response?.data || error.message
    }
  }
}
