import { AuthProvider, useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import MotoreTurni from "./components/MotoreTurni";

function Contenuto() {
  const { user, caricamento } = useAuth();
  if (caricamento) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A7A63" }}>Caricamento…</div>;
  if (!user) return <Login />;
  return <MotoreTurni />;
}

export default function App() {
  return (
    <AuthProvider>
      <Contenuto />
    </AuthProvider>
  );
}
