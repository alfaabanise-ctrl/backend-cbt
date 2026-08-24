import mongoose from 'mongoose';
import colors from 'colors';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

dotenv.config({ path: './src/config/config.env' });

// Load models correctly
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import Record from '../models/Record.js';
import { Question } from '../models/Question.js';
import { Message, Conversation } from '../models/Message.js';
import Review from '../models/Review.js';
import Audit from '../models/Audit.js';

// ===== MongoDB Connection with Retry =====
const connectDB = async (retries = 5) => {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
    return conn;
  } catch (err) {
    console.error(`Connection attempt failed: ${err.message}`.red);
    if (retries > 0) {
      console.log(`Retrying connection... (${retries} attempts left)`.yellow);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    } else {
      console.error('Failed to connect to MongoDB'.red);
      process.exit(1);
    }
  }
};

// ===== Nigerian data helpers =====
const nigerianFirstNames = [
  'Chinedu',
  'Ngozi',
  'Ifeanyi',
  'Ada',
  'Emeka',
  'Tunde',
  'Yemi',
  'Aisha',
  'Bola',
  'Kemi',
  'Segun',
  'Hassan',
  'Oluwaseun',
  'Chika',
  'Blessing'
];
const nigerianLastNames = [
  'Okafor',
  'Balogun',
  'Abdullahi',
  'Eze',
  'Adeyemi',
  'Olawale',
  'Mohammed',
  'Ibrahim',
  'Okoye',
  'Ogunleye',
  'Ojo',
  'Adewale',
  'Olorunfemi'
];

function randomNigerianPhone() {
  const prefixes = ['080', '081', '070', '090', '091'];
  return (
    prefixes[Math.floor(Math.random() * prefixes.length)] +
    faker.number.int({ min: 10000000, max: 99999999 })
  );
}

function randomNigerianAddress() {
  const streets = [
    'Allen Avenue, Ikeja',
    'Herbert Macaulay Way, Yaba',
    'Ahmadu Bello Way, Victoria Island',
    'Adeniran Ogunsanya Street, Surulere',
    'Broad Street, Lagos Island',
    'Rumuola Road, Port Harcourt',
    'Aminu Kano Crescent, Wuse 2, Abuja'
  ];
  return streets[Math.floor(Math.random() * streets.length)];
}

// ===== Data generators =====
function generateUsers() {
  const users = [];

  // Admin
  users.push({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@medmeet.com',
    password: 'Admin123!',
    role: 'admin',
    phone: randomNigerianPhone(),
    emailVerified: true
  });

  // Doctors
  for (let i = 0; i < 10; i++) {
    users.push({
      firstName: faker.helpers.arrayElement(nigerianFirstNames),
      lastName: faker.helpers.arrayElement(nigerianLastNames),
      email: faker.internet.email(),
      password: 'Doctor123!',
      role: 'doctor',
      phone: randomNigerianPhone(),
      emailVerified: true
    });
  }

  // Patients
  for (let i = 0; i < 20; i++) {
    users.push({
      firstName: faker.helpers.arrayElement(nigerianFirstNames),
      lastName: faker.helpers.arrayElement(nigerianLastNames),
      email: faker.internet.email(),
      password: 'Patient123!',
      role: 'patient',
      phone: randomNigerianPhone(),
      emailVerified: true,
      dateOfBirth: faker.date.birthdate({ min: 18, max: 65, mode: 'age' }),
      gender: faker.helpers.arrayElement(['male', 'female'])
    });
  }
  return users;
}

function generateDoctors(userDocs) {
  return userDocs
    .filter((u) => u.role === 'doctor')
    .map((u) => ({
      user: u._id,
      specialties: faker.helpers.arrayElements(
        [
          'Cardiology',
          'Dermatology',
          'Pediatrics',
          'Orthopedics',
          'Psychiatry',
          'General Surgery'
        ],
        { min: 1, max: 2 }
      ),
      qualifications: [
        {
          degree: 'MBBS',
          institution: `${faker.company.name()} University, Nigeria`,
          year: faker.number.int({ min: 2005, max: 2015 }),
          proof: faker.internet.url()
        }
      ],
      licenseNumber: `NG${faker.number.int({ min: 100000, max: 999999 })}`,
      licenseVerified: true,
      verificationStatus: 'verified',
      practicingFrom: faker.date.past({ years: 10 }),
      bio: faker.lorem.sentences(2),
      languages: [
        'English',
        faker.helpers.arrayElement(['Hausa', 'Yoruba', 'Igbo'])
      ],
      consultationFee: faker.number.int({ min: 5000, max: 20000 }),
      availability: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday'
      ].map((day) => ({
        day,
        slots: [
          { startTime: '09:00', endTime: '10:00', isBooked: false },
          { startTime: '10:00', endTime: '11:00', isBooked: false }
        ]
      }))
    }));
}

