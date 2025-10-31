import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { usePiStore } from '../store/piStore';

interface FeatureRenameModalProps {
  featureId: string;
  initialName: string;
  initialUrl?: string | null;
  open: boolean;
  onClose: () => void;
}

const isValidUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export function FeatureRenameModal({ featureId, initialName, initialUrl, open, onClose }: FeatureRenameModalProps) {
  const updateFeature = usePiStore((state) => state.updateFeature);
  const [nameValue, setNameValue] = useState(initialName);
  const [linkValue, setLinkValue] = useState(initialUrl ?? '');
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNameValue(initialName);
      setLinkValue(initialUrl ?? '');
      setLinkError(null);
    }
  }, [initialName, initialUrl, open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = nameValue.trim();
    const trimmedLink = linkValue.trim();

    if (trimmedLink && !isValidUrl(trimmedLink)) {
      setLinkError('Enter a valid URL (include https://).');
      return;
    }

    const patch: { name?: string; url?: string } = {};
    if (trimmedName && trimmedName !== initialName) {
      patch.name = trimmedName;
    }
    const previousLink = initialUrl ?? '';
    if (trimmedLink !== previousLink) {
      patch.url = trimmedLink ? trimmedLink : undefined;
    }

    if (Object.keys(patch).length > 0) {
      updateFeature(featureId, patch);
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-rename-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="feature-rename-title" className="text-lg font-semibold text-slate-900">
            Edit feature details
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
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            Feature name
            <input
              value={nameValue}
              onChange={(event) => setNameValue(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            Feature link (optional)
            <input
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
                if (linkError) {
                  setLinkError(null);
                }
              }}
              className={`rounded-md border px-3 py-2 ${linkError ? 'border-red-500' : 'border-slate-300'}`}
              placeholder="https://product.example.com/features/overview"
            />
            {linkError ? (
              <span className="text-xs text-red-600" role="alert">
                {linkError}
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Used when opening the feature from the accordion header.
              </span>
            )}
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
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
