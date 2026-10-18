import mongoose from "mongoose"

const connectDB = async () => {
  const uri = process.env.DATA_BASE

  if (!uri) {
    console.error("DATA_BASE is missing in your .env file")
    return
  }

  // Retry instead of killing the server, so port 5000 stays up
  // and answers 503 while the database is unreachable.
  while (true) {
    try {
      await mongoose.connect(uri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10000,
      })

      console.log("MongoDB connected successfully")

      // Only one worker should build indexes, otherwise every worker
      // does it at the same time. Remove this block if you prefer.
      if (process.env.SYNC_INDEXES === "true") {
        await mongoose.connection.syncIndexes()
        console.log("Indexes synced")
      }

      return
    } catch (err) {
      console.error("MongoDB connection error:", err.message)
      console.log("Retrying in 5 seconds...")
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

export default connectDB