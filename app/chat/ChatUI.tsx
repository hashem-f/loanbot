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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state, busy]);

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
      <Shell>
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm text-muted">
            This conversation isn&apos;t active. Please open the link from your email again.
          </p>
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <Dots />
        </div>
      </Shell>
    );
  }

  const { input } = state;

  return (
    <Shell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg space-y-2.5 px-4 py-6">
          {state.messages.map((m) => (
            <div
              key={m.id}
              className={`rise flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-ink shadow-sm"
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-sm">
                <Dots />
              </div>
            </div>
          )}

          {state.offers.length > 0 && (
            <div className="space-y-2.5 pt-2">
              {state.offers.map((o) => (
                <a
                  key={o.id}
                  href={o.url}
                  className="rise group block rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium tracking-wide text-muted uppercase">
                        {o.brand}
                      </div>
                      <div className="mt-1 font-semibold text-ink">{o.headline}</div>
                      {o.terms_summary && (
                        <div className="mt-1 text-sm text-muted">{o.terms_summary}</div>
                      )}
                    </div>
                    <span className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent">
                      →
                    </span>
                  </div>
                  {o.disclosure_text && (
                    <div className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
                      {o.disclosure_text}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-lg px-4 py-4">
          {input.type === "choice" && (
            <div className="space-y-3">
              <div className="grid gap-2">
                {input.options.map((o) => (
                  <button
                    key={o.value}
                    disabled={busy}
                    onClick={() => send(o.value)}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-left text-[15px] text-ink transition hover:border-accent hover:bg-accent-soft disabled:opacity-40"
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
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={busy || !textDraft.trim()}
                  className="shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm text-ink transition hover:border-accent disabled:opacity-40"
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
                autoFocus
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="you@example.com"
                className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
              />
              <button
                type="submit"
                disabled={busy || !emailDraft.trim()}
                className="shrink-0 rounded-xl bg-accent px-5 py-3 text-[15px] font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}

          {input.type === "consent" && (
            <button
              disabled={busy}
              onClick={() => send("accept")}
              className="w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
            >
              I agree — show my offers
            </button>
          )}

          {input.type === "none" && (
            <p className="text-center text-xs text-muted">
              {state.step === "rejected"
                ? "This conversation has ended."
                : "That's everything — your options are above."}
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
            LO
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">Loan Options</div>
            <div className="text-xs text-muted">Automated assistant</div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function Dots() {
  return (
    <div className="flex gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
