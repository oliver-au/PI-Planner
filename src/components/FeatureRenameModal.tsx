import { useState, useEffect } from 'react';
import { usePiStore } from '../store/piStore';

interface FeatureRenameModalProps {
  featureId: string;
  initialName: string;
  open: boolean;
  onClose: () => void;
}

export function FeatureRenameModal({ featureId, initialName, open, onClose }: FeatureRenameModalProps) {
  const updateFeature = usePiStore((state) => state.updateFeature);
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    if (open) {
      setValue(initialName);
    }
  }, [initialName, open]);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialName) {
      updateFeature(featureId, { name: trimmed });
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
            Rename Feature
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
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
              autoFocus
            />
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
