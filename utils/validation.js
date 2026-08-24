import Joi from 'joi';
import ErrorResponse from './errorResponse.js';

/**
 * Validation schemas using Joi
 */

// User registration schema
export const userRegistrationSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])')).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    }),
  phone: Joi.string().pattern(/^[+]?[1-9][\d]{0,15}$/).required(),
  role: Joi.string().valid('patient', 'doctor').default('patient'),
  dateOfBirth: Joi.date().max('now').optional(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer not to say').optional()
});

// User login schema
export const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Doctor profile schema
export const doctorProfileSchema = Joi.object({
  specialties: Joi.array().items(Joi.string()).min(1).required(),
  qualifications: Joi.array().items(
    Joi.object({
      degree: Joi.string().required(),
      institution: Joi.string().required(),
      year: Joi.number().integer().min(1950).max(new Date().getFullYear()).required(),
      proof: Joi.string().uri().required()
    })
  ).min(1).required(),
  licenseNumber: Joi.string().required(),
  practicingFrom: Joi.date().max('now').required(),
  bio: Joi.string().max(500).required(),
  languages: Joi.array().items(Joi.string()).min(1).required(),
  consultationFee: Joi.number().positive().required(),
  hospitalAffiliations: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      address: Joi.string().required(),
      position: Joi.string().required(),
      from: Joi.date().required(),
      to: Joi.date().optional(),
      current: Joi.boolean().default(false)
    })
  ).optional()
});

// Appointment schema
export const appointmentSchema = Joi.object({
  doctor: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  appointmentDate: Joi.date().min('now').required(),
  startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  type: Joi.string().valid('in-person', 'video', 'phone').required(),
  reasonForVisit: Joi.string().min(10).max(500).required(),
  symptoms: Joi.array().items(Joi.string()).optional()
});

// Medical record schema
export const recordSchema = Joi.object({
  patient: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  recordType: Joi.string().valid(
    'medical_history', 'prescription', 'lab_result',
    'imaging', 'vaccination', 'surgery', 'allergy', 'other'
  ).required(),
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().max(1000).optional(),
  date: Joi.date().max('now').required(),
  tags: Joi.array().items(Joi.string()).optional()
});

// Question schema
export const questionSchema = Joi.object({
  title: Joi.string().min(10).max(200).required(),
  body: Joi.string().min(20).max(2000).required(),
  category: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).max(5).optional(),
  visibility: Joi.string().valid('public', 'anonymous').default('public')
});

// Answer schema
export const answerSchema = Joi.object({
  body: Joi.string().min(20).max(2000).required()
});

// Message schema
export const messageSchema = Joi.object({
  content: Joi.string().min(1).max(1000).required(),
  attachments: Joi.array().items(
    Joi.object({
      fileName: Joi.string().required(),
      fileType: Joi.string().required(),
      fileSize: Joi.number().positive().required(),
      fileUrl: Joi.string().uri().required()
    })
  ).max(5).optional()
});

// Validation middleware factory
export const validateSchema = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return next(new ErrorResponse('Validation Error', 400, errorDetails));
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};
