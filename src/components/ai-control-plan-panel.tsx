import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Play, RotateCcw, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  changedPlanActions,
  normalizePlanDescription,
  orderPlanActions,
  planCommands,
  PLAN_DEVICES,
  type ControlPlan,
} from "@/lib/ai-control-plan";
import { generateAIControlPlan } from "@/lib/ai-control-plan.functions";
import type { CityState } from "@/lib/smartcity";

const MAX_LENGTH = 1000;
const EXAMPLES = [
  "Evening assembly: street and building lights on, beacons on, turbines running",
  "Save energy during the day: only green status lights and turbines",
  "Let the light sensor control the lights automatically",
];

const IMPACT_STYLE: Record<ControlPlan["powerImpact"], string> = {
  Low: "border-success/50 bg-success/15 text-success",
  Moderate: "border-accent/50 bg-accent/15 text-accent",
  High: "border-destructive/50 bg-destructive/15 text-destructive",
};

export function AIControlPlanPanel({ state, connected, onApply }: {
  state: CityState;
  connected: boolean;
  onApply: (commands: string[]) => Promise<void>;
}) {
  const generate = useServerFn(generateAIControlPlan);
  const [description, setDescription] = useState("");
  const [plan, setPlan] = useState<ControlPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generating" | "applying" | null>(null);

  const valid = normalizePlanDescription(description) !== null;
  const changes = plan ? orderPlanActions(changedPlanActions(state, plan.actions)) : [];

  const createPlan = async () => {
    const request = normalizePlanDescription(description);
    if (!request || busy) return;
    setBusy("generating");
    setError(null);
    try {
      const result = await generate({ data: { description: request } });
      if (result.ok) setPlan(result.plan);
      else { setPlan(null); setError(result.error); }
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error && e.message ? e.message : "Could not reach the plan service. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const applyPlan = async () => {
    if (!plan || changes.length === 0 || !connected || busy) return;
    setBusy("applying");
    try {
      await onApply(planCommands(changes));
      toast.success(`Applied “${plan.title}”`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Describe the lighting and devices you want. AI creates a plan you can check before anything is sent to the city.
      </p>
      <label htmlFor="ai-plan-request" className="sr-only">Describe the setup you want</label>
      <Textarea
        id="ai-plan-request"
        value={description}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder="e.g. Night event: street and building lights on, red beacons on, wind turbine running"
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void createPlan(); }}
        className="glass-control resize-none"
      />
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setDescription(example)}
            className="rounded-full border border-border/60 px-3 py-1 text-left text-xs text-muted-foreground transition hover:bg-muted/60">
            {example}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => { void createPlan(); }} disabled={!valid || busy !== null} className="h-11 flex-1 rounded-xl">
          {busy === "generating" ? <Loader2 className="animate-spin" /> : <WandSparkles />}
          {busy === "generating" ? "Creating plan…" : "Create plan"}
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">{description.length}/{MAX_LENGTH}</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {plan && (
        <div className="space-y-3 rounded-2xl border border-border/60 p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan preview</p>
              <h3 className="font-display font-semibold">{plan.title}</h3>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${IMPACT_STYLE[plan.powerImpact]}`}>
              {plan.powerImpact} power
            </span>
          </div>
          <p className="text-sm">{plan.summary}</p>
          {plan.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">This plan doesn't change any devices.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {orderPlanActions(plan.actions).map(({ device, enabled }) => {
                const unchanged = state[device] === enabled;
                return (
                  <li key={device} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-medium">{PLAN_DEVICES[device]}</span>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${unchanged ? "text-muted-foreground" : enabled ? "text-success" : "text-destructive"}`}>
                      {unchanged ? <><Check size={14} />Already {enabled ? "on" : "off"}</> : `Turn ${enabled ? "on" : "off"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Button onClick={() => { void applyPlan(); }} disabled={!connected || changes.length === 0 || busy !== null} className="h-11 flex-1 rounded-xl">
              {busy === "applying" ? <Loader2 className="animate-spin" /> : <Play />}
              {changes.length === 0 ? "Nothing to change" : `Apply ${changes.length} change${changes.length === 1 ? "" : "s"}`}
            </Button>
            <Button variant="ghost" onClick={() => { setPlan(null); setError(null); }} disabled={busy !== null} className="glass-control h-11 rounded-xl">
              <RotateCcw /> Discard
            </Button>
          </div>
          {!connected && <p className="text-xs text-muted-foreground">Connect to the city or start Demo mode to apply this plan.</p>}
        </div>
      )}
    </div>
  );
}
