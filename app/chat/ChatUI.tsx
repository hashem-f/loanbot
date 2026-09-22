"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: string; role: "bot" | "user"; content: string };
type Option = { value: string; label: string };

type Input =
  | { type: "none" }
  | { type: "choice"; options: Option[] }
  | { type: "email" }
  | { type: "consent"; version: string; text: string };

type OfferCard = {
  id: string;
  brand: string;
  headline: string;
  terms_summary: string | null;
  disclosure_text: string | null;
  url: string;
};

type State = { step: string; messages: Message[]; input: Input; offers: OfferCard[] };

export default function ChatUI() {
  const [state, setState] = useState<State | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no_session"))))
      .then(setState)
      .catch(() => setExpired(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state]);

  async function send(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (res.ok) setState(await res.json());
    } finally {
      setBusy(false);
    }
  }

  if (expired) {
    return (
      <main className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <p className="text-gray-600 text-sm max-w-sm text-center">
          This conversation isn&apos;t active. Please open the link from your email again.
        </p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    );
  }

  const { input } = state;

  return (
    <main className="flex-1 flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-4 py-6 space-y-3">
          {state.messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-black px-4 py-2 text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-gray-900 shadow-sm"
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {state.offers.map((o) => (
            <a
              key={o.id}
              href={o.url}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-400"
            >
              <div className="font-medium">{o.headline}</div>
              <div className="text-sm text-gray-500">{o.brand}</div>
              {o.terms_summary && (
                <div className="mt-1 text-sm text-gray-600">{o.terms_summary}</div>
              )}
              {o.disclosure_text && (
                <div className="mt-2 text-xs text-gray-400">{o.disclosure_text}</div>
              )}
            </a>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-lg px-4 py-4">
          {input.type === "choice" && (
            <div className="space-y-3">
              <div className="grid gap-2">
                {input.options.map((o) => (
                  <button
                    key={o.value}
                    disabled={busy}
                    onClick={() => send(o.value)}
                    className="rounded-full border border-gray-300 px-4 py-2 text-left hover:bg-gray-50 disabled:opacity-40"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = textDraft.trim();
                  if (text) {
                    send(text);
                    setTextDraft("");
                  }
                }}
              >
                <input
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  placeholder="or type a question…"
                  className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !textDraft.trim()}
                  className="rounded-full border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {input.type === "email" && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (emailDraft.trim()) {
                  send(emailDraft.trim());
                  setEmailDraft("");
                }
              }}
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-full border border-gray-300 px-4 py-2"
              />
              <button
                type="submit"
                disabled={busy || !emailDraft.trim()}
                className="rounded-full bg-black px-5 py-2 text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}

          {input.type === "consent" && (
            <button
              disabled={busy}
              onClick={() => send("accept")}
              className="w-full rounded-full bg-black px-4 py-2 text-white disabled:opacity-40"
            >
              I agree — show my offers
            </button>
          )}

          {input.type === "none" && (
            <p className="text-center text-xs text-gray-400">
              {state.step === "rejected"
                ? "This conversation has ended."
                : "That's everything — your offers are above."}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
