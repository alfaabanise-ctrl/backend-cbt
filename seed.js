import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./model/Users.js";

// ============================================================
// DATABASE
// ============================================================

const MONGO_URI =
  process.env.DATA_BASE || "mongodb://127.0.0.1:27017/turtoril";

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULT_PASSWORD = "Password123!";

const TOTAL_ADMINS = 10;
const TOTAL_TEACHERS = 50;
const TOTAL_STUDENTS = 400;

// ============================================================
// REAL NIGERIAN NAME POOL
Created Student 398: student398@demo.abanise.com (Teacher: teacher48@demo.abanise.com)
Created Student 399: student399@demo.abanise.com (Teacher: teacher49@demo.abanise.com)
Created Student 400: student400@demo.abanise.com (Teacher: teacher50@demo.abanise.com)

==========================================
        DEMO USERS CREATED
==========================================
Super Admin : 1
Admins      : 10
Teachers    : 50
Students    : 400
TOTAL       : 461
==========================================

Default password:
Password123!

Demo email pattern:
*@demo.abanise.com

Seeding completed successfully.
MongoDB connection closed.
// ============================================================

const FIRST_NAMES = [
  // Yoruba
  "Adewale", "Tunde", "Segun", "Gbenga", "Bola",
  "Funmilayo", "Yetunde", "Kemi", "Temitope", "Bukola",
  "Oluwaseun", "Damilola", "Adebayo", "Olawale", "Oladipo",
  "Ayodeji", "Babatunde", "Titilayo", "Abiodun", "Folake",
  "Adeola", "Olamide", "Tolulope", "Kikelomo", "Akinwale",
  "Feyisayo", "Ibilola", "Oluwakemi", "Ayomide", "Oluwadamilare",

  // Igbo
  "Chioma", "Emeka", "Ngozi", "Chinedu", "Ifeanyi",
  "Kelechi", "Uche", "Obinna", "Nneka", "Onyeka",
  "Chisom", "Ada", "Chukwuemeka", "Nkemdilim", "Ikenna",
  "Chidera", "Ezinne", "Ogechi", "Uchenna", "Amara",
  "Nnamdi", "Chiamaka", "Ebuka", "Ifeoma", "Okechukwu",

  // Hausa / Fulani
  "Aisha", "Ibrahim", "Amina", "Fatima", "Musa",
  "Halima", "Suleiman", "Zainab", "Yusuf", "Hauwa",
  "Aliyu", "Maryam", "Abubakar", "Rukayat", "Sadiq",
  "Bilkisu", "Umar", "Hafsat", "Bashir", "Aisha",
  "Ismail", "Jamila", "Sanusi", "Nafisa", "Abdulrahman",

  // Edo / Delta / Cross River
  "Efe", "Ese", "Oghenekaro", "Onome", "Ejiro",
  "Ovie", "Efosa", "Akpore", "Ogheneruona", "Odafe",

  // Christian / English
  "Blessing", "Peter", "Esther", "Samuel", "Grace",
  "Daniel", "Joy", "Michael", "Ruth", "David",
  "Deborah", "Paul", "Peace", "Emmanuel", "Gift",
  "Precious", "Favour", "Hope", "Victor", "Victoria",
  "Joshua", "Rebecca", "Caleb", "Naomi", "Elijah",
];

const MIDDLE_NAMES = [
  "Ade", "Chukwu", "Musa", "Ola", "Nne",
  "Ibrahim", "Olu", "Ebi", "Nkem", "Ayo",
  "Kelechi", "Fatima", "Ife", "Zainab", "Tunde",
  "Chi", "Emeka", "Aisha", "Bola", "Uche",
  "Obi", "Ngozi", "Sani", "Yinka", "Efe",
  "Olamide", "Chinedu", "Halima", "Funmi", "Idris",
  "Amaka", "Bashir", "Titilayo", "Ezinne", "Gbenga",
  "Ayomide", "Ifeoma", "Sadiq", "Oluchi", "Yusuf",
];

const LAST_NAMES = [
  // Yoruba
  "Adeyemi", "Balogun", "Adebayo", "Ogundipe", "Ogunleye",
  "Afolabi", "Oladipo", "Ojo", "Ajayi", "Adeleke",
  "Akintola", "Fashola", "Oyelaran", "Bamgbose", "Soyinka",
  "Akinwumi", "Ogunbiyi", "Lawal", "Adewumi", "Olabisi",

  // Igbo
  "Okafor", "Eze", "Okonkwo", "Nwosu", "Umeh",
  "Obi", "Nwachukwu", "Anyanwu", "Onyeka", "Chukwu",
  "Nnamani", "Okafor", "Obi", "Nwankwo", "Uzodinma",
  "Obi", "Okeke", "Eze", "Nwadike", "Igwe",

  // Hausa / Fulani
  "Musa", "Ibrahim", "Bello", "Abubakar", "Sani",
  "Danjuma", "Yakubu", "Aliyu", "Mohammed", "Usman",
  "Abdullahi", "Garba", "Shehu", "Umar", "Bala",
  "Idris", "Nuhu", "Suleiman", "Ahmed", "Buhari",

  // Edo / Delta / Cross River
  "Eghosa", "Omoregie", "Igbinedion", "Obaseki", "Okonjo",
  "Ovia", "Idugboe", "Eseka", "Akpata", "Edigin",

  // Christian / English
  "Okoro", "Chukwuma", "Ohaeri", "Uzo", "Anene",
];

