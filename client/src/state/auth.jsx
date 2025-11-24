import React, { createContext, useContext, useState, useMemo } from "react";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const value = useMemo(() => ({ user, token, setUser: (u) => { setUser(u); localStorage.setItem("user", JSON.stringify(u)); }, setToken: (t) => { setToken(t); localStorage.setItem("token", t); } }), [user, token]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }