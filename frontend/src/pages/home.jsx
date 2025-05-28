import React, { useContext, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate } from 'react-router-dom'
import "../App.css";
import { Button, IconButton, TextField } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import { AuthContext } from '../contexts/AuthContext';
import server from "../env";

function HomeComponent() {
    const navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const { addToUserHistory } = useContext(AuthContext);

    const handleJoinVideoCall = async () => {
        if (!meetingCode) {
            alert("Please enter a meeting code.");
            return;
        }
        await addToUserHistory(meetingCode);
        navigate(`/${meetingCode}`);
    };

    const handleCreateMeeting = async () => {
        try {
            const response = await fetch(`${server}/api/v1/meetings/create-meeting`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ user_id: "host" }),
            });



            const data = await response.json();

            if (data.success && data.meetingCode) {
                await addToUserHistory(data.meetingCode);
                navigate(`/${data.meetingCode}`);
            } else {
                alert("Failed to create meeting");
            }
        } catch (err) {
            console.error("Error creating meeting:", err);
            alert("Something went wrong");
        }
    };

    return (
        <>
            <div className="navBar">
                <div style={{ display: "flex", alignItems: "center" }}>
                    <h2>Apna Video Call</h2>
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
                    <IconButton onClick={() => navigate("/history")}>
                        <RestoreIcon />
                    </IconButton>
                    <p>History</p>
                    <Button onClick={() => {
                        localStorage.removeItem("token");
                        navigate("/auth");
                    }}>
                        Logout
                    </Button>
                </div>
            </div>

            <div className="meetContainer">
                <div className="leftPanel">
                    <div>
                        <h2>Providing Quality Video Call Just Like Quality Education</h2>

                        <div style={{ display: 'flex', gap: "10px", marginBottom: "10px" }}>
                            <TextField
                                onChange={e => setMeetingCode(e.target.value)}
                                id="outlined-basic"
                                label="Meeting Code"
                                variant="outlined"
                                value={meetingCode}
                            />
                            <Button onClick={handleJoinVideoCall} variant='contained'>Join</Button>
                        </div>

                        <div>
                            <Button variant='outlined' onClick={handleCreateMeeting}>Create New Meeting</Button>
                        </div>
                    </div>
                </div>
                <div className='rightPanel'>
                    <img srcSet='/logo3.png' alt="" />
                </div>
            </div>
        </>
    );
}

export default withAuth(HomeComponent);
