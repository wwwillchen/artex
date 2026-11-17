"use client";

import * as React from "react";

import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Activity, TaskNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

function workTitle(work: TaskNode) {
  try {
    const summary = JSON.parse(work.payload ?? "{}")?.summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
  } catch {
    if (work.payload?.trim()) return work.payload.trim();
  }
  return `Work item #${work.id}`;
}

function workerLabel(owner?: string) {
  return owner?.replace(/^work#(\d+)$/, "Worker $1") || "Worker";
}

function historyLabel(event: Activity) {
  switch (event.kind) {
    case "round":
      return "Planning round";
    case "result":
      return event.is_error ? "Run ended with an error" : "Run result";
    case "intercept_request":
      return "Approval requested";
    case "tool_use":
      return event.tool ? `Started ${event.tool}` : "Tool started";
    case "tool_result":
      return event.tool ? `${event.tool} result` : "Tool result";
    default:
      return "Update";
  }
}

function useRunSnapshot(taskId: string, session: string) {
  const [state, setState] = React.useState<{
    current: TaskNode[];
    recent: TaskNode[];
    total: number;
    error: string;
  }>();
  const [activity, setActivity] = React.useState<{
    session: string;
    items: Activity[];
    error: string;
  }>();

  React.useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const [running, waiting, recent] = await Promise.all([
          api.explorationNodes(taskId, {
            kinds: ["intent"],
            states: ["running"],
            size: PAGE_SIZE,
            order: "asc",
          }),
          api.explorationNodes(taskId, {
            kinds: ["intent"],
            states: ["open", "blocked", "paused"],
            size: 20,
          }),
          api.explorationNodes(taskId, {
            kinds: ["intent"],
            states: ["done", "exhausted", "stopped"],
            size: 8,
          }),
        ]);
        if (active)
          setState({
            current: [...running.items, ...waiting.items],
            recent: recent.items,
            total: running.total + waiting.total,
            error: "",
          });
      } catch (error) {
        if (active)
          setState((previous) => ({
            current: previous?.current ?? [],
            recent: previous?.recent ?? [],
            total: previous?.total ?? 0,
            error: (error as Error).message,
          }));
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [taskId]);

  React.useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const { items } = await api.activityHistory(taskId, session, 0, 20);
        if (active)
          setActivity({
            session,
            items: items.filter((item) => item.kind !== "thinking" && item.kind !== "usage"),
            error: "",
          });
      } catch (error) {
        if (active)
          setActivity((previous) => ({
            session,
            items: previous?.session === session ? previous.items : [],
            error: (error as Error).message,
          }));
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [taskId, session]);

  return {
    state,
    activity: activity?.session === session ? activity : undefined,
  };
}

