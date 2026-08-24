import mongoose from "mongoose"

const connectDB = async () => {
  try {
    console.log(process.env.DATA_BASE);
    
    await mongoose.connect(process.env.DATA_BASE)
        // ✅ CREATE / UPDATE INDEXES
    await mongoose.connection.syncIndexes()
    console.log("MongoDB connected successfully")
  } catch (err) {
    console.error("MongoDB connection error:", err)
    process.exit(1)
  }
}

export default connectDB