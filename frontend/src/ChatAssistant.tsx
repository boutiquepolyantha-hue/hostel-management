import { FormEvent, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "./api";

type ChatAssistantProps = {
  endpoint: string;
  extraBody?: Record<string, unknown>;
  title?: string;
};

export function ChatAssistant({ endpoint, extraBody = {}, title = "Help assistant" }: ChatAssistantProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ from: "user" | "assistant"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setQuestion("");
    setMessages(items => [...items, { from: "user", text: value }]);
    setLoading(true);
    try {
      const result = await api<{ answer: string }>(endpoint, { method: "POST", body: JSON.stringify({ ...extraBody, question: value }) });
      setMessages(items => [...items, { from: "assistant", text: result.answer }]);
    } catch (reason) {
      setMessages(items => [...items, { from: "assistant", text: reason instanceof Error ? reason.message : "Assistant unavailable" }]);
    } finally { setLoading(false); }
  }
  return <>
    <button className="chat-launcher" onClick={() => setOpen(value => !value)}><MessageCircle /> {open ? "Close" : "Ask assistant"}</button>
    {open && <section className="chat-panel" aria-label={title}>
      <header><strong><MessageCircle /> {title}</strong><button onClick={() => setOpen(false)}><X /></button></header>
      <div className="chat-messages">{messages.length === 0 && <p className="chat-hint">Ask about requests, QR codes, dorm rules, bus trips, or check-in status.</p>}{messages.map((message, index) => <div className={`chat-message ${message.from}`} key={index}>{message.text}</div>)}{loading && <div className="chat-message assistant">Thinking…</div>}</div>
      <form onSubmit={ask}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Type a question…" /><button aria-label="Send"><Send /></button></form>
    </section>}
  </>;
}
