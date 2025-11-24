import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../state/auth.jsx";

export default function Login() {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { setUser, setToken } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = tab === "login" ? await api.post("/api/auth/login", { username, password }) : await api.post("/api/auth/register", { username, password, name });
      setUser(r.data.user); setToken(r.data.token); nav("/");
    } catch (err) { setError("Error de autenticación"); }
  };

  return (
    <div className="page">
      <div className="card">
        <div className="title">Login</div>
        <div style={{display:"flex", gap:8, marginBottom:12}}>
          <button className="button" onClick={() => setTab("login")}>Iniciar sesión</button>
          <button className="button" onClick={() => setTab("register")}>Registro</button>
        </div>
        <form onSubmit={submit}>
          {tab === "register" && (
            <input className="input" placeholder="Nombre" value={name} onChange={e=>setName(e.target.value)} />
          )}
          <input className="input" placeholder="Usuario" value={username} onChange={e=>setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="button" type="submit">{tab === "login" ? "Entrar" : "Crear cuenta"}</button>
          {error && <div style={{color:"#fca5a5", marginTop:8}}>{error}</div>}
        </form>
      </div>
    </div>
  );
}