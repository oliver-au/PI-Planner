import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import type { Sprint, Ticket } from '../types';
import { currentSprintId as getTicketCurrentSprintId, isMoveBlockedByDeps as checkMoveBlocked, sortSprintTrail } from '../lib/calc';
import { BACKLOG_COLUMN_ID } from '../constants';

type TicketEditModalContext = {
  openEdit: (id: string) => void;
};

let setModalState: ((state: ModalState) => void) | null = null;

export const useTicketEditModal = (): TicketEditModalContext => ({
  openEdit: (id: string) => {
    setModalState?.({ open: true, ticketId: id });
  },
});

type ModalState = {
  open: boolean;
  ticketId: string | null;
};

export function TicketEditModalHost() {
  const [modalState, setState] = useState<ModalState>({ open: false, ticketId: null });
  setModalState = setState;

  const { tickets, updateTicket, announce, features, developers, sprints, refreshTicketPositions, pushNotice, currentSprintId } = usePiStore(
    useShallow((state) => ({
      tickets: state.tickets,
      updateTicket: state.updateTicket,
      announce: state.announce,
      features: state.features,
      developers: state.developers,
      sprints: state.sprints,
      refreshTicketPositions: state.refreshTicketPositions,
      pushNotice: state.pushNotice,
      currentSprintId: state.currentSprintId,
    })),
  );

  const orderedSprintIds = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order).map((sprint) => sprint.id),
    [sprints],
  );

  if (!modalState.open || !modalState.ticketId) return null;

  const ticket = tickets.find((t) => t.id === modalState.ticketId);
  if (!ticket) return null;

  const handleClose = () => setState({ open: false, ticketId: null });

  const handleSave = (updates: Partial<Ticket>) => {
    const nextTicket: Ticket = {
      ...ticket,
      ...updates,
      sprintIds: updates.sprintIds ?? ticket.sprintIds,
      dependencies: updates.dependencies ?? ticket.dependencies,
      developerId: updates.developerId ?? ticket.developerId,
      featureId: updates.featureId ?? ticket.featureId,
      storyPoints: updates.storyPoints ?? ticket.storyPoints,
      name: updates.name ?? ticket.name,
    };

    const targetSprintId = getTicketCurrentSprintId(nextTicket);
    const { blocked, blockers } = checkMoveBlocked(
      nextTicket,
      targetSprintId,
      (id) => (id === nextTicket.id ? nextTicket : tickets.find((t) => t.id === id)),
      orderedSprintIds,
    );

    if (blocked) {
      const blockerKeys = blockers
        .map((id) => tickets.find((candidate) => candidate.id === id)?.key ?? id)
        .join(', ');
      const message = blockers.length
        ? `Update blocked. ${nextTicket.key} depends on ${blockerKeys} scheduled later.`
        : `Update blocked. Resolve dependency ordering before moving ${nextTicket.key}.`;
      announce(message);
      pushNotice(message, 'error');
      return;
    }

    updateTicket(ticket.id, updates);
    announce(`${ticket.key} updated.`);
    refreshTicketPositions();
    handleClose();
  };

  return (
    <TicketEditModal
      ticket={ticket}
      features={features}
      developers={developers}
      sprints={sprints}
      allTickets={tickets}
      currentSprintId={currentSprintId}
      onClose={handleClose}
      onSave={handleSave}
    />
  );
}

type TicketEditModalProps = {
  ticket: Ticket;
  features: { id: string; name: string }[];
  developers: { id: string; name: string }[];
  sprints: Sprint[];
  allTickets: Ticket[];
  currentSprintId: string | null;
  onClose: () => void;
  onSave: (updates: Partial<Ticket>) => void;
};

