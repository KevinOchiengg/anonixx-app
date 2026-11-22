"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import ConfirmDialog, { type ConfirmOptions } from "@/components/ConfirmDialog";

export type { ConfirmOptions, AlertIcon } from "@/components/ConfirmDialog";

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

let host: Confirm | null = null;

/** Shows the Anonixx alert from anywhere; resolves true when the main action is chosen. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return host ? host(options) : Promise.resolve(false);
}

/** A notice with a single button. */
export function showAlert(options: Omit<ConfirmOptions, "cancelLabel">): Promise<boolean> {
  return askConfirm({ confirmLabel: "Got it", ...options, cancelLabel: null });
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  useEffect(() => {
    host = confirm;
    return () => { if (host === confirm) host = null; };
  }, [confirm]);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const cancel = useCallback(() => settle(false), [settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={cancel} /> : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
