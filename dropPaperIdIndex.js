import mongoose from "mongoose"
import "dotenv/config"

await mongoose.connect(process.env.DATA_BASE) // use whatever env var your app uses

const col = mongoose.connection.collection("cbt_papers")

console.log("Before:", (await col.indexes()).map((i) => i.name))

try {
  await col.dropIndex("paperId_1")
  console.log("Dropped paperId_1")
} catch (e) {
  console.log("Drop failed:", e.message)
}

console.log("After:", (await col.indexes()).map((i) => i.name))

await mongoose.disconnect()