import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { TopBar } from "../components/TopBar";
import { store } from "../lib/store";
import type { ChatMessage } from "../types";

const ROOMS = [
  { id: "general", title: "General chat", text: "All riders" },
  { id: "montenegro", title: "Montenegro", text: "Coast and mountains" },
  { id: "routes", title: "Routes", text: "Share tracks and GPX" },
  { id: "events", title: "Events", text: "Festivals and meetups" },
  { id: "test", title: "Chat test", text: "Sandbox room" },
];

export function ChatList() {
  return (
    <div className="page">
      <header className="topbar">
        <div />
        <div className="topbar-mid">
          <BrandLogo compact />
          <h1>Chat</h1>
        </div>
        <div />
      </header>
      <div className="chat-list">
        {ROOMS.map((r) => (
          <Link key={r.id} to={`/chat/${r.id}`}>
            <b>{r.title}</b>
            <span className="muted">{r.text}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ChatRoom() {
  const { room } = useParams();
  const meta = ROOMS.find((r) => r.id === room) ?? ROOMS[0];
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  const messages = useMemo(
    () => store.get().messages.filter((m) => m.room === meta.id),
    [meta.id, tick],
  );

  function send() {
    const user = store.get().user;
    if (!text.trim()) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      room: meta.id,
      userId: user?.id ?? "guest",
      name: user?.name ?? "Guest",
      text: text.trim(),
      createdAt: Date.now(),
    };
    store.addMessage(msg);
    setText("");
    setTick((n) => n + 1);
  }

  return (
    <div className="page">
      <TopBar title={meta.title} />
      <div className="bubble-wrap">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.userId === store.get().user?.id ? "me" : ""}`}>
            <small>{m.name}</small>
            {m.text}
          </div>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" />
        <button className="btn blue small" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
