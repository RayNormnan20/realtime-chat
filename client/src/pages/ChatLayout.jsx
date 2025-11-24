import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../state/auth.jsx";
import { api } from "../api";

export default function ChatLayout() {
  const { user, token, logout } = useAuth();
  const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || "http://localhost:4000";
  const socket = useMemo(() => io(SOCKET_URL, { auth: { token } }), [token]);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [active, setActive] = useState(null);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [newMemberId, setNewMemberId] = useState("");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState("chats");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSelected, setGroupSelected] = useState([]);
  const [groupInfo, setGroupInfo] = useState(false);
  const [members, setMembers] = useState([]);
  const [renameName, setRenameName] = useState("");
  const [addMemberId, setAddMemberId] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(Number(ts));
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday ? `${hh}:${mm}` : `${d.getDate()}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
  };

  useEffect(() => {
    if (!token) return;
    api.get("/api/chats").then(r => setChats(r.data.chats)).catch(()=>{});
    api.get("/api/users").then(r => setUsers(r.data.users)).catch(()=>{});
  }, [token]);

  useEffect(() => {
    socket.on("message:new", msg => {
      if (msg.chat_id !== active) return;
      setMessages(prev => (prev.some(m => m.id === msg.id)) ? prev : [...prev, msg]);
    });
    socket.on("chat:new", async (chat) => {
      try {
        const r = await api.get("/api/chats");
        setChats(r.data.chats || []);
      } catch {}
    });
    return () => { socket.off("message:new"); socket.off("chat:new"); };
  }, [socket, active]);

  useEffect(() => {
    (async () => {
      if (!groupInfo || !active) return;
      try {
        const rm = await api.get(`/api/chats/${active}/members`);
        setMembers(rm.data.members || []);
        const chat = chats.find(c => c.id === active);
        setRenameName(chat?.name || "");
      } catch {}
    })();
  }, [groupInfo, active, chats]);

  const openChat = async (chat) => {
    try {
      setActive(chat.id);
      socket.emit("chat:join", { chatId: chat.id });
      const r = await api.get(`/api/chats/${chat.id}/messages`);
      setMessages(r.data.messages);
      setTimeout(()=>{ listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, 0);
    } catch (e) {}
  };

  const send = () => {
    if (!text.trim() || !active) return;
    socket.emit("message:send", { chatId: active, content: text });
    setText("");
    setTimeout(()=>{ listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, 0);
  };

  const onPickImage = async (file) => {
    if (!file || !active) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result; // base64
      const payload = { type: 'image', data, text: '' };
      socket.emit("message:send", { chatId: active, content: payload });
      setTimeout(()=>{ listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, 0);
    };
    reader.readAsDataURL(file);
  };

  const createChat = async () => {
    if (!newMemberId) return;
    const r = await api.post("/api/chats", { name: null, memberIds: [Number(newMemberId)] });
    const created = r.data.chat;
    const u = users.find(x => String(x.id) === String(newMemberId));
    const chat = { ...created, name: u?.name || u?.username || created.name };
    setChats(prev => [chat, ...prev]);
    setNewMemberId("");
  };

  const filteredChats = chats.filter(c => {
    const t = (c.name || "Chat").toLowerCase();
    const lm = (c.last_message || "").toLowerCase();
    const q = search.toLowerCase();
    return t.includes(q) || lm.includes(q);
  });

  const filteredUsers = users
    .filter(u => u.id !== user.id)
    .filter(u => {
      const q = search.toLowerCase();
      const t = (u.name || u.username || "").toLowerCase();
      return t.includes(q);
    });

  const activeTitle = () => {
    const chat = chats.find(c => c.id === active);
    const base = chat?.name || chat?.other_name || "Chat";
    const other = messages.find(m => m.user_id !== user?.id);
    return other?.name || other?.username || base;
  };

  const Avatar = ({ text }) => {
    const ch = (text || "?").trim();
    const init = ch[0]?.toUpperCase() || "?";
    const hue = (init.charCodeAt(0) * 37) % 360;
    const bg = `hsl(${hue},70%,35%)`;
    return <div className="avatar" style={{ background:bg }}>{init}</div>;
  };

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="sidebar-head">
          <div className="sidebar-user">
            <Avatar text={user?.name || user?.username} />
            <div className="sidebar-user-text">
              <div className="sidebar-user-name">{user?.name || user?.username}</div>
              <div className="sidebar-user-sub">En línea</div>
            </div>
            <div className="header-actions">
              <button className="button outline small" onClick={logout}>Salir</button>
            </div>
          </div>
          <input className="search-input rounded" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar o empezar un chat nuevo" />
          <div className="newchat" style={{ marginTop:8 }}>
            <button className="button small" onClick={()=>{ setMode('contacts'); setGroupOpen(v=>!v); setGroupName(""); setGroupSelected([]); }}>Nuevo grupo</button>
          </div>
          <div className="nav-icons">
            <button className={`icon ${mode==='contacts'?'active':''}`} title="Contactos" onClick={()=>setMode('contacts')}>
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"/></svg>
            </button>
            <button className={`icon ${mode==='chats'?'active':''}`} title="Chats" onClick={()=>setMode('chats')}>
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/></svg>
            </button>
            <button className={`icon ${groupInfo?'active':''}`} title="Perfil" onClick={()=>{ setGroupInfo(v=>!v); setProfile(null); }}>
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm7 8c0-3.866-3.582-7-7-7s-7 3.134-7 7v2h14v-2Z"/></svg>
            </button>
          </div>
        </div>
        {mode === 'contacts' ? (
          <div className="list">
            {groupOpen ? (
              <div className="newchat" style={{ padding:"8px 12px" }}>
                <input className="input" placeholder="Nombre del grupo (opcional)" value={groupName} onChange={e=>setGroupName(e.target.value)} />
                <button className="button small" disabled={groupSelected.length < 2} onClick={async ()=>{
                  const r = await api.post("/api/chats", { name: groupName || null, memberIds: groupSelected.map(Number) });
                  const created = r.data.chat;
                  const chat = { id: created.id, name: created.name || groupName || "Grupo" };
                  setChats(prev => [chat, ...prev]);
                  setGroupOpen(false); setGroupName(""); setGroupSelected([]); setProfile(null);
                  await openChat(chat);
                }}>Crear grupo</button>
              </div>
            ) : null}
            {filteredUsers.map(u => (
              <div key={u.id} className="list-item" onClick={()=>{
                if (groupOpen) {
                  setGroupSelected(prev => prev.includes(u.id) ? prev.filter(x=>x!==u.id) : [...prev, u.id]);
                } else { setProfile(u.id); setActive(null); }
              }}>
                <Avatar text={u.name || u.username} />
                <div className="list-item-text">
                  <div className="list-item-meta">
                    <div className="list-item-title">{u.name || u.username}</div>
                  </div>
                  <div className="list-item-sub">Perfil</div>
                </div>
                {groupOpen ? (
                  <input type="checkbox" checked={groupSelected.includes(u.id)} onChange={()=>{
                    setGroupSelected(prev => prev.includes(u.id) ? prev.filter(x=>x!==u.id) : [...prev, u.id]);
                  }} />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="list">
            {filteredChats.map(c => (
              <div key={c.id} className="list-item" onClick={()=>openChat(c)}>
                <Avatar text={c.name || c.other_name || "Chat"} />
                <div className="list-item-text">
                  <div className="list-item-meta">
                    <div className="list-item-title">{c.name || c.other_name || "Chat"}</div>
                    <div className="list-item-time">{fmtTime(c.last_time)}</div>
                  </div>
                  <div className="list-item-sub">{c.last_message || ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="main">
        <div className="header">
          {active ? (
            <div className="header-user" onClick={()=>setGroupInfo(true)}>
              <Avatar text={activeTitle()} />
              <div>
                <div className="header-title">{activeTitle()}</div>
                <div className="header-sub">En línea</div>
              </div>
            </div>
          ) : profile ? (
            <div className="header-user">
              <Avatar text={(users.find(u=>u.id===profile)?.name) || (users.find(u=>u.id===profile)?.username)} />
              <div>
                <div className="header-title">{(users.find(u=>u.id===profile)?.name) || (users.find(u=>u.id===profile)?.username)}</div>
                <div className="header-sub">Perfil</div>
              </div>
            </div>
          ) : (
            <div className="empty-head">Chat en tiempo real</div>
          )}
        </div>
        <div className="messages" ref={listRef}>
          {active && groupInfo ? (
            <div className="profile">
              <div className="profile-avatar"><Avatar text={activeTitle()} /></div>
              <div className="profile-name">{activeTitle()}</div>
              <div className="profile-fields">
                <div className="profile-field"><span>Chat</span><strong>{active}</strong></div>
                <div className="profile-field"><span>Miembros</span><strong>{members.map(m=>m.name||m.username).join(', ')||'-'}</strong></div>
              </div>
              <div className="profile-actions" style={{ width:"100%", maxWidth:560 }}>
                {members.map(m => (
                  <div key={m.id} className="list-item" style={{ padding:8 }}>
                    <Avatar text={m.name || m.username} />
                    <div className="list-item-text">
                      <div className="list-item-title">{m.name || m.username}</div>
                    </div>
                    <button className="button small outline" onClick={async ()=>{
                      await api.delete(`/api/chats/${active}/members/${m.id}`);
                      const rm = await api.get(`/api/chats/${active}/members`);
                      setMembers(rm.data.members||[]);
                    }}>Eliminar</button>
                  </div>
                ))}
              </div>
              <div className="profile-actions">
                <input className="input" placeholder="Nombre del grupo" value={renameName} onChange={e=>setRenameName(e.target.value)} />
                <button className="button" onClick={async ()=>{ await api.put(`/api/chats/${active}`, { name: renameName }); const r = await api.get('/api/chats'); setChats(r.data.chats||[]); }}>Guardar nombre</button>
              </div>
              <div className="profile-actions">
                <select className="input" value={addMemberId} onChange={e=>setAddMemberId(e.target.value)}>
                  <option value="">Selecciona usuario</option>
                  {users.filter(u=>!members.some(m=>m.id===u.id)).map(u=> (
                    <option key={u.id} value={u.id}>{u.name||u.username}</option>
                  ))}
                </select>
                <button className="button" disabled={!addMemberId} onClick={async ()=>{
                  await api.post(`/api/chats/${active}/members`, { memberIds: [Number(addMemberId)] });
                  const rm = await api.get(`/api/chats/${active}/members`);
                  setMembers(rm.data.members||[]);
                  setAddMemberId("");
                }}>Añadir miembro</button>
              </div>
              <div className="profile-actions" style={{ width:"100%", maxWidth:560 }}>
                <div className="section-title">Imágenes compartidas</div>
                <div className="gallery">
                  {messages.filter(m=>m.type==='image').map(img => (
                    <div key={img.id} className="gallery-item" onClick={()=>setImagePreview(img.image_base64)}>
                      <img src={img.image_base64} alt="imagen" className="gallery-thumb" />
                    </div>
                  ))}
                  {messages.filter(m=>m.type==='image').length===0 ? (
                    <div className="empty-note">No hay imágenes en este chat</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : active ? (
            messages.map((m,i)=> (
              <div key={i} className={`msg ${m.user_id===user.id? "mine" : ""}`}>
                {m.type === 'image' ? (
                  <div className="msg-image-wrap">
                    <img src={m.image_base64} alt="imagen" className="msg-image" />
                  </div>
                ) : (
                  <div className="msg-text">{m.content}</div>
                )}
                <div className="time">{fmtTime(m.created_at)}</div>
              </div>
            ))
          ) : profile ? (
            <div className="profile">
              <div className="profile-avatar"><Avatar text={(users.find(u=>u.id===profile)?.name) || (users.find(u=>u.id===profile)?.username)} /></div>
              <div className="profile-name">{(users.find(u=>u.id===profile)?.name) || (users.find(u=>u.id===profile)?.username)}</div>
              <div className="profile-fields">
                <div className="profile-field"><span>Usuario</span><strong>{users.find(u=>u.id===profile)?.username}</strong></div>
                <div className="profile-field"><span>ID</span><strong>{users.find(u=>u.id===profile)?.id}</strong></div>
                <div className="profile-field"><span>Estado</span><strong>En línea</strong></div>
              </div>
              <div className="profile-actions">
                <button className="button" onClick={async ()=>{
                  const r = await api.post("/api/chats", { name: null, memberIds: [Number(profile)] });
                  const created = r.data.chat;
                  const u = users.find(x => String(x.id) === String(profile));
                  const chat = { ...created, name: u?.name || u?.username || created.name };
                  setChats(prev => [chat, ...prev]);
                  setActive(created.id);
                  setProfile(null);
                  socket.emit("chat:join", { chatId: created.id });
                  const rr = await api.get(`/api/chats/${created.id}/messages`);
                  setMessages(rr.data.messages);
                }}>Iniciar chat</button>
              </div>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon"></div>
              <div className="empty-title">Chat en tiempo real</div>
              <div className="empty-sub">Envía y recibe mensajes. Para conversar selecciona una conversación.</div>
            </div>
          )}
        </div>
      <div className="composer">
        <input className="input" value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe un mensaje" onKeyDown={e=>{ if(e.key==='Enter') send(); }} />
        <label className="attach">
          <input type="file" accept="image/*" onChange={e=>onPickImage(e.target.files?.[0])} style={{ display:"none" }} />
          <span>📎</span>
        </label>
        <button className="button" onClick={send}>Enviar</button>
      </div>
      {imagePreview ? (
        <div className="modal" onClick={()=>setImagePreview(null)}>
          <img src={imagePreview} alt="preview" className="modal-image" />
        </div>
      ) : null}
      </div>
    </div>
  );
}