function TicketEditModal({ ticket, features, developers, sprints, allTickets, onClose, onSave, currentSprintId }: TicketEditModalProps) {
  const orderedSprintIds = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order).map((sprint) => sprint.id),
    [sprints],
  );

  const normalizeSprintTrail = useCallback(
    (trail: string[]) => {
      const unique = Array.from(new Set(trail));
      const hasBacklog = unique.includes(BACKLOG_COLUMN_ID);
      const sprintOnly = unique.filter((id) => id !== BACKLOG_COLUMN_ID);
      const sorted = sortSprintTrail(sprintOnly, orderedSprintIds);
      const composed = hasBacklog ? [BACKLOG_COLUMN_ID, ...sorted] : sorted;
      return composed.length > 0 ? composed : [BACKLOG_COLUMN_ID];
    },
    [orderedSprintIds],
  );

  const sprintOptions = useMemo(
    () => [BACKLOG_COLUMN_ID, ...orderedSprintIds],
    [orderedSprintIds],
  );

  const sprintLabel = useCallback(
    (id: string) => {
      if (id === BACKLOG_COLUMN_ID) return 'Backlog';
      const sprint = sprints.find((s) => s.id === id);
      if (!sprint) return id;
      const suffix =
        currentSprintId && sprint.id === currentSprintId ? ' (Current)' : '';
      return `${sprint.name}${suffix}`;
    },
    [currentSprintId, sprints],
  );

  const [form, setForm] = useState({
    name: ticket.name,
    storyPoints: String(ticket.storyPoints),
    developerId: ticket.developerId,
    featureId: ticket.featureId,
    sprintTrail: normalizeSprintTrail(ticket.sprintIds),
    dependencyIds: ticket.dependencies,
    dependencyQuery: '',
  });
  const dependencyInputRef = useRef<HTMLInputElement | null>(null);
  const [suggestionRect, setSuggestionRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [dependencyFocused, setDependencyFocused] = useState(false);

  const handleFieldChange = (key: 'name' | 'storyPoints' | 'developerId' | 'featureId', value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'featureId') {
        const validIds = new Set(
          allTickets
            .filter((candidate) => candidate.featureId === value)
            .map((candidate) => candidate.id),
        );
        next.dependencyIds = prev.dependencyIds.filter((depId) => validIds.has(depId));
      }
      return next;
    });
  };

  const toggleSprint = useCallback(
    (id: string) => {
      setForm((prev) => {
        const current = new Set(prev.sprintTrail);
        if (current.has(id)) {
          if (current.size === 1) {
            return prev;
          }
          current.delete(id);
        } else {
          current.add(id);
        }
        const nextTrail = normalizeSprintTrail(Array.from(current));
        return { ...prev, sprintTrail: nextTrail };
      });
    },
    [normalizeSprintTrail],
  );

  useEffect(() => {
    setForm({
      name: ticket.name,
      storyPoints: String(ticket.storyPoints),
      developerId: ticket.developerId,
      featureId: ticket.featureId,
      sprintTrail: normalizeSprintTrail(ticket.sprintIds),
      dependencyIds: ticket.dependencies,
      dependencyQuery: '',
    });
  }, [
    ticket.id,
    ticket.name,
    ticket.storyPoints,
    ticket.developerId,
    ticket.featureId,
    ticket.sprintIds,
    ticket.dependencies,
    normalizeSprintTrail,
  ]);

  const updateSuggestionRect = useCallback(() => {
    if (!dependencyInputRef.current) return;
    const rect = dependencyInputRef.current.getBoundingClientRect();
    setSuggestionRect({ left: rect.left, top: rect.bottom + 8, width: rect.width });
  }, []);

  useEffect(() => {
    if (!dependencyFocused) {
      setSuggestionRect(null);
      return;
    }
    updateSuggestionRect();
    const handle = () => updateSuggestionRect();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [dependencyFocused, form.dependencyQuery, updateSuggestionRect]);

  const handleSubmit = () => {
    const storyPoints = Number.parseInt(form.storyPoints, 10);
    if (!form.name.trim() || Number.isNaN(storyPoints) || storyPoints <= 0) {
      return;
    }
    onSave({
      name: form.name.trim(),
      storyPoints,
      developerId: form.developerId,
      featureId: form.featureId,
      sprintIds: form.sprintTrail,
      dependencies: form.dependencyIds,
    });
  };

  const ticketMap = useMemo(() => {
    const map = new Map<string, Ticket>();
    allTickets.forEach((t: Ticket) => {
      map.set(t.id, t);
    });
    return map;
  }, [allTickets]);

  const availableTickets = useMemo<Ticket[]>(
    () =>
      allTickets.filter(
        (candidate: Ticket) =>
          candidate.featureId === form.featureId && candidate.id !== ticket.id,
      ),
    [allTickets, form.featureId, ticket.id],
  );

  const filteredSuggestions = useMemo<Ticket[]>(() => {
    const query = form.dependencyQuery.trim().toLowerCase();
    const base = availableTickets.filter(
      (candidate) => !form.dependencyIds.includes(candidate.id),
    );
    if (!query) return base;
    return base.filter(
      (candidate) =>
        candidate.key.toLowerCase().includes(query) ||
        candidate.name.toLowerCase().includes(query) ||
        candidate.id.toLowerCase().includes(query),
    );
  }, [availableTickets, form.dependencyIds, form.dependencyQuery]);

   const suggestionOverlay =
    typeof document !== 'undefined' &&
    dependencyFocused &&
    suggestionRect
      ? createPortal(
          <div
            style={{
              position: 'fixed',
              left: suggestionRect.left,
              top: suggestionRect.top,
              width: suggestionRect.width,
              zIndex: 2100,
            }}
            className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {filteredSuggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">No matches</p>
            ) : (
              filteredSuggestions.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleAddDependency(candidate.id);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span className="font-semibold">{candidate.key}</span>
                  <span className="text-xs text-slate-500">
                    {candidate.name} · {candidate.id}
                  </span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  const handleAddDependency = (id: string) => {
    setForm((prev) => ({
      ...prev,
      dependencyIds: prev.dependencyIds.includes(id)
        ? prev.dependencyIds
        : [...prev.dependencyIds, id],
      dependencyQuery: '',
    }));
    requestAnimationFrame(() => dependencyInputRef.current?.focus());
  };

  const handleRemoveDependency = (id: string) => {
    setForm((prev) => ({
      ...prev,
      dependencyIds: prev.dependencyIds.filter((dep) => dep !== id),
    }));
  };

  const handleSuggestionKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filteredSuggestions.length > 0) {
      event.preventDefault();
      handleAddDependency(filteredSuggestions[0]!.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[201] flex items-center justify-center bg-slate-900/50 px-4 py-10"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit {ticket.key}</h2>
            <p className="text-xs text-slate-500">ID: {ticket.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent p-2 text-slate-600 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Title
              <input
                value={form.name}
                onChange={(event) => handleFieldChange('name', event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Story points
              <input
                value={form.storyPoints}
                onChange={(event) => handleFieldChange('storyPoints', event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
                inputMode="numeric"
              />
            </label>
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              <span>Sprint trail</span>
              <div className="flex flex-wrap gap-2">
                {sprintOptions.map((optionId) => {
                  const isActive = form.sprintTrail.includes(optionId);
                  const isCurrent =
                    form.sprintTrail[form.sprintTrail.length - 1] === optionId;
                  return (
                    <button
                      key={optionId}
                      type="button"
                      onClick={() => toggleSprint(optionId)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        isActive
                          ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-700'
                      }`}
                      aria-pressed={isActive}
                      title={
                        isActive
                          ? sprintLabel(optionId)
                          : `Add ${sprintLabel(optionId)}`
                      }
                    >
                      <span>{sprintLabel(optionId)}</span>
                      {isCurrent ? (
                        <span className="rounded bg-sky-100 px-1 text-[10px] uppercase text-sky-600">
                          Current
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                Select every sprint this ticket touches. The last highlighted sprint is treated as the current delivery sprint.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Developer
              <select
                value={form.developerId}
                onChange={(event) => handleFieldChange('developerId', event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                {developers.map((developer) => (
                  <option key={developer.id} value={developer.id}>
                    {developer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Feature
              <select
                value={form.featureId}
                onChange={(event) => handleFieldChange('featureId', event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                {features.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-2 text-sm text-slate-700">
            <span>Dependencies</span>
            <div className="flex flex-wrap gap-2">
              {form.dependencyIds.length === 0 ? (
                <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500">
                  No dependencies
                </span>
              ) : (
                form.dependencyIds.map((id) => {
                  const depTicket = ticketMap.get(id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                    >
                      <span className="font-semibold">{depTicket?.key ?? id}</span>
                      <span className="text-[10px] text-slate-500">{id}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDependency(id)}
                        className="rounded-full bg-white px-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })
              )}
            </div>
            <div className="relative">
              <input
                value={form.dependencyQuery}
                onChange={(event) => setForm((prev) => ({ ...prev, dependencyQuery: event.target.value }))}
                onKeyDown={handleSuggestionKeyDown}
                ref={dependencyInputRef}
                onFocus={() => {
                  setDependencyFocused(true);
                  updateSuggestionRect();
                }}
                onBlur={() => {
                  setTimeout(() => setDependencyFocused(false), 120);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Search tickets by key or name"
              />
            </div>
          </div>
        </div>
        {suggestionOverlay}
        <footer className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}
