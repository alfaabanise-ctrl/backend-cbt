import express from "express"
import {adminDashboardStats, updatePropertyStatus,  getAdminProperties, getallusers} from "../../controllers/admin.js"
import { protect, admin} from "../../middleware/auth.js";
const router = express.Router()


router.get("/dashboard", admin, adminDashboardStats)
router.get("/users", admin,   getallusers)
router.get("/properties",  admin,  getAdminProperties)



router.patch( "/property/status/:propertyId", updatePropertyStatus)
export default router


