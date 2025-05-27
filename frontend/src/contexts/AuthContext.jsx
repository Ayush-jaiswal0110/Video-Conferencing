import { createContext, useState, useContext } from "react";
import axios from 'axios'
import { useNavigate } from "react-router-dom";
import httpStatus from "http-status";
import {server} from "../env";

// Creating authentication context
export const AuthContext = createContext({});

// Creating an Axios instance with a base URL for API requests
const client = axios.create({
    baseURL: `${server}/api/v1/users`
})

// AuthProvider component to manage authentication state and provide authentication functions
export const AuthProvider = ({children}) =>{
    // Getting existing auth context (if any)
    const authContext = useContext(AuthContext);

     // State to store user authentication data
    const [userData, setUserData] = useState(authContext);

     /**
     * Function to handle user registration
     * @param {string} name - Full name of the user
     * @param {string} username - Username for authentication
     * @param {string} password - User's password
     * @returns {string} - Message response from the server
     */
    const handleRegister = async (name, username, password)=>{
        try{
             // Sending registration data to the backend API
            let request = await client.post("/register", {
                name:name,
                username: username,
                password:password
            })

             // Returning response message if registration is successful
            if(request.status === httpStatus.CREATED){
               return request.data.message;
            }

        }catch(err){
               throw err; // Throw error if registration fails
        }
    }

     /**
     * Function to handle user login
     * @param {string} username - Username for authentication
     * @param {string} password - User's password
     */
    const handleLogin = async(username, password) =>{
        try{
              // Sending login credentials to the backend API
            let request = await client.post("/login", {
                username: username,
                password: password
            })

            // If login is successful, store the token in local storage and navigate to home
            if(request.status === httpStatus.OK){
                localStorage.setItem("token", request.data.token);
                router("/home");
            }

        }
        catch(err){
            throw err; // Throw error if login fails
        }
    }

    
    const getHistoryOfUser = async () => {
        try {
            let request = await client.get("/get_all_activity", {
                params: {
                    token: localStorage.getItem("token")
                }
            });
            return request.data
        } catch
         (err) {
            throw err;
        }
    }

    const addToUserHistory = async (meetingCode) => {
        try {
            let request = await client.post("/add_to_activity", {
                token: localStorage.getItem("token"),
                meeting_code: meetingCode
            });
            return request
        } catch (e) {
            throw e;
        }
    }


     // Hook to navigate between routes
    const router = useNavigate();

    // Authentication data and functions provided to other components
    const data = {
        userData,
        getHistoryOfUser,
        addToUserHistory,
        setUserData, 
        handleRegister, 
        handleLogin
    }
    return(
            // Providing authentication data and functions to child components
        <AuthContext.Provider value={data}>
            {children }
        </AuthContext.Provider>
    )
}