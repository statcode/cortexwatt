"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.devLogin(handle.trim(), birthYear ? Number(birthYear) : undefined);
      setToken(res.token);
      router.push("/train");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="display text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-ink/60">
        Dev auth — pick a handle. Your training history follows it.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Handle</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            pattern="[a-zA-Z0-9_\-]{2,32}"
            required
            autoFocus
            className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none focus:border-pine"
            placeholder="e.g. quickneuron"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Birth year (optional)</span>
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            type="number"
            min="1900"
            max="2020"
            className="num mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 outline-none focus:border-pine"
            placeholder="1990"
          />
        </label>
        {error && <p className="text-sm text-dom-decision">{error}</p>}
        <button
          disabled={busy || handle.trim().length < 2}
          className="w-full rounded-xl bg-lime py-2.5 font-semibold text-ink disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Start training"}
        </button>
      </form>
    </div>
  );
}
