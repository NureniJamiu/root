import { useCallback, useEffect, useState } from 'react';

import { onSaveError as onStoreSaveError } from '../data';
import { onLoadError, onSaveError as onPersistenceSaveError } from '../persistence';

interface Toast {
  id: number;
  message: string;
}

let toastCounter = 0;

/** How long (ms) before a toast auto-dismisses. */
const TOAST_LIFETIME_MS = 4_000;

/**
 * Subscribes to the data-store and persistence error buses and renders each
 * error as a dismissable toast that clears itself after a few seconds.
 */
export function ToastSurface(): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    // Schema-level errors from the data store.
    const unsubStore = onStoreSaveError((detail) => {
      addToast(`Save error (${detail.action}): ${detail.message}`);
    });
    // Failures saving a project to the server.
    const unsubPersistSave = onPersistenceSaveError((detail) => {
      addToast(`Not saved: ${detail.message}`);
    });
    // Failures loading a project from the server.
    const unsubLoad = onLoadError((detail) => {
      addToast(detail.message);
    });
    return () => {
      unsubStore();
      unsubPersistSave();
      unsubLoad();
    };
  }, [addToast]);

  if (toasts.length === 0) return <></>;

  return (
    <div
      data-testid="toast-surface"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          style={{
            background: 'rgb(var(--ink))',         // inverted surface: ink in light, paper in dark
            color: 'rgb(var(--on-inverse))',
            border: '1px solid rgb(var(--ink-2))',   // color.text.tertiary
            borderRadius: 2,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
            fontSize: 13,                  // font.size.sm
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgb(var(--question))', // warning accent
              flexShrink: 0,
            }}
          />
          <span style={{ letterSpacing: '-0.01em' }}>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="transition-colors hover:text-question"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgb(var(--on-inverse))',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
              fontFamily: 'inherit',
              fontSize: 14,
              opacity: 0.8,
            }}
            data-testid="toast-dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
