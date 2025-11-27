import { useAuth } from '../context/AuthContext';

export default function RoleButton({ 
  children, 
  allowedRoles = [], 
  variant = "default",
  ...props 
}) {
  const { user } = useAuth();

  // Jika user belum login atau role tidak diizinkan → sembunyiin button
  if (!user || (allowedRoles.length > 0 && !allowedRoles.includes(user.role))) {
    return null;
  }

  return (
    <button variant={variant} {...props}>
      {children}
    </button>
  );
}