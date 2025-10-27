import { useMemo, useRef, useState } from 'react';
import type { PlannerData } from '../lib/persist';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';

interface DataManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function DataManagerModal({ open, onClose }: DataManagerModalProps) {
  const { getPlannerSnapshot, replaceState, announce } = usePiStore(
    useShallow((state) => ({
      getPlannerSnapshot: state.getPlannerSnapshot,
      replaceState: state.replaceState,
      announce: state.announce,
    })),
  );

  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportJson = useMemo(() => {
    if (!open) return '';
    try {
      return JSON.stringify(getPlannerSnapshot(), null, 2);
    } catch (error) {
      console.warn('Failed to build export JSON', error);
      return '';
    }
  }, [getPlannerSnapshot, open]);

  if (!open) return null;

  const resetState = () => {
    setImportText('');
    setError(null);
    setIsDraggingFile(false);
  };

  const validatePlannerData = (data: unknown): data is PlannerData => {
    if (!data || typeof data !== 'object') return false;
    const record = data as Record<string, unknown>;
    return (
      Array.isArray(record.sprints) &&
      Array.isArray(record.developers) &&
      Array.isArray(record.features) &&
      Array.isArray(record.tickets)
    );
  };

  const importFromString = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (!validatePlannerData(parsed)) {
        setError('JSON must include sprints, developers, features, and tickets arrays.');
        return;
      }
      replaceState(parsed);
      announce('Planner data imported.');
      resetState();
      onClose();
    } catch (error) {
      console.warn('Import failed', error);
      setError('Invalid JSON. Update the text and try again.');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      announce('Planner data copied to clipboard.');
    } catch (error) {
      console.warn('Clipboard copy failed', error);
      announce('Unable to copy to clipboard.');
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([exportJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'pi-planner.json';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Download failed', error);
      announce('Unable to generate download.');
    }
  };

  const handleImport = () => {
    importFromString(importText);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    try {
      const text = await file.text();
      importFromString(text);
    } catch (error) {
      console.warn('Failed to read file', error);
      setError('Unable to read selected file.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          resetState();
          onClose();
        }
      }}
    >
      <div
        className="flex w-full max-w-3xl flex-col gap-6 rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Export / Import Planner Data</h2>
            <p className="text-sm text-slate-500">Use JSON to share, back up, or restore the current PI plan.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetState();
              onClose();
            }}
            className="rounded-md border border-transparent p-2 text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-800">Export JSON</h3>
            <textarea
              value={exportJson}
              readOnly
              className="h-64 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center rounded-md border border-sky-600 px-3 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                Download JSON
              </button>
            </div>
          </div>

          <div
            className={`flex flex-col gap-3 rounded-md border ${
              isDraggingFile ? 'border-sky-400 bg-sky-50' : 'border-dashed border-slate-300'
            } p-3 transition`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
              handleFileUpload(event.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Import JSON</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Choose file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => handleFileUpload(event.target.files)}
                />
              </div>
            </div>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              className="h-48 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
              placeholder="Paste planner JSON here or drop a file"
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportText('');
                  setError(null);
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Import data
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Drag and drop a .json file onto this panel or paste raw JSON to import. Data will be validated before applying.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
