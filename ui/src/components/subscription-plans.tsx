import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  Radio,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface SignalPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  tagline: string;
  popular: boolean;
  features: string[];
}

interface Subscription {
  id: string;
  plan: string;
  planName: string;
  amountUsd: string;
  status: string;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
}

interface SubscriptionSectionProps {
  onSubscribed?: () => void;
}

const PLAN_ICONS: Record<string, typeof Radio> = {
  basic: Radio,
  premium: Zap,
  vip: Crown,
};

export function SubscriptionSection({ onSubscribed }: SubscriptionSectionProps) {
  const [plans, setPlans] = useState<SignalPlan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/subscriptions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load subscription plans");
      setPlans(data.plans ?? []);
      setCurrent(data.current ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load subscription plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 6000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleSubscribe = async (planId: string) => {
    setSubscribing(planId);
    setSuccess(null);
    setError(null);
    try {
      const res = await apiFetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscription failed");

      setCurrent(data.subscription ?? null);
      const balanceText =
        typeof data.newBalance === "number"
          ? ` New balance: $${data.newBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}.`
          : "";
      setSuccess(`${data.message ?? "Subscription activated."}${balanceText}`);
      onSubscribed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(null);
    }
  };

  const hasActive = current !== null;

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-3">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-bold text-base">Signal Subscriptions</h3>
          <p className="text-[11px] text-muted-foreground">
            Premium trade signals, paid from your real account balance.
          </p>
        </div>
      </div>

      {current && (
        <div className="mt-4 p-3 bg-primary/10 border border-primary/20 text-primary rounded-lg text-sm flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>
            Active: <strong>{current.planName}</strong> — expires{" "}
            {new Date(current.expiresAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {loadError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
          <button
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              fetchSubscriptions();
            }}
            className="underline ml-auto shrink-0 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        !loadError && (
          <p className="mt-4 text-sm text-muted-foreground">
            No subscription plans are available right now.
          </p>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] ?? Radio;
            const isCurrent = current?.plan === plan.id;
            const isBusy = subscribing === plan.id;
            const isVip = plan.id === "vip";
            const highlighted = plan.popular && !isCurrent;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-4 transition-colors ${
                  isCurrent
                    ? "border-primary/50 bg-primary/5"
                    : highlighted
                      ? "border-primary/40 bg-card shadow-sm"
                      : "border-border bg-card"
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white">
                    Current plan
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isVip ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="font-bold text-sm">{plan.name}</h4>
                </div>

                <div className="mt-3 flex items-end gap-1">
                  <span className="text-2xl font-extrabold">${plan.price}</span>
                  <span className="text-xs text-muted-foreground mb-1">
                    / {plan.durationDays} days
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{plan.tagline}</p>

                <ul className="mt-3 space-y-1.5 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={subscribing !== null || hasActive}
                  variant={highlighted ? "default" : "outline"}
                  className={`w-full mt-4 gap-1.5 ${
                    highlighted
                      ? "bg-primary text-primary-foreground"
                      : isVip
                        ? "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        : ""
                  }`}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                    </>
                  ) : isCurrent ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Current Plan
                    </>
                  ) : (
                    `Subscribe $${plan.price}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[10px] text-muted-foreground">
        Subscription fees are deducted from your real account balance. Each plan runs for{" "}
        {plans[0]?.durationDays ?? 30} days from activation.
      </p>
    </div>
  );
}