function generateAppointments(doctorDocs, patientDocs) {
  return Array.from({ length: 20 }).map(() => {
    const doctor = faker.helpers.arrayElement(doctorDocs);
    const patient = faker.helpers.arrayElement(patientDocs);

    const appointmentDate = faker.date.soon({ days: 30 });
    const startHour = faker.number.int({ min: 9, max: 15 });
    const startTime = `${String(startHour).padStart(2, '0')}:00`;
    const endTime = `${String(startHour + 1).padStart(2, '0')}:00`;

    return {
      doctor: doctor._id,
      patient: patient._id,
      appointmentDate,
      startTime,
      endTime,
      reasonForVisit: faker.helpers.arrayElement([
        'Routine Check-up',
        'Fever and Headache',
        'Follow-up Consultation',
        'Chest Pain',
        'Skin Rash'
      ]),
      status: faker.helpers.arrayElement([
        'requested',
        'pending_payment',
        'confirmed',
        'completed',
        'cancelled',
        'rejected'
      ]),
      payment: {
        amount: faker.number.int({ min: 5000, max: 20000 }),
        status: faker.helpers.arrayElement([
          'pending',
          'completed',
          'refunded',
          'failed'
        ]),
        method: faker.helpers.arrayElement(['cash', 'card', 'transfer'])
      },
      notes: faker.lorem.sentences(2)
    };
  });
}

function generateRecords(users) {
  const patients = users.filter((u) => u.role === 'patient');
  const doctors = users.filter((u) => u.role === 'doctor');

  return Array.from({ length: 20 }).map(() => {
    const patient = faker.helpers.arrayElement(patients);
    const doctor = faker.helpers.arrayElement(doctors);

    return {
      patient: patient._id,
      uploadedBy: doctor._id,
      date: faker.date.past({ years: 2 }),
      title: faker.helpers.arrayElement([
        'Blood Test Result',
        'X-ray Report',
        'Prescription Note',
        'Lab Report',
        'Medical Certificate'
      ]),
      recordType: faker.helpers.arrayElement([
        'lab_result',
        'prescription',
        'x-ray',
        'medical_history'
      ]),
      notes: faker.lorem.sentences(2),
      prescriptions: faker.helpers.arrayElements(
        [
          'Paracetamol 500mg',
          'Amoxicillin 250mg',
          'Ibuprofen 400mg',
          'Vitamin C 1000mg',
          'Cough Syrup'
        ],
        { min: 1, max: 3 }
      )
    };
  });
}

function generateQuestions(userDocs) {
  return [
    {
      title: 'What are the signs of malaria?',
      body: 'I have been having fever and chills. Could this be malaria?',
      category: 'General Medicine',
      tags: ['malaria', 'fever', 'nigeria'],
      visibility: 'public',
      author: faker.helpers.arrayElement(
        userDocs.filter((u) => u.role === 'patient')
      )._id
    },
    {
      title: 'How to prevent typhoid?',
      body: 'I live in an area with frequent water contamination. How can I reduce my risk?',
      category: 'Public Health',
      tags: ['typhoid', 'prevention', 'water safety'],
      visibility: 'public',
      author: faker.helpers.arrayElement(
        userDocs.filter((u) => u.role === 'patient')
      )._id
    }
  ];
}

function generateConversations(users) {
  const conversations = [];

  // Generate some random conversations
  for (let i = 0; i < 5; i++) {
    const participant1 = faker.helpers.arrayElement(users);
    const participant2 = faker.helpers.arrayElement(
      users.filter((u) => u._id.toString() !== participant1._id.toString())
    );

    conversations.push({
      participants: [participant1._id, participant2._id],
      relatedTo: 'general'
    });
  }

  return conversations;
}

