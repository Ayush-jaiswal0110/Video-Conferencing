import React  from 'react'
import { Link, useNavigate } from "react-router-dom";// Importing Link for navigation between routes

import "../App.css"// Importing the CSS file for styling



// LandingPage Component - This is the homepage of the video conferencing app
export default function LandingPage() {

    const router = useNavigate();

  return (
    <div>
       {/* Main Container for Landing Page */}
       <div className="landingPageContainer">

        {/* Navigation Bar */}
        <nav>
            <div className='navHeader'>
                <h2>Video Conferencing</h2>
            </div>

            {/* Navigation Links */}
            <div className="navlist">
                <p onClick={()=>{
                    router("/random");
                }} >Join as Guest</p>
                <p onClick={()=>{
                    router("/auth");
                }}>Register</p>
                <div onClick={()=>{
                    router("/auth");
                }} role='button'>
                    <p>Login</p>
                </div>
            </div>
        </nav>

        {/* Main Content Section */}
        <div className="landingPageMainContainer">

            {/* Left Side - Text Content */}
            <div>
                <h1> <span style={{color: "#FF9839"}}>Connect</span> with Your Loved Ones</h1>

                <p>Cover distance by Video Conferencing.</p>

                {/* Button to Navigate to the Authentication Page */}
                <div role='button'>
                    <Link to={"/auth"}> Get Started</Link>
                </div>
            </div>
            
            {/* Right Side - Image Section */}
            <div>
                <img src="/mobile.png" alt="" />
            </div>
        </div>
    
        </div>


    </div>
  )
}
