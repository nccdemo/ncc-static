import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const res = await api.post("/login", {
        email,
        password,
      });

      const token = res.data?.access_token || res.data?.token;
      const role = String(res.data?.role || "").toLowerCase();
      if (!token) {
        alert("Risposta non valida dal server");
        return;
      }
      if (role !== "admin") {
        alert("Questo account non è un amministratore");
        return;
      }

      localStorage.setItem("token", token);

      navigate("/dashboard", { replace: true });
    } catch (err) {
      alert("Login fallito");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Admin Login</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
