import { useEffect, useRef } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';

export function NoticeStack() {
  const { notices, dismissNotice } = usePiStore(
    useShallow((state) => ({
      notices: state.notices,
      dismissNotice: state.dismissNotice,
    })),
  );

  const timerMapRef = useRef<Record<number, number>>({});

  useEffect(() => {
    notices.forEach((notice) => {
      if (timerMapRef.current[notice.id]) return;
      timerMapRef.current[notice.id] = window.setTimeout(() => {
        dismissNotice(notice.id);
        delete timerMapRef.current[notice.id];
      }, 4500);
    });

    return () => {
      Object.values(timerMapRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      timerMapRef.current = {};
    };
  }, [dismissNotice, notices]);

  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[220] flex max-w-sm flex-col gap-3">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-md ${
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            onClick={() => {
              const timer = timerMapRef.current[notice.id];
              if (timer) {
                window.clearTimeout(timer);
                delete timerMapRef.current[notice.id];
              }
              dismissNotice(notice.id);
            }}
            className="ml-2 rounded border border-transparent px-2 py-1 text-xs font-medium text-slate-500 hover:border-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}
