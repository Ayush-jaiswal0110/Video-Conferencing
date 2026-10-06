import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
const withAuth = WrappedComponent => {
  const AuthComponent = props => {
    const navigate = useNavigate();
    const authenticated = Boolean(localStorage.getItem('token'));
    useEffect(() => { if (!authenticated) navigate('/auth'); }, [authenticated, navigate]);
    return authenticated ? <WrappedComponent {...props} /> : null;
  };
  return AuthComponent;
};
export default withAuth;
