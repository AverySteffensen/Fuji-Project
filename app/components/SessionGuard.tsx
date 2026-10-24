"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
type Status = {
  state: "ready" | "verify" | "enroll" | "expired";
  email: string;
  expiresAt: number;
  serverTime: number;
};
export default function SessionGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(900);
  const offset = useRef(0),
    activity = useRef(0),
    lastTouch = useRef(0);
  const accept = useCallback((data: Status) => {
    offset.current = data.serverTime - Date.now();
    setStatus(data);
  }, []);
  const call = async <T,>(url: string, input?: unknown): Promise<T> => {
    const response = await fetch(
      url,
      input
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }
        : { cache: "no-store" },
    );
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || "Please try again.");
    return data;
  };
  const refresh = useCallback(async () => {
    try {
      accept(await call<Status>("/api/security/session"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [accept]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const touch = useCallback(async () => {
    try {
      const result = await call<
        Pick<Status, "state" | "expiresAt" | "serverTime">
      >("/api/security/session", { action: "touch" });
      lastTouch.current = Date.now();
      setStatus((old) => (old ? { ...old, ...result } : old));
      offset.current = result.serverTime - Date.now();
    } catch {
      await refresh();
    }
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== "ready") return;
    const onActivity = () => {
      activity.current = Date.now();
    };
    const onRequired = () => {
      void refresh();
    };
    document.addEventListener("pointerdown", onActivity);
    document.addEventListener("keydown", onActivity);
    window.addEventListener("fuji-security-required", onRequired);
    const clock = setInterval(() => {
      setRemaining(
        Math.max(
          0,
          Math.ceil((status.expiresAt - Date.now() - offset.current) / 1000),
        ),
      );
      if (
        Date.now() - activity.current < 30_000 &&
        Date.now() - lastTouch.current > 30_000
      )
        void touch();
    }, 1000);
    const check = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(check);
      document.removeEventListener("pointerdown", onActivity);
      document.removeEventListener("keydown", onActivity);
      window.removeEventListener("fuji-security-required", onRequired);
    };
  }, [status?.state, status?.expiresAt, touch, refresh]);
  useEffect(() => {
    if (status?.state === "ready" && remaining === 0) {
      void call("/api/security/session", { action: "logout" }).finally(() => {
        setStatus((old) => (old ? { ...old, state: "expired" } : old));
        try {
          window.top!.location.href = "/signout-with-chatgpt?return_to=/";
        } catch {
          /* The signed-out screen retains the top-level navigation link. */
        }
      });
    }
  }, [remaining, status?.state]);
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await call<{ recoveryCodes?: string[] }>(
        "/api/security/mfa",
        { action: secret ? "confirm" : "verify", code },
      );
      setCode("");
      setSecret("");
      if (data.recoveryCodes) setRecovery(data.recoveryCodes);
      else await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (recovery.length)
    return (
      <main className="security-screen">
        <section className="security-panel">
          <h1>Save your recovery codes</h1>
          <p>
            Each code works once if your authenticator is unavailable. Keep
            these in a secure place.
          </p>
          <pre className="recovery-codes">{recovery.join("\n")}</pre>
          <button
            className="btn primary"
            onClick={() => {
              setRecovery([]);
              void refresh();
            }}
          >
            I have saved the codes
          </button>
        </section>
      </main>
    );
  if (status?.state === "ready")
    return (
      <>
        {children}
        {remaining <= 60 && (
          <div className="session-warning" role="alert">
            <strong>Your session ends in {remaining} seconds.</strong>
            <button className="btn primary" onClick={() => void touch()}>
              Stay signed in
            </button>
            <a
              className="btn"
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign out
            </a>
          </div>
        )}
      </>
    );
  return (
    <main className="security-screen">
      <section className="security-panel">
        <p className="overline">FUJI PURCHASING REGISTER</p>
        <h1>
          {status?.state === "enroll"
            ? "Set up account protection"
            : status?.state === "verify"
              ? "Verify your account"
              : status?.state === "expired"
                ? "Your session has ended"
                : "Opening your workspace…"}
        </h1>
        {status?.state === "expired" ? (
          <>
            <p>Sign in again to continue.</p>
            <a
              className="btn primary"
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign in again
            </a>
          </>
        ) : (
          status && (
            <>
              <p>{status.email}</p>
              <p>
                {status.state === "enroll"
                  ? "Approvers, Accounting and administrators need an authenticator code to open purchasing records."
                  : "Enter the current six-digit code from your authenticator, or a single-use recovery code."}
              </p>
              {status.state === "enroll" && !secret ? (
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const data = await call<{ secret: string }>(
                        "/api/security/mfa",
                        { action: "enroll" },
                      );
                      setSecret(data.secret);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Set up authenticator
                </button>
              ) : (
                <form onSubmit={verify}>
                  {secret && (
                    <>
                      <p>
                        Add a new account in your authenticator using this setup
                        key. Choose time-based codes.
                      </p>
                      <label>
                        Setup key
                        <input
                          value={secret}
                          readOnly
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    {secret
                      ? "Six-digit authenticator code"
                      : "Authenticator or recovery code"}
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={30}
                      required
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    {busy ? "Verifying…" : "Verify and continue"}
                  </button>
                </form>
              )}
            </>
          )
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
            <a href="/signin-with-chatgpt?return_to=/" target="_top">
              Sign in with ChatGPT
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
