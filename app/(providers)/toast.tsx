"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastItem = { id: number; text: string };
type ToastContextType = { toasts: ToastItem[]; show: (text: string) => void };

const ToastCtx = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const show = useCallback((text: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const value = useMemo(() => ({ toasts, show }), [toasts, show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* Portal area */}
      <div role="status" aria-live="polite" className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass rounded-lg px-3 py-2 text-sm shadow-lg border border-white/15 pointer-events-auto"
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToasts must be used within <ToastProvider>");
  return ctx;
}
