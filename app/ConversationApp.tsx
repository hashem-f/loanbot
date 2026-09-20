"use client";

import { useEffect, useMemo, useState } from "react";
import { QUESTIONS } from "@/lib/questions";

type TrackingParams = {
  brand?: string;
  campaign?: string;
  src?: string;
  click_id?: string;
};

type UiStep =
  | "loading"
  | "name"
  | "email"
  | "verify"
  | "questions"
  | "offers"
  | "error";

type OfferView = {
  id: string;
  brand: string;
  headline: string;
  terms_summary: string | null;
  disclosure_text: string | null;
  sessionId: string;
};

async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request_failed_${res.status}`);
    // @ts-expect-error attach for callers that want it
    err.data = data;
    throw err;
  }
  return data;
}

export default function ConversationApp({ trackingParams }: { trackingParams: TrackingParams }) {
  const [uiStep, setUiStep] = useState<UiStep>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [offers, setOffers] = useState<OfferView[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(trackingParams)) {
      if (v) qs.set(k === "src" ? "src" : k === "click_id" ? "click_id" : k, v);
    }
    api<{
      step: string;
      firstName: string | null;
      email: string | null;
      verified: boolean;
      answeredKeys: string[];
    }>(`/api/session?${qs.toString()}`)
      .then((data) => {
        if (data.firstName) setFirstName(data.firstName);
        if (data.email) setEmail(data.email);
        setAnsweredKeys(data.answeredKeys);

        if (data.step === "intake") setUiStep("name");
        else if (data.step === "verify") setUiStep("verify");
        else if (data.step === "questions") setUiStep("questions");
        else if (data.step === "offers") setUiStep("offers");
        else setUiStep("name");
      })
      .catch(() => {
        setErrorMsg("Couldn't load your session. Refresh to try again.");
        setUiStep("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (uiStep === "offers") {
      api<{ offers: OfferView[] }>("/api/offers")
        .then((data) => setOffers(data.offers))
        .catch(() => setErrorMsg("Couldn't load your offers."));
    }
  }, [uiStep]);

  const currentQuestion = useMemo(
    () => QUESTIONS.find((q) => !answeredKeys.includes(q.key)),
    [answeredKeys]
  );

  async function submitStart() {
    setErrorMsg(null);
    try {
      const data = await api<{ ok: true; devCode?: string; alreadyVerified?: boolean }>(
        "/api/start",
        { method: "POST", body: JSON.stringify({ firstName, email, consent: true }) }
      );
      if (data.devCode) setDevCode(data.devCode);
      setUiStep(data.alreadyVerified ? "questions" : "verify");
      setResendCooldown(60);
    } catch (e: unknown) {
      const data = (e as { data?: { error?: string } }).data;
      if (data?.error === "rate_limited") {
        setErrorMsg("Too many attempts from this email or address. Please try again later.");
      } else if (data?.error === "bot_check_failed") {
        setErrorMsg("Couldn't verify you're not a bot. Please try again.");
      } else if (data?.error === "email_send_failed") {
        setErrorMsg("Couldn't send the verification email. Please try again shortly.");
      } else {
        setErrorMsg("Something went wrong. Please try again.");
      }
    }
  }

  async function submitVerify() {
    setErrorMsg(null);
    try {
      await api("/api/verify", { method: "POST", body: JSON.stringify({ code }) });
      setUiStep("questions");
    } catch (e: unknown) {
      const data = (e as { data?: { error?: string; attemptsRemaining?: number } }).data;
      if (data?.error === "invalid_code") {
        setErrorMsg(`That code isn't right. ${data.attemptsRemaining} attempt(s) left.`);
      } else if (data?.error === "locked") {
        setErrorMsg("Too many wrong attempts. Please request a new code.");
      } else if (data?.error === "expired") {
        setErrorMsg("That code expired. Please request a new one.");
      } else {
        setErrorMsg("Couldn't verify that code.");
      }
    }
  }

  async function resendCode() {
    setErrorMsg(null);
    try {
      const data = await api<{ ok: true; devCode?: string }>("/api/resend", { method: "POST" });
      if (data.devCode) setDevCode(data.devCode);
      setResendCooldown(60);
    } catch (e: unknown) {
      const data = (e as { data?: { error?: string } }).data;
      if (data?.error === "cooldown") setErrorMsg("Please wait a bit before requesting another code.");
      else if (data?.error === "too_many_codes") setErrorMsg("You've hit the resend limit for now.");
      else if (data?.error === "email_send_failed") setErrorMsg("Couldn't send the email. Please try again shortly.");
      else setErrorMsg("Couldn't resend the code.");
    }
  }

  async function submitAnswer(value: string) {
    if (!currentQuestion) return;
    setErrorMsg(null);
    try {
      const data = await api<{ ok: true; allAnswered: boolean }>("/api/answer", {
        method: "POST",
        body: JSON.stringify({ questionKey: currentQuestion.key, value }),
      });
      setAnsweredKeys((prev) => [...prev, currentQuestion.key]);
      if (data.allAnswered) setUiStep("offers");
    } catch {
      setErrorMsg("Couldn't save that answer.");
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
        {errorMsg && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {errorMsg}
          </div>
        )}
        {devCode && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            DEV MODE — no email provider configured. Your code is <strong>{devCode}</strong>.
          </div>
        )}

        {uiStep === "loading" && <p className="text-gray-500">Loading…</p>}

        {uiStep === "name" && (
          <NameEmailStep
            firstName={firstName}
            email={email}
            onFirstName={setFirstName}
            onEmail={setEmail}
            onSubmit={submitStart}
          />
        )}

        {uiStep === "verify" && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="text-gray-600 text-sm">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>
            <input
              className="w-full border rounded px-3 py-2 tracking-widest text-center text-lg"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
            <button
              className="w-full bg-black text-white rounded py-2 disabled:opacity-40"
              disabled={code.length !== 6}
              onClick={submitVerify}
            >
              Confirm
            </button>
            <div className="flex justify-between text-sm">
              <button
                className="text-gray-500 underline disabled:opacity-40"
                disabled={resendCooldown > 0}
                onClick={resendCode}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
              <button className="text-gray-500 underline" onClick={() => setUiStep("name")}>
                Change email
              </button>
            </div>
          </div>
        )}

        {uiStep === "questions" && currentQuestion && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">{currentQuestion.prompt}</h1>
            <div className="grid gap-2">
              {currentQuestion.options.map((opt) => (
                <button
                  key={opt.value}
                  className="border rounded px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => submitAnswer(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {uiStep === "offers" && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Your matches</h1>
            {offers.length === 0 && (
              <p className="text-gray-600 text-sm">
                We couldn&apos;t find a match right now. Check back soon — we add offers
                regularly.
              </p>
            )}
            {offers.map((offer) => (
              <a
                key={offer.id}
                href={`/r/${offer.id}?s=${offer.sessionId}`}
                className="block border rounded p-3 hover:bg-gray-50"
              >
                <div className="font-medium">{offer.headline}</div>
                <div className="text-sm text-gray-500">{offer.brand}</div>
                {offer.terms_summary && (
                  <div className="text-sm text-gray-600 mt-1">{offer.terms_summary}</div>
                )}
                {offer.disclosure_text && (
                  <div className="text-xs text-gray-400 mt-1">{offer.disclosure_text}</div>
                )}
              </a>
            ))}
          </div>
        )}

        {uiStep === "error" && <p className="text-red-600">{errorMsg}</p>}
      </div>
    </main>
  );
}

