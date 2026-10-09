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
  defaultPhone?: string;
}

const PLAN_ICONS: Record<string, typeof Radio> = {
  basic: Radio,
  premium: Zap,
  vip: Crown,
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export function SubscriptionSection({ onSubscribed, defaultPhone = "" }: SubscriptionSectionProps) {
  const [plans, setPlans] = useState<SignalPlan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalPlan, setModalPlan] = useState<SignalPlan | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [phone, setPhone] = useState(defaultPhone);

  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    onSubscribedRef.current = onSubscribed;
  }, [onSubscribed]);

  useEffect(() => {
    setPhone((prev) => (prev ? prev : defaultPhone));
  }, [defaultPhone]);

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

  const openModal = (plan: SignalPlan) => {
    setModalError(null);
    setModalPlan(plan);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalPlan(null);
    setModalError(null);
  };

  const confirmSubscribe = async () => {
    if (!modalPlan) return;
    const planId = modalPlan.id;
    setSubmitting(planId);
    setModalError(null);
    try {
      const res = await apiFetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, phoneNumber: phone.trim() }),
      });
      const data = await safeJson<SubscribeResponse>(res);
      if (!res.ok || !data) {
        throw new Error(data?.error || `Could not start M-Pesa payment (HTTP ${res.status})`);
      }
      setModalPlan(null);
      setNotice(data.message ?? "M-Pesa prompt sent. Enter your PIN to complete payment.");
      setAwaiting(planId);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not start M-Pesa payment");
    } finally {
      setSubmitting(null);
    }
  };

  const busy = submitting !== null || awaiting !== null || current !== null;
  const ModalIcon = modalPlan ? PLAN_ICONS[modalPlan.id] ?? Radio : Radio;

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-3">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-bold text-base">Signal Subscriptions</h3>
          <p className="text-[11px] text-muted-foreground">
            Pay via M-Pesa. A prompt is sent to the number you confirm.
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
                  <Button size="sm" onClick={() => openModal(plan)} disabled={busy}>
                    {isAwaiting ? (
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

      {modalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <ModalIcon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-base leading-tight">
                    Subscribe to {modalPlan.name}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">M-Pesa STK push</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground rounded-full p-1 hover:bg-muted transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-muted/50 rounded-lg px-4 py-2.5 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="font-semibold text-sm">
                  ${modalPlan.price} / {modalPlan.durationDays} days
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXX or 254XXXXXXXX"
                  className="w-full p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[10px] text-muted-foreground">
                  You will receive the payment prompt on this number.
                </p>
              </div>

              {modalError && (
                <p className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">{modalError}</p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={closeModal}
                  disabled={submitting !== null}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmSubscribe}
                  disabled={submitting !== null || !phone.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...
                    </>
                  ) : (
                    "Send M-Pesa Prompt"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
