import express from "express";
import {createServer} from "node:http";

import {Server} from "socket.io";

import mongoose from "mongoose";
import connectToSocket from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js"

import cors from "cors";


const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port",(process.env.PORT || 8000));

// CORS Configuration
app.use(cors());

// Middleware
app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));

// Routes
app.use("/api/v1/users", userRoutes);

// Start Server & Database Connection
const start = async()=>{
    try{
        const connectionDb = await mongoose.connect("mongodb+srv://ayushjaiswalji6:sC0njnCSneNb89zM@cluster0.pfkyi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");
    console.log(`connection host on : ${connectionDb.connection.host}`)
    server.listen(app.get("port"), () =>{
        console.log("LISTENING ON PORT 8000");
      });
    }
    catch(error){
        console.error("MongoDB connection failed:", error);
        process.exit(1); // Exit process on failure
    }
   
}
start();