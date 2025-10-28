import { useState, useEffect, type FormEvent } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';

type TicketBaseUrlModalProps = {
  open: boolean;
  onClose: () => void;
};

export function TicketBaseUrlModal({ open, onClose }: TicketBaseUrlModalProps) {
  const { ticketBaseUrl, setTicketBaseUrl } = usePiStore(
    useShallow((state) => ({
      ticketBaseUrl: state.ticketBaseUrl,
      setTicketBaseUrl: state.setTicketBaseUrl,
    })),
  );

  const [value, setValue] = useState(ticketBaseUrl ?? '');

  useEffect(() => {
    if (open) {
      setValue(ticketBaseUrl ?? '');
    }
  }, [open, ticketBaseUrl]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    setTicketBaseUrl(trimmed.length ? trimmed : null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-base-url-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="ticket-base-url-title" className="text-lg font-semibold text-slate-900">
            Ticket Link Base
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent p-2 text-slate-600 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </header>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="flex flex-col gap-2 text-sm text-slate-700">
            <label htmlFor="ticket-base-url" className="font-medium">
              Base URL
            </label>
            <input
              id="ticket-base-url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://jira.example.com/browse/{key}"
            />
            <p className="text-xs text-slate-500">
              Use {`{key}`} as a placeholder for the ticket key, or leave it out to append the key after the base. Leave blank to clear the setting.
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setValue('');
                setTicketBaseUrl(null);
                onClose();
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Clear
            </button>
            <button
              type="submit"
              className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
