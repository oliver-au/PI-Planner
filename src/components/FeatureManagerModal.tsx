import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';

type FeatureManagerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function FeatureManagerModal({ open, onClose }: FeatureManagerModalProps) {
  const { features, addFeature, updateFeature, removeFeature } = usePiStore(
    useShallow((state) => ({
      features: state.features,
      addFeature: state.addFeature,
      updateFeature: state.updateFeature,
      removeFeature: state.removeFeature,
    })),
  );

  const [draftName, setDraftName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [urlErrors, setUrlErrors] = useState<Record<string, string | null>>({});

  const sortedFeatures = useMemo(
    () => [...features].sort((a, b) => a.name.localeCompare(b.name)),
    [features],
  );

  useEffect(() => {
    setDrafts(() =>
      sortedFeatures.reduce<Record<string, string>>((acc, feature) => {
        acc[feature.id] = feature.name;
        return acc;
      }, {}),
    );
    setUrlDrafts(() =>
      sortedFeatures.reduce<Record<string, string>>((acc, feature) => {
        acc[feature.id] = feature.url ?? '';
        return acc;
      }, {}),
    );
    setUrlErrors({});
  }, [sortedFeatures]);

  const isValidUrl = (value: string): boolean => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addFeature(draftName);
    setDraftName('');
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-manager-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="feature-manager-title" className="text-lg font-semibold text-slate-900">
            Manage Features
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent p-2 text-slate-600 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <p className="text-sm text-slate-600">
            Features organise tickets into swimlanes across the Program Increment.
          </p>
          <ul className="mt-4 space-y-2">
            {sortedFeatures.length === 0 ? (
              <li className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                No features yet. Add one below.
              </li>
            ) : (
              sortedFeatures.map((feature) => (
                <li
                  key={feature.id}
                  className="flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <input
                      value={drafts[feature.id] ?? feature.name}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [feature.id]: event.target.value,
                        }))
                      }
                      aria-label={`Feature name for ${feature.name}`}
                      onBlur={(event) => {
                        const nextName = event.target.value.trim();
                        if (!nextName || nextName === feature.name) {
                          setDrafts((prev) => ({
                            ...prev,
                            [feature.id]: feature.name,
                          }));
                          return;
                        }
                        updateFeature(feature.id, { name: nextName });
                        setDrafts((prev) => ({
                          ...prev,
                          [feature.id]: nextName,
                        }));
                      }}
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <div className="flex-1">
                      <input
                        value={urlDrafts[feature.id] ?? feature.url ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setUrlDrafts((prev) => ({
                            ...prev,
                            [feature.id]: value,
                          }));
                          setUrlErrors((prev) => ({
                            ...prev,
                            [feature.id]: null,
                          }));
                        }}
                        aria-label={`Feature link for ${feature.name}`}
                        onBlur={(event) => {
                          const rawValue = event.target.value;
                          const trimmed = rawValue.trim();
                          const previous = feature.url ?? '';
                          if (!trimmed) {
                            if (previous) {
                              updateFeature(feature.id, { url: undefined });
                            }
                            setUrlDrafts((prev) => ({
                              ...prev,
                              [feature.id]: '',
                            }));
                            return;
                          }
                          if (!isValidUrl(trimmed)) {
                            setUrlErrors((prev) => ({
                              ...prev,
                              [feature.id]: 'Enter a valid URL (include https://).',
                            }));
                            return;
                          }
                          if (trimmed !== previous) {
                            updateFeature(feature.id, { url: trimmed });
                          }
                          setUrlDrafts((prev) => ({
                            ...prev,
                            [feature.id]: trimmed,
                          }));
                        }}
                        placeholder="https://product.example.com/features/overview"
                        className={`w-full rounded-md border px-2 py-1 text-sm ${
                          urlErrors[feature.id] ? 'border-red-500' : 'border-slate-300'
                        }`}
                      />
                      {urlErrors[feature.id] ? (
                        <span className="mt-1 block text-xs text-red-600" role="alert">
                          {urlErrors[feature.id]}
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-slate-500">
                          Optional link used for the feature accordion.
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFeature(feature.id)}
                      className="self-start rounded-md border border-transparent px-2 py-1 text-xs font-medium text-red-600 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
        <footer className="border-t border-slate-200 px-5 py-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="New feature name"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              Add
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
