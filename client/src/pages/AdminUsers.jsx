import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/auth.jsx";

export default function AdminUsers() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tab, setTab] = useState('users');
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(null);
  const load = async () => {
    const r = await api.get("/api/users");
    setUsers(r.data.users);
    const rr = await api.get("/api/admin/roles");
    setRoles(rr.data.roles);
  };
  useEffect(() => { load(); }, []);

  const Avatar = ({ text }) => {
    const ch = (text || "?").trim();
    const init = ch[0]?.toUpperCase() || "?";
    const hue = (init.charCodeAt(0) * 37) % 360;
    const bg = `hsl(${hue},70%,35%)`;
    return <div className="avatar" style={{ background:bg }}>{init}</div>;
  };

  const create = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    await api.post("/api/admin/users", { username, password, name, role_id: roleId });
    setUsername(""); setPassword(""); setName("");
    setRoleId(null);
    await load();
  };

  const toggle = async (u) => {
    await api.put(`/api/admin/users/${u.id}/enabled`, { enabled: !u.enabled });
    await load();
  };

  return (
    <div className="admin-layout">
      <div className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="admin-logo">Panel</div>
        <button className={`admin-nav-item ${tab==='users'?'active':''}`} onClick={()=>{setTab('users'); setMenuOpen(false);}}>Usuarios</button>
        <button className={`admin-nav-item ${tab==='roles'?'active':''}`} onClick={()=>{setTab('roles'); setMenuOpen(false);}}>Roles</button>
      </div>
      <div className="admin-content">
        <div className="admin-header">
          <button className="admin-toggle" onClick={()=>setMenuOpen(s=>!s)}>☰</button>
          <Avatar text={user?.name || user?.username} />
          <div className="admin-header-text">
            <div className="admin-header-title">{user?.name || user?.username}</div>
            <div className="admin-header-sub">{user?.role || "user"}</div>
          </div>
          <div className="admin-actions">
            <button className="button outline small" onClick={logout}>Salir</button>
          </div>
        </div>
        {tab === 'users' ? (
          <div className="card">
            <div className="title">Usuarios</div>
            <form onSubmit={create} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
              <input className="input" placeholder="Usuario" value={username} onChange={e=>setUsername(e.target.value)} />
              <input className="input" placeholder="Nombre" value={name} onChange={e=>setName(e.target.value)} />
              <input className="input" type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} />
              <select className="input" value={roleId ?? ''} onChange={e=>setRoleId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Rol: user</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="button" type="submit">Crear usuario</button>
            </form>
            <div style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr><th>ID</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.name}</td>
                      <td>
                        <select className="input" value={u.role_id ?? ''} onChange={async e=>{ const rid = e.target.value ? Number(e.target.value) : null; await api.put(`/api/admin/users/${u.id}/role`, { role_id: rid }); await load(); }}>
                          <option value="">user</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td>{u.enabled ? "Habilitado" : "Deshabilitado"}</td>
                      <td><button className="button" onClick={()=>toggle(u)}>{u.enabled?"Deshabilitar":"Habilitar"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="title">Roles</div>
            <form onSubmit={async (e)=>{ e.preventDefault(); const name = e.target.roleName.value.trim(); if(!name) return; await api.post('/api/admin/roles', { name }); e.target.roleName.value=''; await load(); }} style={{ display:"flex", gap:8 }}>
              <input name="roleName" className="input" placeholder="Nombre del rol" />
              <button className="button" type="submit">Crear rol</button>
            </form>
            <div style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr><th>ID</th><th>Nombre</th></tr>
                </thead>
                <tbody>
                  {roles.map(r => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.name}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