// ============================================================
// HELPERS
// ============================================================

const pick = (arr, index) => arr[index % arr.length];

const makeName = (index) => ({
  firstName: pick(FIRST_NAMES, index),
  middleName: pick(MIDDLE_NAMES, index + 3),
  lastName: pick(LAST_NAMES, index + 7),
});

let phoneCounter = 1;

const nigerianPhone = () => {
  const prefixes = [
    "0803", "0806", "0703", "0903", "0810",
    "0814", "0906", "0913", "0705", "0805",
    "0802", "0808", "0701", "0708", "0812",
    "0815", "0816", "0704", "0706", "0902",
  ];

  const prefix = prefixes[phoneCounter % prefixes.length];
  const suffix = String(phoneCounter).padStart(7, "0");

  phoneCounter += 1;

  return `${prefix}${suffix}`;
};

// ============================================================
// CREATE USER HELPER (WITH HASHING)
// ============================================================

const createUser = async ({
  firstName,
  middleName = null,
  lastName,
  email,
  phone,
  role,

  createdBy = null,
  createdByRole = null,

  adminOwner = null,
  teacherOwner = null,

  password,
}) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  return User.create({
    firstName,
    middleName,
    lastName,
    email: email.toLowerCase(),
    phone,
    role,

    createdBy,
    createdByRole,

    adminOwner,
    teacherOwner,

    password: hashedPassword,

    emailVerified: true,
    emailVerificationToken: undefined,
    refreshToken: undefined,
    walletBalance: 0,
  });
};

// ============================================================
// SEED
// ============================================================

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected");

    // ========================================================
    // CLEAN EXISTING DEMO USERS
    // ========================================================

    await User.deleteMany({
      email: {
        $regex: "@demo\\.abanise\\.com$",
        $options: "i",
      },
    });

    console.log("Old demo users removed.");

    // ========================================================
    // SUPER ADMIN
    // ========================================================

    const superAdmin = await createUser({
      firstName: "System",
      middleName: "Main",
      lastName: "SuperAdmin",
      email: "superadmin@demo.abanise.com",
      phone: nigerianPhone(),
      role: "superadmin",
      password: DEFAULT_PASSWORD,
    });

    console.log(`Created Super Admin: ${superAdmin.email}`);

    // ========================================================
    // ADMINS
    // ========================================================

    const admins = [];

    for (let i = 1; i <= TOTAL_ADMINS; i++) {
      const { firstName, middleName, lastName } = makeName(i);

      const admin = await createUser({
        firstName,
        middleName,
        lastName,
        email: `admin${i}@demo.abanise.com`,
        phone: nigerianPhone(),
        role: "admin",

        createdBy: superAdmin._id,
        createdByRole: "superadmin",

        adminOwner: superAdmin._id,
        teacherOwner: null,

        password: DEFAULT_PASSWORD,
      });

      admins.push(admin);

      console.log(`Created Admin ${i}: ${admin.email}`);
    }

    // ========================================================
    // TEACHERS
    // Dynamically distributed across admins
    // ========================================================

    const teachers = [];

    for (let i = 1; i <= TOTAL_TEACHERS; i++) {
      const admin = admins[(i - 1) % admins.length];
      const { firstName, middleName, lastName } = makeName(i + 100);

      const teacher = await createUser({
        firstName,
        middleName,
        lastName,
        email: `teacher${i}@demo.abanise.com`,
        phone: nigerianPhone(),
        role: "teacher",

        createdBy: admin._id,
        createdByRole: "admin",

        adminOwner: admin._id,
        teacherOwner: null,

        password: DEFAULT_PASSWORD,
      });

      teachers.push(teacher);

      console.log(
        `Created Teacher ${i}: ${teacher.email} (Admin: ${admin.email})`
      );
    }

    // ========================================================
    // STUDENTS
    // Dynamically distributed across teachers
    // ========================================================

    const students = [];

    for (let i = 1; i <= TOTAL_STUDENTS; i++) {
      const teacher = teachers[(i - 1) % teachers.length];
      const { firstName, middleName, lastName } = makeName(i + 500);

      const student = await createUser({
        firstName,
        middleName,
        lastName,
        email: `student${i}@demo.abanise.com`,
        phone: nigerianPhone(),
        role: "student",

        createdBy: teacher._id,
        createdByRole: "teacher",

        adminOwner: teacher.adminOwner,
        teacherOwner: teacher._id,

        password: DEFAULT_PASSWORD,
      });

      students.push(student);

      console.log(
        `Created Student ${i}: ${student.email} (Teacher: ${teacher.email})`
      );
    }

    // ========================================================
    // SUMMARY
    // ========================================================

    const total = 1 + admins.length + teachers.length + students.length;

    console.log("");
    console.log("==========================================");
    console.log("        DEMO USERS CREATED");
    console.log("==========================================");
    console.log(`Super Admin : 1`);
    console.log(`Admins      : ${admins.length}`);
    console.log(`Teachers    : ${teachers.length}`);
    console.log(`Students    : ${students.length}`);
    console.log(`TOTAL       : ${total}`);
    console.log("==========================================");
    console.log("");
    console.log("Default password:");
    console.log(DEFAULT_PASSWORD);
    console.log("");
    console.log("Demo email pattern:");
    console.log("*@demo.abanise.com");
    console.log("");
    console.log("Seeding completed successfully.");
  } catch (error) {
    console.error("Seed error:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

// ============================================================
// RUN
// ============================================================

seedUsers();