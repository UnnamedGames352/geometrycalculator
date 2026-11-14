import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitPlayerAppeal } from "@/lib/gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/appeal")({
  head: () => ({ meta: [
    { title: "Player Appeal | Geometry Resources" },
    { name: "description", content: "Submit an appeal for a player account suspension." },
    { name: "robots", content: "noindex" },
  ] }),
  component: AppealPage,
});

function AppealPage() {
  const submit = useServerFn(submitPlayerAppeal);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submit({ data: { password, reason } });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your appeal.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
    <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Player support</p>
      <h1 className="mt-2 text-3xl font-bold">Appeal a suspension</h1>
      {submitted ? <div className="mt-6 rounded-xl border border-success/30 bg-success/5 p-4"><h2 className="font-semibold">Appeal submitted</h2><p className="mt-1 text-sm text-muted-foreground">Your appeal is in the review queue. An administrator will review the information you provided.</p></div> : <>
        <p className="mt-3 text-sm text-muted-foreground">Enter the account code you normally use to sign in and explain why you believe the suspension should be reviewed.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Account code<Input className="mt-1 font-mono" autoComplete="off" maxLength={80} value={password} onChange={(event) => setPassword(event.target.value.toUpperCase())} required /></label>
          <label className="block text-sm font-medium">Why should this suspension be reviewed?<Textarea className="mt-1 min-h-32" maxLength={1000} minLength={20} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what happened and why you are appealing…" required /></label>
          <p className="text-xs text-muted-foreground">{reason.length}/1000 characters · At least 20 characters</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || password.trim().length < 4 || reason.trim().length < 20}>{busy ? "Submitting…" : "Submit appeal"}</Button>
        </form>
      </>}
    </section>
  </main>;
}
