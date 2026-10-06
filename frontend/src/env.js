const server = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production'
    ? 'https://video-conferencing-backend-carn.onrender.com'
    : 'http://localhost:8000');
export default server;
