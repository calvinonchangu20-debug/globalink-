import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Crown, Loader2, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, safeJson } from "@/lib/api";

interface SignalPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
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

interface SubscriptionsResponse {
  plans?: SignalPlan[];
  current?: Subscription | null;
  error?: string;
}

interface SubscribeResponse {
  success?: boolean;
  message?: string;
  planName?: string;
  amount?: number;
  error?: string;
}

interface SubscriptionSectionProps {
  onSubscribed?: () => void;
}

const PLAN_ICONS: Record<string, typeof Radio> = {
  basic: Radio,
  premium: Zap,
  vip: Crown,
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export function SubscriptionSection({ onSubscribed }: SubscriptionSectionProps) {
  const [plans, setPlans] = useState<SignalPlan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    onSubscribedRef.current = onSubscribed;
  }, [onSubscribed]);

  const fetchSubscriptions = useCallback(async (): Promise<Subscription | null> => {
    try {
      const res = await apiFetch("/api/subscriptions");
      const data = await safeJson<SubscriptionsResponse>(res);
      if (!res.ok || !data) {
        throw new Error(data?.error || `Failed to load subscription plans (HTTP ${res.status})`);
      }
      setPlans(data.plans ?? []);
      setCurrent(data.current ?? null);
      setLoadError(null);
      return data.current ?? null;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load subscription plans");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    if (!awaiting) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setAwaiting(null);
        setNotice(null);
        setError("We didn't receive your M-Pesa confirmation. If you cancelled or the prompt expired, please try again.");
        return;
      }
      const active = await fetchSubscriptions();
      if (active) {
        clearInterval(timer);
        setAwaiting(null);
        setNotice(null);
        setSuccess(`Subscription active: ${active.planName}. You can now receive signals.`);
        onSubscribedRef.current?.();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [awaiting, fetchSubscriptions]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 8000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleSubscribe = async (planId: string) => {
    setSubmitting(planId);
    setSuccess(null);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await safeJson<SubscribeResponse>(res);
      if (!res.ok || !data) {
        throw new Error(data?.error || `Could not start M-Pesa payment (HTTP ${res.status})`);
      }
      setNotice(data.message ?? "M-Pesa prompt sent. Enter your PIN to complete payment.");
      setAwaiting(planId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start M-Pesa payment");
    } finally {
      setSubmitting(null);
    }
  };

  const busy = submitting !== null || awaiting !== null || current !== null;

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-3">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-bold text-base">Signal Subscriptions</h3>
          <p className="text-[11px] text-muted-foreground">
            Pay via M-Pesa. A prompt is sent to the number on your account.
          </p>
        </div>
      </div>

      {current && (
        <div className="mt-4 p-3 bg-primary/10 border border-primary/20 text-primary rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
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
      {notice && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-lg text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {notice}
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
        <div className="space-y-2 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        !loadError && (
          <p className="mt-4 text-sm text-muted-foreground">
            No subscription plans are available right now.
          </p>
        )
      ) : (
        <div className="space-y-2 mt-4">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] ?? Radio;
            const isSubmitting = submitting === plan.id;
            const isAwaiting = awaiting === plan.id;
            return (
              <div
                key={plan.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-sm">{plan.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base font-extrabold">${plan.price}</span>
                  <Button size="sm" onClick={() => handleSubscribe(plan.id)} disabled={busy}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...
                      </>
                    ) : isAwaiting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting...
                      </>
                    ) : (
                      "Subscribe"
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