function generateMessages(conversations, users) {
  const messages = [];

  conversations.forEach((conv) => {
    const participants = conv.participants;

    // Generate 3 messages per conversation
    for (let i = 0; i < 3; i++) {
      const sender = faker.helpers.arrayElement(participants);

      messages.push({
        conversation: conv._id,
        sender,
        content: faker.lorem.sentence(),
        attachments: [],
        readBy: []
      });
    }
  });

  return messages;
}

// function generateReviews(users, appointmentDocs) {
//   const patients = users.filter((u) => u.role === "patient");
//   const doctors = users.filter((u) => u.role === "doctor");

//   return patients.map((patient) => {
//     const doctor = faker.helpers.arrayElement(doctors);
//     // Find an appointment between this patient and doctor
//     const appointment =
//       faker.helpers.arrayElement(
//         appointmentDocs.filter(
//           (appt) =>
//             appt.patient.toString() === patient._id.toString() &&
//             appt.doctor.toString() === doctor._id.toString()
//         )
//       ) || faker.helpers.arrayElement(appointmentDocs); // fallback if no matching appointment

//     return {
//       review: faker.lorem.paragraph(), // actual review text
//       rating: faker.number.int({ min: 3, max: 5 }),
//       patient: patient._id,
//       doctor: doctor._id,
//       appointment: appointment?._id, // use the found appointment or any random one
//       createdAt: faker.date.recent({ days: 30 }),
//     };
//   });
// }

// ... (keep all the initial imports and setup code the same until generateReviews)

// function generateReviews(users, appointmentDocs) {
//   // Only proceed if we have appointments
//   if (!appointmentDocs || appointmentDocs.length === 0) {
//     console.log(
//       "No appointments available - skipping review generation".yellow
//     );
//     return [];
//   }

//   const patients = users.filter((u) => u.role === "patient");
//   const doctors = users.filter((u) => u.role === "doctor");

//   // Only generate reviews for patients who actually have appointments
//   return patients
//     .filter((patient) => {
//       return appointmentDocs.some(
//         (appt) => appt.patient.toString() === patient._id.toString()
//       );
//     })
//     .map((patient) => {
//       // Find all appointments for this patient
//       const patientAppointments = appointmentDocs.filter(
//         (appt) => appt.patient.toString() === patient._id.toString()
//       );

//       // Select a random appointment for this patient
//       const appointment = faker.helpers.arrayElement(patientAppointments);

//       // Find the doctor from the selected appointment
//       const doctor = doctors.find(
//         (d) => d._id.toString() === appointment.doctor.toString()
//       );

//       return {
//         review: faker.lorem.paragraph(),
//         rating: faker.number.int({ min: 3, max: 5 }),
//         patient: patient._id,
//         doctor: doctor._id,
//         appointment: appointment._id,
//         createdAt: faker.date.recent({ days: 30 }),
//       };
//     });
// }
function generateReviews(users, appointmentDocs) {
  // Only proceed if we have appointments and users
  if (
    !appointmentDocs ||
    appointmentDocs.length === 0 ||
    !users ||
    users.length === 0
  ) {
    console.log(
      'No appointments or users available - skipping review generation'.yellow
    );
    return [];
  }

  const patients = users.filter((u) => u.role === 'patient');
  const doctors = users.filter((u) => u.role === 'doctor');

  // Return empty array if no patients or doctors
  if (patients.length === 0 || doctors.length === 0) {
    console.log(
      'No patients or doctors available - skipping review generation'.yellow
    );
    return [];
  }

  return patients
    .filter((patient) => {
      // Ensure patient has _id and has appointments
      return (
        patient._id &&
        appointmentDocs.some(
          (appt) =>
            appt.patient && appt.patient.toString() === patient._id.toString()
        )
      );
    })
    .map((patient) => {
      // Find all appointments for this patient
      const patientAppointments = appointmentDocs.filter(
        (appt) =>
          appt.patient && appt.patient.toString() === patient._id.toString()
      );

      // Skip if no appointments found
      if (patientAppointments.length === 0) return null;

      // Select a random appointment for this patient
      const appointment = faker.helpers.arrayElement(patientAppointments);

      // Find the doctor from the selected appointment
      const doctor = doctors.find(
        (d) =>
          d._id &&
          appointment.doctor &&
          d._id.toString() === appointment.doctor.toString()
      );

      // Skip if no valid doctor found
      if (!doctor || !doctor._id) return null;

      return {
        review: faker.lorem.paragraph(),
        rating: faker.number.int({ min: 3, max: 5 }),
        patient: patient._id,
        doctor: doctor._id,
        appointment: appointment._id,
        createdAt: faker.date.recent({ days: 30 })
      };
    })
    .filter((review) => review !== null); // Remove any null entries
}

