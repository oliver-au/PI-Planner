import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import { UNASSIGNED_DEVELOPER_ID } from '../constants';

type DeveloperManagerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DeveloperManagerModal({ open, onClose }: DeveloperManagerModalProps) {
  const {
    developers,
    addDeveloper,
    updateDeveloper,
    removeDeveloper,
  } = usePiStore(
    useShallow((state) => ({
      developers: state.developers,
      addDeveloper: state.addDeveloper,
      updateDeveloper: state.updateDeveloper,
      removeDeveloper: state.removeDeveloper,
    })),
  );

  const [draftName, setDraftName] = useState('');
  const filteredDevelopers = useMemo(
    () => developers.filter((dev) => dev.id !== UNASSIGNED_DEVELOPER_ID),
    [developers],
  );

  if (!open) return null;

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addDeveloper(draftName);
    setDraftName('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="developer-manager-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="developer-manager-title" className="text-lg font-semibold text-slate-900">
            Manage Developers
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
            Tickets without an owner appear in the <span className="font-medium">Unassigned</span> row.
          </p>
          <section className="mt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active Developers
            </h3>
            <ul className="space-y-2">
              {filteredDevelopers.length === 0 ? (
                <li className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  No developers yet. Add someone below.
                </li>
              ) : (
                filteredDevelopers.map((developer) => (
                  <li
                    key={developer.id}
                    className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
                  >
                    <input
                      defaultValue={developer.name}
                      onBlur={(event) =>
                        updateDeveloper(developer.id, { name: event.target.value })
                      }
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeDeveloper(developer.id)}
                      className="rounded-md border border-transparent px-2 py-1 text-xs font-medium text-red-600 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
        <footer className="border-t border-slate-200 px-5 py-4">
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="New developer name"
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
