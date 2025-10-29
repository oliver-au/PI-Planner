import { useDroppable, useDndContext } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { currentSprintId } from '../lib/calc';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import { BACKLOG_COLUMN_ID, UNASSIGNED_DEVELOPER_ID } from '../constants';
import type { Developer, Ticket } from '../types';
import { TicketCard } from './TicketCard';
import { FeatureRenameModal } from './FeatureRenameModal';

type FeatureBoardProps = {
  featureId: string;
  collapsed?: boolean;
  onToggle?: (featureId: string) => void;
};

const COLUMN_MIN_WIDTH = 220;
const COLUMN_GAP = 16;

export function FeatureBoard({ featureId, collapsed = false, onToggle }: FeatureBoardProps) {
  const { features, developers, sprints, tickets, currentSprintId } = usePiStore(
    useShallow((state) => ({
      features: state.features,
      developers: state.developers,
      sprints: state.sprints,
      tickets: state.tickets,
      currentSprintId: state.currentSprintId,
    })),
  );

  const feature = useMemo(
    () => features.find((item) => item.id === featureId),
    [features, featureId],
  );
  const [renameOpen, setRenameOpen] = useState(false);

  const orderedSprints = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order),
    [sprints],
  );

  const featureTickets = useMemo(
    () => tickets.filter((ticket) => ticket.featureId === featureId),
    [tickets, featureId],
  );

  const { active } = useDndContext();
  const activeTicketId =
    active && typeof active.id === 'string' ? (active.id as string) : null;

  const visibleTickets = useMemo(() => {
    if (!activeTicketId) return featureTickets;
    const includesActive = featureTickets.some(
      (ticket) => ticket.id === activeTicketId,
    );
    if (!includesActive) return featureTickets;
    return featureTickets.filter((ticket) => ticket.id !== activeTicketId);
  }, [activeTicketId, featureTickets]);

  const columns = useMemo(
    () => [...orderedSprints.map((sprint) => sprint.id), BACKLOG_COLUMN_ID],
    [orderedSprints],
  );

  const gridDevelopers = useMemo(() => {
    const unassigned = developers.find(
      (dev) => dev.id === UNASSIGNED_DEVELOPER_ID,
    );
    const others = developers.filter(
      (dev) => dev.id !== UNASSIGNED_DEVELOPER_ID,
    );
    return [unassigned, ...others].filter(Boolean) as Developer[];
  }, [developers]);

  const ticketsByDeveloper = useMemo(() => {
    return gridDevelopers.reduce<Record<string, Ticket[]>>((acc, developer) => {
      acc[developer.id] = visibleTickets.filter(
        (ticket) => ticket.developerId === developer.id,
      );
      return acc;
    }, {});
  }, [gridDevelopers, visibleTickets]);

  const gridTemplateColumns = useMemo(
    () =>
      `repeat(${columns.length}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`,
    [columns.length],
  );

  if (!feature) return null;

  const canToggle = Boolean(onToggle);

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <button
          type="button"
          onClick={() => onToggle?.(featureId)}
          className="flex flex-1 items-start gap-3 text-left disabled:cursor-default"
          aria-expanded={canToggle ? !collapsed : undefined}
          disabled={!canToggle}
        >
          <span className="mt-0.5 text-sm text-slate-400">
            {collapsed ? '▶' : '▼'}
            <span className="sr-only">
              {collapsed ? 'Expand feature' : 'Collapse feature'}
            </span>
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{feature.name}</h3>
            <p className="text-sm text-slate-500">
              Drag tickets between sprints to rebalance this feature plan
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setRenameOpen(true);
            }}
            className="rounded-md border border-transparent p-1 text-xs font-medium text-slate-600 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            ✎
            <span className="sr-only">Rename feature</span>
          </button>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {featureTickets.length} ticket{featureTickets.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>
      {!collapsed ? (
        <div className="overflow-x-auto">
          <div className="min-w-max">
          <div className="grid grid-cols-[12rem,1fr] border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <div className="px-5 py-3 font-semibold">Developer</div>
            <div className="px-5 py-3">
              <div
                className="grid items-center"
                style={{
                  gridTemplateColumns: gridTemplateColumns,
                  gap: COLUMN_GAP,
                }}
              >
                {columns.map((columnId) => {
                  const sprint =
                    columnId === BACKLOG_COLUMN_ID
                      ? null
                      : orderedSprints.find((s) => s.id === columnId);
                  const baseLabel =
                    columnId === BACKLOG_COLUMN_ID
                      ? 'Backlog'
                      : sprint?.name ?? columnId;
                  const label =
                    currentSprintId && columnId === currentSprintId
                      ? `${baseLabel} (Current)`
                      : baseLabel;
                  return (
                    <span
                      key={`head-${columnId}`}
                      className="text-xs font-semibold text-slate-600"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          {gridDevelopers.map((developer, rowIndex) => {
            const layout = layoutTickets(
              ticketsByDeveloper[developer.id] ?? [],
              columns,
            );
            const effectiveRowCount = Math.max(1, layout.rowCount);
            return (
              <div
                key={developer.id}
                className={`grid grid-cols-[12rem,1fr] border-t border-slate-100 ${
                  rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                }`}
              >
                <div className="border-r border-slate-100 px-5 py-4 text-sm font-semibold text-slate-700">
                  {developer.name}
                </div>
                <div className="px-5 py-3">
                  <div className="relative">
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: gridTemplateColumns,
                        gap: COLUMN_GAP,
                        gridTemplateRows: `repeat(${effectiveRowCount}, minmax(120px, auto))`,
                      }}
                    >
                      {columns.map((columnId, columnIndex) => (
                        <FeatureCell
                          key={`${developer.id}-${columnId}`}
                          featureId={featureId}
                          developerId={developer.id}
                          columnId={columnId}
                          columnIndex={columnIndex}
                          rowSpan={effectiveRowCount}
                        />
                      ))}
                      {layout.items.map(({ ticket, placement, rowIndex: ticketRow }) => (
                        <div
                          key={ticket.id}
                          style={{
                            gridColumn: `${placement.start + 1} / span ${placement.span}`,
                            gridRow: `${ticketRow + 1} / span 1`,
                            alignSelf: 'stretch',
                            position: 'relative',
                            zIndex: 10,
                          }}
                          className="flex items-stretch"
                        >
                          <TicketCard
                            ticket={ticket}
                            sprintId={placement.currentSprintId}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      ) : null}
      </section>
      {feature ? (
        <FeatureRenameModal
          featureId={feature.id}
          initialName={feature.name}
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
        />
      ) : null}
    </>
  );
}

type FeatureCellProps = {
  featureId: string;
  developerId: string;
  columnId: string;
  columnIndex: number;
  rowSpan: number;
};

function FeatureCell({ featureId, developerId, columnId, columnIndex, rowSpan }: FeatureCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${featureId}:${developerId}:${columnId}`,
    data: { featureId, developerId, sprintId: columnId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `${columnIndex + 1} / span 1`,
        gridRow: `1 / span ${rowSpan}`,
      }}
      className={`min-h-[120px] w-full rounded-lg bg-slate-100/40 transition-all duration-150 ${
        isOver ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-100' : ''
      }`}
    />
  );
}

type TicketPlacement = {
  start: number;
  span: number;
  currentSprintId: string;
};

type PositionedTicket = {
  ticket: Ticket;
  placement: TicketPlacement;
  rowIndex: number;
};

const calculateTicketPlacement = (
  ticket: Ticket,
  columns: string[],
): TicketPlacement | null => {
  if (columns.length === 0) return null;
  const trail = ticket.sprintIds.filter(
    (id, index, arr) => arr.indexOf(id) === index,
  );
  const filteredTrail = trail.filter((id) => columns.includes(id));
  const startId = filteredTrail[0] ?? BACKLOG_COLUMN_ID;
  const startIndex = columns.indexOf(startId);
  const validStartIndex = startIndex >= 0 ? startIndex : 0;
  const span = Math.max(
    1,
    Math.min(filteredTrail.length || 1, columns.length - validStartIndex),
  );
  const activeSprintId = currentSprintId(ticket);
  return {
    start: validStartIndex,
    span,
    currentSprintId:
      activeSprintId && columns.includes(activeSprintId)
        ? activeSprintId
        : startId,
  };
};

type LayoutResult = {
  items: PositionedTicket[];
  rowCount: number;
};

const layoutTickets = (tickets: Ticket[], columns: string[]): LayoutResult => {
  const placements = tickets
    .map((ticket) => ({ ticket, placement: calculateTicketPlacement(ticket, columns) }))
    .filter((entry): entry is { ticket: Ticket; placement: TicketPlacement } => entry.placement !== null)
    .sort((a, b) => {
      const startDiff = a.placement.start - b.placement.start;
      if (startDiff !== 0) return startDiff;
      const spanDiff = b.placement.span - a.placement.span;
      if (spanDiff !== 0) return spanDiff;
      return (a.ticket.createdAt ?? 0) - (b.ticket.createdAt ?? 0);
    });

  const rows: boolean[][] = [];
  const items: PositionedTicket[] = placements.map(({ ticket, placement }) => {
    let rowIndex = rows.findIndex((row) => isRangeFree(row, placement.start, placement.span));
    if (rowIndex === -1) {
      rowIndex = rows.length;
      rows.push(new Array(columns.length).fill(false));
    }
    occupyRange(rows[rowIndex]!, placement.start, placement.span);
    return { ticket, placement, rowIndex };
  });

  return { items, rowCount: rows.length };
};

const isRangeFree = (row: boolean[], start: number, span: number): boolean => {
  for (let i = start; i < start + span; i += 1) {
    if (row[i]) return false;
  }
  return true;
};

const occupyRange = (row: boolean[], start: number, span: number): void => {
  for (let i = start; i < start + span; i += 1) {
    row[i] = true;
  }
};