// ===== Import Data =====
// const importData = async () => {
//   try {
//     console.log("Starting data import...".blue);
//     await connectDB();
//     await Promise.all([
//       User.deleteMany(),
//       Doctor.deleteMany(),
//       Appointment.deleteMany(),
//       Record.deleteMany(),
//       Question.deleteMany(),
//       Message.deleteMany(),
//       Review.deleteMany(),
//     ]);
//     console.log("Existing data cleared".green);

//     const userDocs = await User.create(generateUsers());
//     const doctorDocs = await Doctor.create(generateDoctors(userDocs));
//     const appointmentDocs = await Appointment.create(
//       generateAppointments(
//         doctorDocs,
//         userDocs.filter((u) => u.role === "patient")
//       )
//     );
//     const recordDocs = await Record.create(generateRecords(userDocs));
//     await Question.create(generateQuestions(userDocs));
//     // await Message.create(generateMessages(userDocs));
//     const conversationDocs = await Conversation.create(
//       generateConversations(userDocs)
//     );
//     await Message.create(generateMessages(conversationDocs, userDocs));

//     await Review.create(generateReviews(userDocs, appointmentDocs));

//     console.log(`Data Imported Successfully`.green);
//     console.log(
//       `Users: ${userDocs.length}, Doctors: ${doctorDocs.length}, Appointments: ${appointmentDocs.length}, Records: ${recordDocs.length}`
//     );
//     process.exit();
//   } catch (err) {
//     console.error("Error importing data".red, err);
//     process.exit(1);
//   }
// };

export const importData = async () => {
  try {
    console.log('Starting data import...'.blue);
    await connectDB();

    // Clear existing data
    await Promise.all([
      Review.deleteMany(),
      Message.deleteMany(),
      Conversation.deleteMany(),
      Question.deleteMany(),
      Record.deleteMany(),
      Appointment.deleteMany(),
      Doctor.deleteMany(),
      User.deleteMany()
    ]);
    console.log('Existing data cleared'.green);

    // Create users and doctors first
    const userDocs = await User.create(generateUsers());
    const doctorDocs = await Doctor.create(generateDoctors(userDocs));

    // Create appointments
    const patientDocs = userDocs.filter((u) => u.role === 'patient');
    const appointmentDocs = await Appointment.create(
      generateAppointments(doctorDocs, patientDocs)
    );

    // Only proceed with reviews if we have appointments
    if (appointmentDocs.length > 0) {
      const reviews = generateReviews(userDocs, appointmentDocs);
      if (reviews.length > 0) {
        await Review.create(reviews);
        console.log(`Created ${reviews.length} reviews`.green);
      }
    }

    // Create other data
    const recordDocs = await Record.create(generateRecords(userDocs));
    await Question.create(generateQuestions(userDocs));

    // Create conversations and messages
    const conversationDocs = await Conversation.create(
      generateConversations(userDocs)
    );
    await Message.create(generateMessages(conversationDocs, userDocs));

    console.log('Data Imported Successfully'.green);
    console.log(
      `Users: ${userDocs.length}, Doctors: ${doctorDocs.length}, Appointments: ${appointmentDocs.length}, Records: ${recordDocs.length}`
    );
    process.exit();
  } catch (err) {
    console.error('Error importing data'.red, err);
    process.exit(1);
  }
};
// ===== Delete Data =====
export const deleteData = async () => {
  try {
    console.log('Deleting all data...'.red);
    await connectDB();
    await Promise.all([
      User.deleteMany(),
      Doctor.deleteMany(),
      Appointment.deleteMany(),
      Record.deleteMany(),
      Question.deleteMany(),
      Message.deleteMany(),
      Conversation.deleteMany(),
      Review.deleteMany()
    ]);
    console.log('All data deleted'.green.inverse);
    process.exit();
  } catch (err) {
    console.error('Error deleting data'.red, err);
    process.exit(1);
  }
};

// ===== CLI Args =====
if (process.argv[2] === '-i') {
  importData();
} else if (process.argv[2] === '-d') {
  deleteData();
} else {
  console.log('Usage:');
  console.log('  Import data: node seeder.js -i');
  console.log('  Delete data: node seeder.js -d');
  process.exit();
}