export function RunWorkspace({
  taskId,
  pendingApprovals,
  showApprovals,
  showSession,
  chooseModel,
}: {
  taskId: string;
  pendingApprovals: number;
  showApprovals: () => void;
  showSession: (work?: TaskNode) => void;
  chooseModel: () => void;
}) {
  const [view, setView] = React.useState<"list" | "map">("list");
  const [selection, setSelection] = React.useState<TaskNode>();
  const session = selection ? `intent:${selection.id}` : "plan";
  const { state, activity } = useRunSnapshot(taskId, session);
  const current = state?.current ?? [];
  const selected =
    selection &&
    (current.find((work) => work.id === selection.id) ??
      state?.recent.find((work) => work.id === selection.id) ??
      selection);
  const attention = current.filter((work) => work.state === "blocked" && !work.inherited);
  const latestResult = activity?.items.findLast((item) => item.kind === "result");
  const errorSeq = selected?.state === "blocked" && latestResult?.is_error ? latestResult.seq : undefined;
  const [errorDetail, setErrorDetail] = React.useState<{
    seq: number;
    text: string;
  }>();
  React.useEffect(() => {
    if (errorSeq === undefined) return;
    let active = true;
    api
      .activityDetail(errorSeq, taskId)
      .then(({ detail }) => {
        if (active) setErrorDetail({ seq: errorSeq, text: detail });
      })
      .catch(() => {
        // The activity summary and session link remain available.
      });
    return () => {
      active = false;
    };
  }, [errorSeq, taskId]);
  const rawError = errorDetail?.seq === errorSeq ? (errorDetail?.text ?? "") : "";
  const noProvider = Boolean(errorSeq !== undefined && rawError.includes("has no available fallback LLM provider"));
  const noTools = rawError.includes("No tools ran") || rawError.includes("本次运行还没有发出工具调用");

  function renderWork(work: TaskNode) {
    const label = work.state === "open" ? "Unassigned" : workerLabel(work.owner);
    return (
      <button
        key={work.id}
        type="button"
        onClick={() => setSelection(work)}
        aria-pressed={selected?.id === work.id}
        className={cn(
          "min-w-0 rounded-lg border bg-card p-3 text-left outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
          selected?.id === work.id && "border-primary bg-accent",
        )}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {label} · #{work.id}
          </span>
          <StatusBadge domain="intent" value={work.state} dot />
        </span>
        <span className="mt-2 block break-words text-sm font-medium">{workTitle(work)}</span>
      </button>
    );
  }

  return (
    <div className="space-y-5">
      {(pendingApprovals > 0 || attention.length > 0) && (
        <section
          aria-label="Needs attention"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
        >
          <CircleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="mr-2 text-sm font-semibold">Needs attention</span>
          {pendingApprovals > 0 && (
            <Button size="sm" variant="outline" onClick={showApprovals}>
              Review approvals ({pendingApprovals})
            </Button>
          )}
          {attention.slice(0, 3).map((work) => (
            <Button key={work.id} size="sm" variant="outline" onClick={() => setSelection(work)}>
              Blocked work #{work.id}
            </Button>
          ))}
        </section>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-label="Live work" className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Live work</h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                List
              </Button>
              <Button
                size="sm"
                variant={view === "map" ? "secondary" : "ghost"}
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                Worker map
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={!selection}
            onClick={() => setSelection(undefined)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
              !selection && "border-primary bg-accent",
              view === "map" && "mx-auto block",
            )}
          >
            Planner
          </button>
          {state?.error && (
            <p role="status" className="text-sm text-destructive">
              Could not refresh work. Retrying automatically.
            </p>
          )}
          {!state && <p className="text-sm text-muted-foreground">Loading work…</p>}
          {state && !state.error && current.length === 0 && (
            <p className="text-sm text-muted-foreground">No active or queued work.</p>
          )}
          {current.length > 0 && (
            <div
              className={cn(
                "grid gap-2",
                view === "map" &&
                  "relative grid-cols-1 border-t pt-4 before:absolute before:left-1/2 before:bottom-full before:h-4 before:border-l sm:grid-cols-2 2xl:grid-cols-3",
              )}
            >
              {current.map(renderWork)}
            </div>
          )}
          {state && state.total > current.length && (
            <p className="text-sm text-muted-foreground">
              Showing {current.length} of {state.total} work items. Open sessions to see the rest.
            </p>
          )}
          {!!state?.recent.length && (
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium">Recent completed work</summary>
              <div className="mt-3 grid gap-2">{state.recent.map(renderWork)}</div>
            </details>
          )}
        </section>
        <section aria-label="Selected activity" className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold tracking-tight">
                {selected ? workTitle(selected) : "Planner activity"}
              </h2>
              {selected && <p className="text-xs text-muted-foreground">Work item #{selected.id}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => showSession(selected)}>
              Open session <ArrowRightIcon />
            </Button>
          </div>
          {noProvider && (
            <div role="status" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="font-medium">Model unavailable{noTools ? " · No tools ran" : ""}</p>
              <p className="text-sm text-muted-foreground">This task has no usable fallback model profile.</p>
              <Button size="sm" variant="outline" onClick={chooseModel}>
                Choose model
              </Button>
            </div>
          )}
          {rawError && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Technical details</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {rawError}
              </pre>
            </details>
          )}
          {activity?.error && (
            <p role="status" className="text-sm text-destructive">
              Could not refresh activity. Retrying automatically.
            </p>
          )}
          {!activity && <p className="text-sm text-muted-foreground">Loading activity…</p>}
          {activity && !activity.error && !activity.items.length && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
          <ol className="divide-y">
            {activity?.items
              .slice(-8)
              .reverse()
              .map((event) => (
                <li key={event.seq} className="space-y-1 py-3">
                  <div className="flex flex-wrap justify-between gap-1 text-xs">
                    <span className="font-medium">{historyLabel(event)}</span>
                    <time dateTime={event.ts} className="text-muted-foreground">
                      {new Date(event.ts).toLocaleTimeString("en", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                    {noProvider && event.seq === errorSeq ? "No usable model profile was available." : event.summary}
                  </p>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
