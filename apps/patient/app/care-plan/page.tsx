"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

type Task = { id: string; title: string; description?: string; dueAt?: string; status: string; updatedAt?: string };
type Plan = { id: string; title: string; description?: string; coordinatorNote?: string; status: string; tasks: Task[] };
const statuses = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", SKIPPED: "Skipped" };
const control = { padding: "10px 13px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#172334" } as const;

function TaskEditor({ planId, task, disabled, onSaved, onSaving }: { planId: string; task: Task; disabled: boolean; onSaved: (task: Task) => void; onSaving: (id: string, saving: boolean) => void }) {
  const version = `${task.updatedAt}:${task.status}`;
  const [draft, setDraft] = useState<{ status: string; version: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const status = draft?.version === version ? draft.status : task.status;
  async function save() {
    if (pending.current || disabled || status === task.status) return;
    pending.current = true; setSaving(true); onSaving(task.id, true); setError(""); setNotice("");
    try {
      const saved = await apiFetch<Task>(`/v1/patient/care-plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedStatus: task.status, ...(task.updatedAt ? { expectedUpdatedAt: task.updatedAt } : {}) }) });
      onSaved(saved); setDraft(null); setNotice(`Saved: ${statuses[saved.status as keyof typeof statuses] ?? saved.status}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save task progress. Your selection remains here."); }
    finally { pending.current = false; setSaving(false); onSaving(task.id, false); }
  }
  return <article aria-label={`Care task ${task.id}`} style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 16 }}>
    <b>{task.title}</b>{task.description && <p style={{ color: "#64748b" }}>{task.description}</p>}
    {task.dueAt && <p style={{ color: "#64748b", fontSize: 13 }}>Due {new Date(task.dueAt).toLocaleDateString()}</p>}
    <p style={{ color: "#64748b", fontSize: 13 }}>Saved progress: <b>{statuses[task.status as keyof typeof statuses] ?? task.status}</b></p>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label>Task progress <select aria-label={`Status for ${task.title} (${task.id})`} style={control} disabled={disabled || saving} value={status} onChange={event => { setDraft({ status: event.target.value, version }); setError(""); setNotice(""); }}>
        {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button style={control} disabled={disabled || saving || status === task.status} onClick={() => void save()}>{saving ? "Saving…" : "Save progress"}</button>
      {status !== task.status && <button style={control} disabled={disabled || saving} onClick={() => { setDraft(null); setError(""); }}>Reset</button>}
    </div>
    {status !== task.status && <p style={{ color: "#9a5b11", fontSize: 13 }}>Unsaved progress</p>}
    {error && <p role="alert" style={{ color: "#9a3412" }}>{error}</p>}{notice && <p role="status" style={{ color: "#166534" }}>{notice}</p>}
  </article>;
}

export default function CarePlanPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const savingIds = useRef(new Set<string>());
  const load = useCallback(async () => {
    if (savingIds.current.size || !lifetime.current || lifetime.current.signal.aborted) return;
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime.current.signal]); setRefreshing(true);
    try { const rows = await apiFetch<Plan[]>("/v1/patient/care-plans", { signal }); if (!signal.aborted) { setPlans(rows); setError(""); } }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your care plans."); }
    finally { if (!signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); controller.abort(); activeLoad.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (loading) return;
    let id = ""; try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    if (id.startsWith("care-plan-")) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [loading]);
  function taskSaving(id: string, busy: boolean) { if (busy) savingIds.current.add(id); else savingIds.current.delete(id); setSaving(savingIds.current.size > 0); }
  return <main style={{ maxWidth: 1050, margin: "auto", padding: "48px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
    <p style={{ color: "#64748b" }}>CareBridge · Recovery & treatment</p><h1 style={{ fontSize: 42, margin: "8px 0" }}>My Care Plans</h1>
    <p style={{ color: "#64748b", fontSize: 17 }}>Update progress on tasks recommended by your care team. Choose a stage, then Save progress.</p>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><button style={control} disabled={refreshing || saving} onClick={() => void load()}>{refreshing ? "Refreshing…" : "Refresh care plans"}</button><Link href="/care">Open care hub →</Link></div>
    {error && <div role="alert" style={{ padding: 16, borderRadius: 16, background: "#fff7ed", color: "#9a3412", margin: "20px 0" }}>{error} Displayed progress may be out of date.</div>}
    {loading && <p role="status">Loading care plans…</p>}
    <div style={{ display: "grid", gap: 20, marginTop: 28 }}>{plans.map(plan => <section key={plan.id} id={"care-plan-" + plan.id} style={{ padding: 26, border: "1px solid #e2e8f0", borderRadius: 24, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}><div><h2 style={{ margin: "0 0 8px" }}>{plan.title}</h2><p style={{ color: "#64748b" }}>{plan.description || "Your personalized care plan."}</p></div><span>{plan.status}</span></div>
      {plan.coordinatorNote && <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", margin: "16px 0" }}><b>Care team note</b><div>{plan.coordinatorNote}</div></div>}
      <div style={{ display: "grid", gap: 10 }}>{plan.tasks.map(task => <TaskEditor key={task.id} planId={plan.id} task={task} disabled={refreshing} onSaving={taskSaving} onSaved={saved => setPlans(current => current.map(item => item.id === plan.id ? { ...item, tasks: item.tasks.map(existing => existing.id === saved.id ? saved : existing) } : item))} />)}</div>
      {!plan.tasks.length && <p style={{ color: "#64748b" }}>No tasks assigned yet.</p>}
    </section>)}</div>
    {!loading && !plans.length && !error && <p style={{ padding: 40, textAlign: "center", border: "1px dashed #cbd5e1", borderRadius: 20, color: "#64748b" }}>No active care plans yet.</p>}
  </main>;
}
