import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../state/auth.jsx";
import { api } from "../api";

export default function ChatLayout() {
  const { user, token } = useAuth();
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
      if (msg.chat_id === active) setMessages(prev => [...prev, msg]);
    });
    socket.on("chat:new", chat => setChats(prev => [chat, ...prev]));
    return () => { socket.off("message:new"); socket.off("chat:new"); };
  }, [socket, active]);

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
    setMessages(m => [...m, { chat_id: active, user_id: user.id, content: text, created_at: Date.now(), username: user.username, name: user.name }]);
    setText("");
    setTimeout(()=>{ listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, 0);
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
    const base = chat?.name || "Chat";
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
          </div>
          <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar o empezar un chat nuevo" />
          <div className="section-title">Contactos</div>
          <div className="contacts">
            {filteredUsers.map(u => (
              <div key={u.id} className="list-item" onClick={()=>{ setProfile(u.id); setActive(null); }}>
                <Avatar text={u.name || u.username} />
                <div className="list-item-text">
                  <div className="list-item-meta">
                    <div className="list-item-title">{u.name || u.username}</div>
                  </div>
                  <div className="list-item-sub">Perfil</div>
                </div>
              </div>
            ))}
          </div>
          <div className="section-title">Chats</div>
        </div>
        <div className="list">
          {filteredChats.map(c => (
            <div key={c.id} className="list-item" onClick={()=>openChat(c)}>
              <Avatar text={c.name || "Chat"} />
              <div className="list-item-text">
                <div className="list-item-meta">
                  <div className="list-item-title">{c.name || "Chat"}</div>
                  <div className="list-item-time">{fmtTime(c.last_time)}</div>
                </div>
                <div className="list-item-sub">{c.last_message || ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="main">
        <div className="header">
          {active ? (
            <div className="header-user">
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
          {active ? (
            messages.map((m,i)=> (
              <div key={i} className={`msg ${m.user_id===user.id? "mine" : ""}`}>
                <div className="msg-text">{m.content}</div>
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
          <button className="button" onClick={send}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
