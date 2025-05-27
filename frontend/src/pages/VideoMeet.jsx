import { useState, useRef, useEffect } from 'react';
import styles from "../styles/videoComponent.module.css";
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import { io } from "socket.io-client";
import { Badge, IconButton } from '@mui/material';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShare from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat'
import YouTube from "react-youtube"; // npm install react-youtube
import {server} from '../env'

// Server URL for the WebSocket connection

const server_url = server;

// Object to store peer connections
var connections = {}

// Configuration for WebRTC peer connection (STUN server for NAT traversal)
const peerConfigConnections = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'   // Public STUN server to discover public IP
    }
  ]
};


export default function VideoMeetComponent(props) {

  // References for WebSocket and socket ID
  var socketRef = useRef();
  let socketIdRef = useRef();

  const [position, setPosition] = useState({ x: 10, y: 80 });
  const [dragging, setDragging] = useState(false);
  const [rel, setRel] = useState({ x: 0, y: 0 });

  const [youtubeLink, setYoutubeLink] = useState("");  // User input URL
  const [sharedVideoId, setSharedVideoId] = useState(null); // Video ID to show
  const [youtubePlayer, setYoutubePlayer] = useState(null);
  const seekingRef = useRef(false);


  // Reference to local video stream
  let localVideoRef = useRef();

  // State to check if video and audio permissions are available
  let [videoAvailable, setVideoAvailable] = useState(true);
  let [audioAvailable, setAudioAvailable] = useState(true);

  // State to manage user media stream
  let [video, setVideo] = useState([]);
  let [audio, setAudio] = useState();
  let [screen, setScreen] = useState();
  let [screenAvailble, setScreenAvailable] = useState();


  let [showModel, setModel] = useState(true);


  // State for handling chat messages

  let [messages, setMessages] = useState([])
  let [message, setMessage] = useState("");
  let [newMessages, setNewMessages] = useState();


  // State to ask for username before joining the meeting
  let [askForUsername, setAskForUsername] = useState(true);
  let [username, setUsername] = useState("");

  // Reference to store video elements dynamically
  const videoRef = useRef([]);
  let [videos, setVideos] = useState([]);

  /**
  * Effect hook to get media permissions on component mount
  */
  useEffect(() => {
    getPermissions();
  }, []);

  // ✅ Extract video ID from full YouTube URL
  const extractVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // ✅ Connect and emit shared video
 const connect = () => {
  if (!socketRef.current) {
    console.error("Socket is not connected yet");
    return;
  }

  const room = window.location.pathname.split("/").pop(); // Extract room from URL
  const usernameToUse = username?.trim();
  if (!usernameToUse) {
    alert("Please enter a username");
    return;
  }

  socketRef.current.emit("join-call", room); // ✅ Join room FIRST

  // Now emit the video if present
  if (youtubeLink) {
    const videoId = extractVideoId(youtubeLink);
    if (videoId) {
      setSharedVideoId(videoId);
      socketRef.current.emit("share-youtube-link", videoId); // ✅ Will now work, room is set
    } else {
      alert("Invalid YouTube link!");
      return;
    }
  }

  setAskForUsername(false);
  getMedia(); // ✅ Start webcam/mic logic
};

  // ✅ Connect to socket and receive video ID
  useEffect(() => {
    const socket = io(server_url);
    socketRef.current = socket;

    // Receive shared video (on join or new share)
    socket.on("youtube-video-shared", (videoId) => {
      console.log("Received shared video:", videoId);
      setSharedVideoId(videoId);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ✅ Handle incoming sync events
  useEffect(() => {
    if (!socketRef.current || !youtubePlayer) return;

    const handleYoutubeControl = (action) => {
      if (!youtubePlayer) return;

      seekingRef.current = true;

      if (action.type === "play") {
        youtubePlayer.playVideo();
      } else if (action.type === "pause") {
        youtubePlayer.pauseVideo();
      } else if (action.type === "seek") {
        youtubePlayer.seekTo(action.time, true);
      }

      setTimeout(() => {
        seekingRef.current = false;
      }, 500);
    };

    socketRef.current.on("youtube-control", handleYoutubeControl);

    return () => {
      socketRef.current.off("youtube-control", handleYoutubeControl);
    };
  }, [youtubePlayer]);

  // ✅ On player ready
  const onYouTubePlayerReady = (event) => {
    setYoutubePlayer(event.target);
  };

  // ✅ On player state change: broadcast control
  const onYouTubeStateChange = (event) => {
    if (!youtubePlayer) return;

    const state = event.data;
    const currentTime = youtubePlayer.getCurrentTime?.();

    if (state === window.YT.PlayerState.PLAYING && !seekingRef.current) {
      socketRef.current.emit("youtube-control", { type: "play" });
    } else if (state === window.YT.PlayerState.PAUSED && !seekingRef.current) {
      socketRef.current.emit("youtube-control", { type: "pause" });
    } else if (state === window.YT.PlayerState.BUFFERING && !seekingRef.current) {
      socketRef.current.emit("youtube-control", {
        type: "seek",
        time: currentTime,
      });
    }
  };

  let getDislayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          .then(getDislayMediaSuccess)
          .then((stream) => { })
          .catch((e) => console.log(e))
      }
    }
  }



  /**
   * Function to get media permissions for video and audio
   */
  const getPermissions = async () => {
    try {
      // Check video permission
      const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoPermission) {
        setVideoAvailable(true);
      } else {
        setVideoAvailable(false);
      }

      // Check audio permission
      const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (audioPermission) {
        setAudioAvailable(true);
      } else {
        setAudioAvailable(false);
      }

      // Check if screen sharing is available
      if (navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

      // If video or audio is available, get user media
      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable })

        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = userMediaStream;
          }
        }
      }

    } catch (e) {
      throw e;

    }
  }

  const handleMouseDown = (e) => {
    setDragging(true);
    setRel({
      x: e.pageX - position.x,
      y: e.pageY - position.y,
    });
    e.preventDefault();
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      setPosition({
        x: e.pageX - rel.x,
        y: e.pageY - rel.y,
      });
    }
  };

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  let getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      const pc = connections[id];

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      pc.getSenders().forEach(sender => {
        if (sender.track.kind === 'video' && videoTrack) {
          sender.replaceTrack(videoTrack);
        } else if (sender.track.kind === 'audio' && audioTrack) {
          sender.replaceTrack(audioTrack);
        }
      });
    }

    stream.getTracks().forEach(track => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);

        try {
          const tracks = localVideoRef.current.srcObject.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) {
          console.log(e);
        }

        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
        let silentStream = blackSilence();
        window.localStream = silentStream;
        localVideoRef.current.srcObject = silentStream;

        for (let id in connections) {
          if (id === socketIdRef.current) continue;

          const pc = connections[id];

          const silentVideo = silentStream.getVideoTracks()[0];
          const silentAudio = silentStream.getAudioTracks()[0];

          pc.getSenders().forEach(sender => {
            if (sender.track.kind === 'video' && silentVideo) {
              sender.replaceTrack(silentVideo);
            } else if (sender.track.kind === 'audio' && silentAudio) {
              sender.replaceTrack(silentAudio);
            }
          });
        }
      };
    });
  };

  /**
* Function to generate silent audio track
*/

  let silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    let dst = ctx.createMediaStreamDestination(); // Correctly store the destination node

    oscillator.connect(dst); // Connect oscillator to destination
    oscillator.start();
    ctx.resume();

    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };


  /**
 * Function to generate black video track
 */
  let black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), { width, height });
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  }

  /**
   * Function to initialize user media
   */
  let getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch((e) => {
          console.log("getUserMedia error:", e);
        });
    } else {
      try {
        let tracks = localVideoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      } catch (e) {
        console.log("Error stopping tracks:", e);
      }
    }
  };

  let getDislayMediaSuccess = (stream) => {
    console.log("HERE");

    try {
      window.localStream.getTracks().forEach(track => track.stop());
    } catch (e) { console.log(e); }

    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      const videoTrack = stream.getVideoTracks()[0];
      const sender = connections[id].getSenders().find(s => s.track.kind === 'video');

      if (sender) {
        sender.replaceTrack(videoTrack);
      } else {
        console.warn(`No video sender found for connection: ${id}`);
      }
    }

    stream.getTracks().forEach(track => {
      track.onended = () => {
        setScreen(false);

        try {
          const tracks = localVideoRef.current.srcObject.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) { console.log(e); }

        const blackSilence = (...args) => new MediaStream([black(...args), silence()]);
        window.localStream = blackSilence();
        localVideoRef.current.srcObject = window.localStream;

        getUserMedia(); // Restore camera
      };
    });
  };


  /**
* Effect hook to update media when video or audio state changes
*/
  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
  }, [audio, video])


  /**
  * Handle incoming messages from the server
  */
  let gotMessageFromServer = (fromId, message) => {
    var signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === "offer") {

            connections[fromId].createAnswer().then((description) => { // Fixed syntax
              connections[fromId].setLocalDescription(description).then(() => {
                socketRef.current.emit("signal", fromId, JSON.stringify({ "sdp": connections[fromId].localDescription }));
              }).catch(e => console.log(e))
            }).catch(e => console.log(e))
          }
        }).catch(e => console.log(e))
      }

      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
      }

    }
  };

  /**
   * Function to initialize WebSocket connection and set up event listeners
   */
  let connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on('signal', gotMessageFromServer);

    socketRef.current.on('connect', () => {
      socketRef.current.emit("join-call", window.location.href)

      socketIdRef.current = socketRef.current.id

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("user-left", (id) => {
        setVideos((videos) => (Array.isArray(videos) ? videos.filter(video => video.socketId !== id) : []));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

          connections[socketListId].onicecandidate = (event) => { // ICE :- interactive connectivity establishment protocol;
            if (event.candidate !== null) {
              socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
            }
          };
          connections[socketListId].onaddstream = (event) => {
            let videoExists = videoRef.current.find(video => video.socketId === socketListId);

            if (videoExists) {
              setVideos(videos => {
                const updatedVideos = videos.map(video =>
                  video.socketId === socketListId ? { ...video, stream: event.stream } : video
                );
                videoRef.current = updatedVideos;
                return updatedVideos;
              });
            } else {
              let newVideo = {
                socketId: socketListId,
                stream: event.stream,
                autoPlay: true,
                playsInline: true
              };

              setVideos(videos => {
                const updatedVideos = [...videos, newVideo];  // Fix: Spread `videos` into a new array
                videoRef.current = updatedVideos; // Update ref
                return updatedVideos;
              });
            }
          };

          if (window.localStream !== undefined && window.localStream !== null) {
            connections[socketListId].addStream(window.localStream);
          } else {
            //todo
            let blackSilence = (...args) => new MediaStream([black(...args), silence]);
            window.localStream = blackSilence();
            connections[socketListId].addStream(window.localStream);
          }

        })

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;
            try {
              connections[id2].addStream(window.localStream)
            } catch (e) { }

            connections[id2].createOffer().then((description) => {
              connections[id2].setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit("signal", id2, JSON.stringify({ "sdp": connections[id2].localDescription }))
                })
                .catch(e => { console.log(e) });
            })
          }
        }

      })
    })

  }

  // Frontend - addMessage handler
  const addMessage = (messageObj) => {
    console.log("Received messageObj in addMessage:", messageObj);
    setMessages((prevMessages) => [
      ...prevMessages,
      {
        sender: messageObj.sender || "Anonymous",
        message: messageObj.message || "No content"
      }
    ]);
  };



  /**
   * Function to start video call
   */
  let getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  }



  let handleVideo = () => {
    setVideo(!video);
  }

  let handleAudio = () => {
    setAudio(!audio);
  }

  let getDisplayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          .then(getDisplayMediaSucess)
          .then((stream) => { })
          .catch((e) => console.log(e));
      }
    }
  }
  useEffect(() => {
    if (screen !== undefined) {
      getDisplayMedia();
    }
  }, [screen])

  let getDisplayMediaSucess = (stream) => {
    try {
      window.localStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.log(error);
    }

    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      connections[id].addStream(window.localStream);
      connections[id].createOffer().then((description) => {
        connections[id].setLocalDescription(description)
          .then(() => {
            socketRef.current.emit("signal", id, JSON.stringify({ "sdp": connections[id].localDescription }))
          })
          .catch(e => console.log(e));

      })
    }
    stream.getTracks().forEach(track => track.onended = () => {
      setScreen(false);
      try {
        let tracks = localVideoRef.current.srcObject.getTracks()
        tracks.forEach(track => track.stop())
      } catch (e) { console.log(e) }

      let blackSilence = (...args) => new MediaStream([black(...args), silence()])
      window.localStream = blackSilence()
      localVideoRef.current.srcObject = window.localStream

      getUserMedia();
    })
  }



  let handleScreen = () => {
    setScreen(!screen);
  }


  let handleEndCall = () => {
    try {
      let tracks = localVideoRef.current.srcObject.getTracks()
      tracks.forEach(track => track.stop())
    } catch (e) { }
    window.location.href = "/"
  }
  let sendMessage = () => {
    console.log(socketRef.current);
    socketRef.current.emit('chat-message', message, username)
    setMessage("");

    // this.setState({ message: "", sender: username })
  }



  return (
    <div>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField
            id="Username"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
          />
          <TextField
            id="youtubeLink"
            label="Optional YouTube Video Link"
            value={youtubeLink}
            onChange={(e) => setYoutubeLink(e.target.value)}
            variant="outlined"
            style={{ marginTop: 16 }}
          />
          <Button variant="contained" onClick={connect}>
            Connect
          </Button>

          <div>
            <video ref={localVideoRef} autoPlay muted></video>
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {!askForUsername && (
            <div>
              {sharedVideoId ? (
                <YouTube
                  videoId={sharedVideoId}
                  opts={{ width: "560", height: "315" }}
                  onReady={onYouTubePlayerReady}
                  onStateChange={onYouTubeStateChange}
                />
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "#ccc" }}>
                  <h3>No YouTube video has been shared yet.</h3>
                  <p>Waiting for the host to share a video...</p>
                </div>
              )}
            </div>
          )}

          {showModel ? (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chats</h1>
                <div className={styles.chattingDisplay}>
                  {Array.isArray(messages) && messages.length > 0 ? (
                    messages.map((item, index) => {
                      const sender = item.sender || "Anonymous";
                      const messageContent = item.message || "No content";
                      const key = item.timestamp || item.id || `msg-${index}`;

                      return (
                        <div style={{ marginBottom: "20px" }} key={key}>
                          <p style={{ fontWeight: "bold" }}>{sender}</p>
                          <p>{messageContent}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p>No Messages yet</p>
                  )}
                </div>

                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    id="outlined-basic"
                    label="Enter message"
                    variant="outlined"
                  />
                  <Button onClick={sendMessage} variant="contained">
                    Send
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>

            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>

            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>

            {screenAvailble && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <ScreenShareIcon /> : <StopScreenShare />}
              </IconButton>
            )}

            <Badge badgeContent={newMessages} max={999} color="secondary">
              <IconButton
                onClick={() => {
                  setModel(!showModel);
                  setNewMessages(0);
                }}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video
            className={styles.meetUserVideo}
            ref={localVideoRef}
            autoPlay
            muted
          ></video>

          <div className={styles.conferenceView}>
            {videos.map((video) => (
              <div key={video.socketId}>
                <video
                  data-socket={video.socketId}
                  ref={(ref) => {
                    if (ref && video.stream) {
                      ref.srcObject = video.stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  onClick={(e) => {
                    if (e.target.requestFullscreen) {
                      e.target.requestFullscreen();
                    } else if (e.target.webkitRequestFullscreen) {
                      e.target.webkitRequestFullscreen();
                    } else if (e.target.msRequestFullscreen) {
                      e.target.msRequestFullscreen();
                    }
                  }}
                  className={styles.remoteVideo}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
