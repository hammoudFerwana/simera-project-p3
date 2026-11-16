
import { Navigate, Outlet } from "react-router-dom";
import useCurrentUser from "../src/hooks/useCurrentUser";

export default function ProtectedRoute({ allowedRoles }) {
  const { data, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return <div>Loading...</div>;
  }

const user = data;

  if (isError || !user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
   const redirectPath =
  user.role === "admin" ? "/admin/candidates" : "/candidate";
    return <Navigate to={redirectPath} replace />;
  }

 return <Outlet context={{ user }} />;
}
