

const allowedRoles = {
  superadmin: ["admin", "teacher", "student"],
  admin: ["teacher", "student"],
  teacher: ["student"],
  student: []
};

export const validateUserCreation = async (
  creator,
  requestedRole
) => {

  // =========================================================
  // CREATOR CHECK
  // =========================================================

  if (!creator) {
    return {
      valid: false,
      status: 401,
      message: "Authentication required."
    };
  }

  // =========================================================
  // FILTER ROLES
  // =========================================================

  const creatorRole = String(
    creator.role || ""
  ).toLowerCase();

  const newUserRole = String(
    requestedRole || ""
  ).toLowerCase();
console.log(newUserRole,'newUserRole');

  const validRoles = [
    "superadmin",
    "admin",
    "teacher",
    "student"
  ];

  // =========================================================
  // VALIDATE NEW USER ROLE
  // =========================================================

  if (!validRoles.includes(newUserRole)) {
    return {
      valid: false,
      status: 400,
      message: "Invalid user role."
    };
  }

  // =========================================================
  // VALIDATE CREATOR ROLE
  // =========================================================

  if (!validRoles.includes(creatorRole)) {
    return {
      valid: false,
      status: 403,
      message: "Invalid creator role."
    };
  }

  // =========================================================
  // CHECK CREATION PERMISSION
  // =========================================================

  const canCreate =
    allowedRoles[creatorRole]?.includes(
      newUserRole
    );
    console.log(canCreate, ' canCreate');
    

  if (!canCreate) {
    return {
      valid: false,
      status: 403,
      message:
        `You are not allowed to create a ${newUserRole} account.`
    };
  }

  // =========================================================
  // OWNERSHIP
  // =========================================================

  let createdBy = creator._id;
  let createdByRole = creatorRole;

  let adminOwner = null;
  let teacherOwner = null;

  // =========================================================
  // SUPERADMIN
  // =========================================================

  if (creatorRole === "superadmin") {

    adminOwner = null;
    teacherOwner = null;
  }

  // =========================================================
  // ADMIN
  // =========================================================

  else if (creatorRole === "admin") {

    adminOwner = creator._id;
    teacherOwner = null;
  }

  // =========================================================
  // TEACHER
  // =========================================================

  else if (creatorRole === "teacher") {

    teacherOwner = creator._id;

    // Student inherits the teacher's admin
    adminOwner = creator.adminOwner || null;
  }

  // =========================================================
  // RETURN VALIDATION DATA
  // =========================================================

  return {
    valid: true,

    creatorRole,

    newUserRole,

    createdBy,

    createdByRole,

    adminOwner,

    teacherOwner
  };
};