import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MuiCard from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';

import FormLabel from '@mui/material/FormLabel';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';

import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { AuthContext } from '../contexts/AuthContext';
import { Snackbar } from '@mui/material'; // Snackbar for showing alerts

// Styled Card Component using MUI's styled API
const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  boxShadow:
    'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
  [theme.breakpoints.up('sm')]: {
    width: '450px',
  },
  ...theme.applyStyles('dark', {
    boxShadow:
      'hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px',
  }),
}));


// Authentication Component - Handles both Login & Signup
export default function Authentication() {

  // State variables for form inputs and validation
  const [username, setUsername] = React.useState();
  const [password, setPassword] = React.useState();
  const [name, setName] = React.useState();
  const [error, setError] = React.useState();
  const [message, setMessage] = React.useState();
  const [formState, setFormState] = React.useState();// 0 -> Login, 1 -> Signup
  const [open, setOpen] = React.useState(false); // Controls Snackbar visibility
  const [emailError, setEmailError] = React.useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = React.useState('');
  const [passwordError, setPasswordError] = React.useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = React.useState('');

  // Access authentication functions from AuthContext
  const { handleRegister, handleLogin } = React.useContext(AuthContext);

  // Function to handle authentication logic
  let handleAuth = async () => {
    try {
      if (formState === 0) { // Sign In

        let resulr = await handleLogin(username, password)

      }
      if (formState === 1) { // Sign Up
        let result = await handleRegister(name, username, password);
        console.log(result);
        setUsername("")
        setMessage(result)
        setOpen(true);
        setError("");
        setFormState(0); // Switch back to login after successful registration
        setPassword("")
      }
    } catch (err) {
      let message = err?.response?.data?.message || "Something went wrong";
      setError(message);


    }
  }

  // Function to validate email and password inputs
  const validateInputs = () => {
    const email = document.getElementById('email');
    const password = document.getElementById('password');

    let isValid = true;

    // Email validation
    if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
      setEmailError(true);
      setEmailErrorMessage('Please enter a valid email address.');
      isValid = false;
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
    }
    // Password validation
    if (!password.value || password.value.length < 6) {
      setPasswordError(true);
      setPasswordErrorMessage('Password must be at least 6 characters long.');
      isValid = false;
    } else {
      setPasswordError(false);
      setPasswordErrorMessage('');
    }

    return isValid;
  };

  return (
    // Authentication Card Component
    <Card variant="outlined">

      {/* Toggle Between Sign In and Sign Up */}
      <div>
        <Button variant={formState === 0 ? "contained" : ""} onClick={() => { setFormState(0) }}>Sign In</Button>
        <Button variant={formState === 1 ? "contained" : ""} onClick={() => { setFormState(1) }}>Sign Up</Button>
      </div>

      {/* Title Display (Changes Based on Login/Signup) */}
      <Typography
        component="h1"
        variant="h4"
        sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}
      >
        {formState === 0 ? <>Sign In</> : <>Sign Up</>}
      </Typography>

      {/* Form Section */}
      <Box
        component="form"
        // onSubmit={}
        noValidate
        sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}
      >
        {/* <TextField
            error={emailError}
            helperText={emailErrorMessage}
            id="email"
            type="email"
            name="email"
            label= "Email"
            placeholder="your@email.com"
            autoComplete="email"
            autoFocus
            required
            fullWidth
            variant="outlined"
            color={emailError ? 'error' : 'primary'}
          /> */}
        {/* Name Field - Only Shown in Sign Up */}
        {formState === 1 ? <TextField
          margin='normal'
          id="Fullname"
          label="Full name"
          name="Fullname"
          placeholder="Fullname"
          value={name}
          autoFocus
          required
          fullWidth
          variant="outlined"
          onChange={(e) => { setName(e.target.value) }}
        /> : <></>}

        {/* Username Field */}
        <TextField
          margin='normal'
          id="username"
          label="username"
          name="username"
          placeholder="username"
          value={username}
          autoFocus
          required
          fullWidth
          variant="outlined"
          onChange={(e) => { setUsername(e.target.value) }}
        />

        {/* Password Field */}
        <FormControl>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <FormLabel htmlFor="password">Password</FormLabel>

          </Box>
          <TextField
            error={passwordError}
            helperText={passwordErrorMessage}
            name="password"
            value={password}
            placeholder="••••••"
            type="password"
            id="password"
            autoComplete="current-password"
            autoFocus
            required
            fullWidth
            variant="outlined"
            color={passwordError ? 'error' : 'primary'}
            onChange={(e) => { setPassword(e.target.value) }}
          />
        </FormControl>

        {/* Error Message Display */}
        <p style={{ color: "red" }}>{error}</p>


        {/* Submit Button */}
        <Button
          type="button"
          fullWidth
          variant="contained"
          onClick={handleAuth}>
          {formState === 0 ? "Log In" : "Register"}
        </Button>

      </Box>
      {/* Snackbar for Success Message */}
      <Snackbar
        open={open}
        autoHideDuration={4000}
        message={message}

      />
    </Card>
  );
}