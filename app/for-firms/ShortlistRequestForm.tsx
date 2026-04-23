"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "ok" | "error";

export function ShortlistRequestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");
  const [form, setForm] = useState({
    firm_name: "",
    contact_name: "",
    contact_email: "",
    contact_role: "",
    role_description: "",
    deadline: "",
    source: "",
  });

  function setField<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMsg("");
    try {
      const res = await fetch("/api/for-firms/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const raw = await res.text();
      let d: any = null;
      try { d = JSON.parse(raw); } catch {}
      if (!res.ok) {
        setStatus("error");
        setMsg(d?.error || `Submission failed (${res.status}).`);
        return;
      }
      setStatus("ok");
      setMsg("Thanks. We'll reply within 24 hours.");
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.message || "Network error. Try again or email us directly.");
    }
  }

  if (status === "ok") {
    return (
      <div className="font-[var(--font-sans)] border-t-2 border-[#27ABD2] pt-8">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#27ABD2] mb-3">
          Received
        </p>
        <p className="font-[var(--font-serif)] text-[40px] md:text-[52px] leading-[1.05] text-[#F9F6F0]">
          Thanks, <span className="italic">{form.contact_name.split(/\s+/)[0] || "there"}.</span>
        </p>
        <p className="mt-5 text-[15px] leading-[1.65] text-[#F9F6F0]/75 max-w-md">
          {msg} If we need clarifying detail on the ToR, you&apos;ll hear from us sooner. In
          the meantime feel free to reply to the confirmation email with any extra context.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="font-[var(--font-sans)] space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field
          label="Firm name"
          required
          value={form.firm_name}
          onChange={(v) => setField("firm_name", v)}
          placeholder="e.g. Agriconsulting Europe SA"
        />
        <Field
          label="Your name"
          required
          value={form.contact_name}
          onChange={(v) => setField("contact_name", v)}
          placeholder="First Last"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field
          label="Email"
          type="email"
          required
          value={form.contact_email}
          onChange={(v) => setField("contact_email", v)}
          placeholder="you@firm.com"
        />
        <Field
          label="Your role"
          value={form.contact_role}
          onChange={(v) => setField("contact_role", v)}
          placeholder="Bid Manager / Director / Team Leader"
        />
      </div>
      <TextArea
        label="What are you sourcing for?"
        required
        value={form.role_description}
        onChange={(v) => setField("role_description", v)}
        placeholder="Paste a ToR, attach a summary, or just describe: role title, sector, years of experience, donor, key skills, any constraints."
        rows={6}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field
          label="When do you need it?"
          value={form.deadline}
          onChange={(v) => setField("deadline", v)}
          placeholder="e.g. Proposal deadline 2 May"
        />
        <Field
          label="How did you hear about us?"
          value={form.source}
          onChange={(v) => setField("source", v)}
          placeholder="Referral, search, LinkedIn, etc."
        />
      </div>

      {status === "error" && (
        <p className="text-[13px] text-red-300 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
          {msg}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="group inline-flex items-center gap-2 text-[15px] font-bold tracking-tight px-7 py-4 rounded-full bg-[#27ABD2] text-[#111111] hover:bg-[#F9F6F0] transition disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>Sending…</>
          ) : (
            <>
              Send request
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </>
          )}
        </button>
        <p className="mt-4 text-[12px] text-[#F9F6F0]/50">
          We respond within 24 hours. Usually faster. Your details aren&apos;t shared with
          third parties.
        </p>
      </div>
    </form>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-[0.18em] uppercase text-[#F9F6F0]/60 mb-2">
        {props.label}
        {props.required && <span className="text-[#27ABD2]"> *</span>}
      </span>
      <input
        type={props.type || "text"}
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full bg-transparent border-b border-[#F9F6F0]/30 focus:border-[#27ABD2] outline-none py-2.5 text-[15px] text-[#F9F6F0] placeholder:text-[#F9F6F0]/30 transition-colors"
      />
    </label>
  );
}

function TextArea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-[0.18em] uppercase text-[#F9F6F0]/60 mb-2">
        {props.label}
        {props.required && <span className="text-[#27ABD2]"> *</span>}
      </span>
      <textarea
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={props.rows || 4}
        className="w-full bg-transparent border border-[#F9F6F0]/20 focus:border-[#27ABD2] outline-none py-3 px-4 rounded text-[15px] text-[#F9F6F0] placeholder:text-[#F9F6F0]/30 transition-colors leading-[1.55]"
      />
    </label>
  );
}
