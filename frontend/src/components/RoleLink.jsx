import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleLink({ 
  to, 
  children, 
  allowedRoles = [], 
  className = "",
  ...props 
}) {
  const { user } = useAuth();

  // Jika tidak punya akses → sembunyiin link
  if (!user || (allowedRoles.length > 0 && !allowedRoles.includes(user.role))) {
    return null;
  }

  return (
    <Link to={to} className={className} {...props}>
      {children}
    </Link>
  );
}