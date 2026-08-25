import { useState } from "react";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const { login, loginConGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrore("");
    setInCorso(true);
    try {
      await login(email, password);
    } catch (err) {
      setErrore("Email o password non corretti.");
    } finally {
      setInCorso(false);
    }
  }

  async function handleGoogle() {
    setErrore("");
    try {
      await loginConGoogle();
    } catch (err) {
      setErrore("Accesso con Google non riuscito.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF6EF", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ background: "#FFFDF9", border: "1px solid #E3D9C6", borderRadius: 16, padding: 32, width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, color: "#3B2A20" }}>Gestione turni</h1>
        <label style={{ fontSize: 13, color: "#8A7A63", display: "flex", flexDirection: "column", gap: 4 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #D8CBB3" }} />
        </label>
        <label style={{ fontSize: 13, color: "#8A7A63", display: "flex", flexDirection: "column", gap: 4 }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #D8CBB3" }} />
        </label>
        {errore && <p style={{ color: "#B4708B", fontSize: 13, margin: 0 }}>{errore}</p>}
        <button type="submit" disabled={inCorso} style={{ background: "#3B2A20", color: "#FFFDF9", border: "none", borderRadius: 8, padding: 10, fontWeight: 600, cursor: "pointer" }}>
          {inCorso ? "Accesso in corso…" : "Accedi"}
        </button>
        <div style={{ textAlign: "center", fontSize: 12, color: "#8A7A63" }}>oppure</div>
        <button type="button" onClick={handleGoogle} style={{ background: "#FFFFFF", color: "#3B2A20", border: "1px solid #D8CBB3", borderRadius: 8, padding: 10, fontWeight: 600, cursor: "pointer" }}>
          Accedi con Google
        </button>
      </form>
    </div>
  );
}