function NameEmailStep({
  firstName,
  email,
  onFirstName,
  onEmail,
  onSubmit,
}: {
  firstName: string;
  email: string;
  onFirstName: (v: string) => void;
  onEmail: (v: string) => void;
  onSubmit: () => void;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [consent, setConsent] = useState(false);

  if (!showEmail) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">What&apos;s your first name?</h1>
        <input
          className="w-full border rounded px-3 py-2"
          value={firstName}
          onChange={(e) => onFirstName(e.target.value)}
          placeholder="Jamie"
        />
        <button
          className="w-full bg-black text-white rounded py-2 disabled:opacity-40"
          disabled={firstName.trim().length === 0}
          onClick={() => setShowEmail(true)}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">What&apos;s your email?</h1>
      <input
        className="w-full border rounded px-3 py-2"
        type="email"
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          className="mt-1"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree to be contacted by email about offers, and to receive a one-time
          verification email. I can unsubscribe anytime.
        </span>
      </label>
      <button
        className="w-full bg-black text-white rounded py-2 disabled:opacity-40"
        disabled={!consent || !/^\S+@\S+\.\S+$/.test(email)}
        onClick={onSubmit}
      >
        Send my code
      </button>
      <button className="text-sm text-gray-500 underline" onClick={() => setShowEmail(false)}>
        Back
      </button>
    </div>
  );
}
