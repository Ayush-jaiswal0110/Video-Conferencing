import mongoose,{ Schema } from "mongoose";

// Define the schema for a user
const userSchema = new Schema (
    {
        name: {type: String, required: true}, // Full name of the user
        username: {type: String, required: true, unique:true},// Unique username for the user
        password: {type: String, required:true}, // Hashed password for authentication
        token: {type: String}, // Stores authentication token (if using JWT or session-based auth)
    }
)

const User = mongoose.model("User",userSchema);
export {User};