import { useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { AddTicketForm } from './components/AddTicketForm';
import { CapacitySummary } from './components/CapacitySummary';
import { DependencyOverlay, TicketRefProvider } from './components/DependencyOverlay';
import { FeatureBoard } from './components/FeatureBoard';
import { usePiStore } from './store/piStore';
import { useShallow } from 'zustand/react/shallow';
import { DeveloperManagerModal } from './components/DeveloperManagerModal';
import { FeatureManagerModal } from './components/FeatureManagerModal';
import { DataManagerModal } from './components/DataManagerModal';
import { TicketEditModalHost } from './components/TicketEditModal';
import { currentSprintId } from './lib/calc';
import type { Ticket } from './types';
import { BACKLOG_COLUMN_ID } from './constants';
import { NoticeStack } from './components/NoticeStack';

type DropData = {
  featureId: string;
  developerId: string;
  sprintId: string;
};

function App() {
  const { features, developers, sprints, tickets, refreshTicketPositions, currentSprintId } = usePiStore(
    useShallow((state) => ({
      features: state.features,
      developers: state.developers,
      sprints: state.sprints,
      tickets: state.tickets,
      refreshTicketPositions: state.refreshTicketPositions,
      currentSprintId: state.currentSprintId,
    })),
  );
  const moveTicketTo = usePiStore((state) => state.moveTicketTo);
  const isMoveBlockedByDeps = usePiStore((state) => state.isMoveBlockedByDeps);
  const announce = usePiStore((state) => state.announce);
  const pushNotice = usePiStore((state) => state.pushNotice);
  const showDependencies = usePiStore((state) => state.showDependencies);
  const toggleDependencies = usePiStore((state) => state.toggleDependencies);
  const cancelKeyboardMove = usePiStore((state) => state.cancelKeyboardMove);
  const liveAnnouncement = usePiStore((state) => state.liveAnnouncement);
  const setCurrentSprint = usePiStore((state) => state.setCurrentSprint);
  const resetPlanner = usePiStore((state) => state.resetPlanner);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastDropRef = useRef<DropData | null>(null);
  const [showDeveloperModal, setShowDeveloperModal] = useState(false);
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const orderedSprintList = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order),
    [sprints],
  );

  const handleDragStart = (event: DragStartEvent) => {
    cancelKeyboardMove();
    setActiveTicketId(String(event.active.id));
    lastDropRef.current = null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const dropData = event.over?.data?.current as DropData | undefined;
    if (dropData) {
      lastDropRef.current = dropData;
    }
  };

  const resetDragState = () => {
    setActiveTicketId(null);
    lastDropRef.current = null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    const directDrop = over?.data?.current as DropData | undefined;
    const dropData = directDrop ?? lastDropRef.current;
    if (!dropData) {
      resetDragState();
      return;
    }

    const ticketId = String(active.id);
    const { sprintId, developerId } = dropData;
    const isExtend = altModifier(event);
    const { blocked, blockers } = isMoveBlockedByDeps(ticketId, sprintId);
    if (blocked) {
      const blockerKeys = blockers
        .map((id) => tickets.find((ticket) => ticket.id === id)?.key ?? id)
        .join(', ');
      announce(`Move blocked by ${blockerKeys}`);
      pushNotice(
        blockers.length
          ? `Move blocked by ${blockerKeys}. Resolve dependency ordering first.`
          : 'Move blocked by dependency ordering.',
        'error',
      );
      resetDragState();
      return;
    }

    const targetMode =
      sprintId === BACKLOG_COLUMN_ID ? 'move' : isExtend ? 'extend' : 'move';
    moveTicketTo(ticketId, sprintId, developerId, targetMode);

    const ticket = tickets.find((t) => t.id === ticketId);
    const developer = developers.find((dev) => dev.id === developerId);
    const sprint = sprints.find((sp) => sp.id === sprintId);
    if (ticket && developer) {
      const sprintName =
        sprintId === BACKLOG_COLUMN_ID
          ? 'Backlog'
          : sprint?.name ?? sprintId;
      announce(
        `${ticket.key} scheduled for ${developer.name} in ${sprintName}` +
          (targetMode === 'extend' ? ' (carryover)' : ''),
      );
    }
    resetDragState();
    requestAnimationFrame(() => {
      refreshTicketPositions();
    });
  };

  return (
    <TicketRefProvider>
      <DndContext
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDragState}
      >
        <div className="min-h-screen bg-slate-100">
          <NoticeStack />
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-[110rem] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">PI Planner</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Plan by sprint and developer. Drag to move, hold Option/Alt to extend into a later sprint.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={toggleDependencies}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  aria-pressed={showDependencies}
                >
                  <span aria-hidden="true">{showDependencies ? '👁️' : '🚫'}</span>
                  {showDependencies ? 'Hide dependencies' : 'Show dependencies'}
                </button>
                <label
                  htmlFor="planner-current-sprint"
                  className="relative inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2"
                >
                  <span className="font-medium text-slate-700">Current sprint</span>
                  <select
                    id="planner-current-sprint"
                    value={currentSprintId ?? ''}
                    onChange={(event) => setCurrentSprint(event.target.value || null)}
                    className="bg-transparent pl-1 pr-6 text-sm leading-tight text-slate-700 focus:outline-none focus:ring-0 focus:border-none [appearance:none] cursor-pointer"
                  >
                    {orderedSprintList.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 text-xs text-slate-400">
                    ▾
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDeveloperModal(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  👥 Manage developers
                </button>
                <button
                  type="button"
                  onClick={() => setShowFeatureModal(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  🧩 Manage features
                </button>
                <button
                  type="button"
                  onClick={() => setShowDataModal(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  📤 Export / Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      'Reset planner data to the default seed? This clears all local changes.',
                    );
                    if (!confirmed) return;
                    resetPlanner();
                    announce('Planner data reset to defaults.');
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  🧹 Reset data
                </button>
                <span className="text-xs text-slate-500">
                  Press M on a ticket to move with keyboard. Enter drops, Alt+Enter extends.
                </span>
              </div>
            </div>
          </header>
          <main
            ref={containerRef}
            className="relative mx-auto flex max-w-[110rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
          >
            <AddTicketForm />
            <CapacitySummary />
            <div className="space-y-6">
              {features.map((feature) => (
                <FeatureBoard key={feature.id} featureId={feature.id} />
              ))}
            </div>
            <DependencyOverlay containerRef={containerRef} />
          </main>
          <div
            aria-live="polite"
            role="status"
            className="sr-only"
          >
            {liveAnnouncement?.message ?? ''}
          </div>
        </div>
        <DragOverlayWrapper
          ticketId={activeTicketId}
          tickets={tickets}
        />
      </DndContext>
      <DeveloperManagerModal
        open={showDeveloperModal}
        onClose={() => setShowDeveloperModal(false)}
      />
      <FeatureManagerModal
        open={showFeatureModal}
        onClose={() => setShowFeatureModal(false)}
      />
      <TicketEditModalHost />
      <DataManagerModal open={showDataModal} onClose={() => setShowDataModal(false)} />
    </TicketRefProvider>
  );
}

export default App;

const altModifier = (event: DragEndEvent): boolean => {
  const activator = event.activatorEvent;
  if (activator && 'altKey' in activator) {
    return Boolean((activator as KeyboardEvent | MouseEvent).altKey);
  }
  return false;
};

type DragOverlayWrapperProps = {
  ticketId: string | null;
  tickets: Ticket[];
};

function DragOverlayWrapper({ ticketId, tickets }: DragOverlayWrapperProps) {
  if (!ticketId) {
    return <DragOverlay />;
  }
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    return <DragOverlay />;
  }
  const activeSprint = currentSprintId(ticket);
  return (
    <DragOverlay>
      <div className="w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            {ticket.key}
          </span>
          <span className="text-xs text-slate-500">
            {activeSprint === BACKLOG_COLUMN_ID ? 'Backlog' : activeSprint}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">{ticket.name}</p>
        <span className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
          {ticket.storyPoints} SP
        </span>
      </div>
    </DragOverlay>
  );
}
