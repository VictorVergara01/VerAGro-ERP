import { Center, Loader } from "@mantine/core";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";

export function ProtectedRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
