import { User } from "../models/user.model.js";  // Importing User model
import httpStatus from "http-status"; // HTTP status codes for better readability
import bcrypt, {hash} from "bcrypt";// For password hashing and comparison
import crypto from "crypto";// For generating authentication tokens
import { Meeting } from "../models/meeting.model.js";

// login route controller
const login = async (req,res) =>{
    console.log("Headers:", req.headers);
    console.log("Raw Body:", req.rawBody);   // Debugging raw request body
    console.log("Parsed Body:", req.body);   // Expected JSON parsed body

    const { username, password } = req.body;

     // Check if both username and password are provided
    if(!username || !password){
        return res.status(400).json({message: "please Provide"});
    }

    try {
        // Find user by username in the database
        const user = await User.findOne({username});

       // If user does not exist, return 404
        if(!user){
            return res.status(httpStatus.NOT_FOUND).json({message : "user not found"});
        }
        // Compare the entered password with the hashed password stored in DB
        let isPasswordCorrect = await bcrypt.compare(password, user.password)
        if(isPasswordCorrect){
            // Generate a random authentication token (e.g., session-based auth)
            let token = crypto.randomBytes(20).toString("hex");

            // Store the token in the user document
            user.token = token;
            await user.save();
            
            // Return the token as a response
            return res.status(httpStatus.OK).json({token: token});
        }
         else{
            return res.status(httpStatus.UNAUTHORIZED).json({message: "Invalid Username or Password"})
        }
    } catch (error) {
        return res.status(500).json({message: `something went wrong ${error}`});
    }
}

// resgister route controller
const register = async(req,res) =>{
    const {name,username, password} = req.body;
    
    try {
        // Check if the user already exists
        const existingUser = await User.findOne({username});
        if(existingUser){
            return res.status(httpStatus.FOUND).json({message: "user already exists"});
        }

         // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password,10);

        // Create a new user instance
        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        // Save the new user to the database
        await newUser.save();

        res.status(httpStatus.CREATED).json({message: "user registered sucessfullly"})

    } catch (error) {
        res.json({message : `something went wrong ${error}`});
    }
} 

const getUserHistory = async (req, res) => {
    const { token } = req.query;

    try {
        const user = await User.findOne({ token: token });
        const meetings = await Meeting.find({ user_id: user.username })
        res.json(meetings)
    } catch (e) {
        res.json({ message: `Something went wrong ${e}` })
    }
}

const addToHistory = async (req, res) => {
    const { token, meeting_code } = req.body;

    try {
        const user = await User.findOne({ token: token });

        const newMeeting = new Meeting({
            user_id: user.username,
            meetingCode: meeting_code
        })
            
        await newMeeting.save();

        res.status(httpStatus.CREATED).json({ message: "Added code to history" })
    } catch (e) {
        res.json({ message: `Something went wrong ${e}` })
    }
}


export { login, register, getUserHistory, addToHistory }
