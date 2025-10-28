import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent } from 'react';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { Ticket } from '../types';
import { usePiStore } from '../store/piStore';
import { useTicketEditModal } from './TicketEditModal';
import { useTicketRefs } from './DependencyOverlay';
import { useShallow } from 'zustand/react/shallow';
import {
  rectEquals,
  snapshotRect,
  type RectSnapshot,
} from '../lib/geometry';

type TicketCardProps = {
  ticket: Ticket;
  sprintId: string;
  stackIndex?: number;
};

export function TicketCard({
  ticket,
  sprintId,

  stackIndex = 0,
}: TicketCardProps) {
  const {
    deleteTicket,
    tickets,
    announce,
    beginKeyboardMove,
    moveKeyboardTarget,
    commitKeyboardMove,
    cancelKeyboardMove,
    keyboardMove,
    developers,
    sprints,
    ticketBaseUrl,
  } = usePiStore(
    useShallow((state) => ({
      deleteTicket: state.deleteTicket,
      tickets: state.tickets,
      announce: state.announce,
      beginKeyboardMove: state.beginKeyboardMove,
      moveKeyboardTarget: state.moveKeyboardTarget,
      commitKeyboardMove: state.commitKeyboardMove,
      cancelKeyboardMove: state.cancelKeyboardMove,
      keyboardMove: state.keyboardMove,
      developers: state.developers,
      sprints: state.sprints,
      ticketBaseUrl: state.ticketBaseUrl,
    })),
  );
  const { openEdit } = useTicketEditModal();

  const { setTicketPosition, removeTicketPosition } = useTicketRefs();

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: ticket.id,
      data: { ticketId: ticket.id },
    });

  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastRectRef = useRef<RectSnapshot | null>(null);

  const style = useMemo(() => {
    const translate = transform
      ? CSS.Translate.toString(transform)
      : undefined;
    return {
      transform: translate,
      marginTop: stackIndex * 6,
    };
  }, [transform, stackIndex]);

  const resolvedTicketUrl = useMemo(() => {
    const explicit = ticket.jiraUrl?.trim();
    const normalize = (raw: string) =>
      /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    if (explicit) {
      return normalize(explicit);
    }

    const base = ticketBaseUrl?.trim();
    if (!base) return null;

    let full = base;
    if (base.includes('{key}')) {
      full = base.replaceAll('{key}', ticket.key);
    } else {
      const separatorNeeded =
        base.endsWith('/') ||
        base.endsWith('-') ||
        base.endsWith('_') ||
        base.endsWith('=');
      full = `${base}${separatorNeeded ? '' : '/'}${ticket.key}`;
    }

    return normalize(full);
  }, [ticket.jiraUrl, ticket.key, ticketBaseUrl]);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const node = cardRef.current;
      if (!node) return;
      const snapshot = snapshotRect(node.getBoundingClientRect());
      const previous = lastRectRef.current;
      if (previous && rectEquals(previous, snapshot)) {
        return;
      }
      lastRectRef.current = snapshot;
      setTicketPosition(ticket.id, snapshot);
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(() => updatePosition());
    const node = cardRef.current;
    if (node) {
      resizeObserver.observe(node);
    }

    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
      removeTicketPosition(ticket.id);
      lastRectRef.current = null;
    };
  }, [removeTicketPosition, setTicketPosition, ticket.id]);

  const dependentTickets = useMemo(
    () =>
      tickets.filter((t) => t.dependencies.includes(ticket.id)),
    [tickets, ticket.id],
  );

  const isKeyboardMoving = keyboardMove?.ticketId === ticket.id;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key.toLowerCase() === 'm') {
      beginKeyboardMove(ticket.id);
      announce(
        `Move mode for ${ticket.key}. Use arrow keys to choose a new cell, enter to drop.`,
      );
      event.preventDefault();
      return;
    }

    if (!keyboardMove || keyboardMove.ticketId !== ticket.id) return;

    switch (event.key) {
      case 'ArrowUp':
        moveKeyboardTarget('row', -1);
        event.preventDefault();
        break;
      case 'ArrowDown':
        moveKeyboardTarget('row', 1);
        event.preventDefault();
        break;
      case 'ArrowLeft':
        moveKeyboardTarget('column', -1);
        event.preventDefault();
        break;
      case 'ArrowRight':
        moveKeyboardTarget('column', 1);
        event.preventDefault();
        break;
      case 'Enter':
        commitKeyboardMove(event.altKey ? 'extend' : 'move');
        event.preventDefault();
        break;
      case 'Escape':
        cancelKeyboardMove();
        announce(`Cancelled move for ${ticket.key}.`);
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  const handleDelete = () => {
    if (dependentTickets.length > 0) {
      const blockerKeys = dependentTickets.map((t) => t.key).join(', ');
      const confirmDelete = window.confirm(
        `${ticket.key} is required by ${blockerKeys}. Delete anyway?`,
      );
      if (!confirmDelete) return;
    } else {
      const confirmDelete = window.confirm(
        `Delete ${ticket.key}? This cannot be undone.`,
      );
      if (!confirmDelete) return;
    }
    deleteTicket(ticket.id);
    announce(`${ticket.key} removed.`);
  };

  const activatorRef = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const { onKeyDown: dndOnKeyDown, ...restListeners } = listeners as typeof listeners & {
    onKeyDown?: (event: KeyboardEvent<HTMLDivElement> | KeyboardEvent<Element>) => void;
  };

  return (
    <div
      ref={activatorRef}
      style={style}
      className={`relative flex min-h-[8rem] w-[260px] max-w-full cursor-grab flex-col gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow transition focus-visible:ring-2 focus-visible:ring-sky-500 min-w-0 ${
        isDragging ? 'z-50 opacity-90' : 'hover:border-slate-300'
      } ${isKeyboardMoving ? 'ring-2 ring-sky-400' : ''}`}
      {...attributes}
      {...restListeners}
      onKeyDown={(event) => {
        dndOnKeyDown?.(event);
        handleKeyDown(event);
      }}
      tabIndex={0}
      role="group"
      aria-roledescription="Ticket"
      aria-label={`${ticket.key} in ${sprintId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            {ticket.key}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            <span className="font-semibold">{ticket.storyPoints}</span>
            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500">
              SP
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {resolvedTicketUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                window.open(resolvedTicketUrl, '_blank', 'noopener,noreferrer');
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              className="rounded-md border border-transparent p-1 text-xs font-medium text-slate-600 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              🔗
              <span className="sr-only">Open Jira issue</span>
            </button>
          ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                openEdit(ticket.id);
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              className="rounded-md border border-transparent p-1 text-xs font-medium text-sky-600 hover:border-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              ✎
              <span className="sr-only">Edit ticket</span>
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-transparent p-1 text-xs font-medium text-red-600 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
            ✕
            <span className="sr-only">Delete ticket</span>
          </button>
        </div>
      </div>
      <p
        className="flex-1 overflow-hidden text-sm text-slate-700 break-words"
        title={ticket.name}
      >
        {ticket.name}
      </p>
      <p className="text-xs text-slate-400">
        ID: {ticket.id}
      </p>

      {ticket.dependencies.length > 0 ? (
        <p className="text-xs text-slate-500">
          Depends on{' '}
          {ticket.dependencies
            .map(
              (depId) =>
                tickets.find((t) => t.id === depId)?.key ?? depId,
            )
            .join(', ')}
        </p>
      ) : null}

      {isKeyboardMoving && keyboardMove ? (
        <p className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700">
          Target:{' '}
          {developers.find((dev) => dev.id === keyboardMove.targetDeveloperId)
            ?.name ?? keyboardMove.targetDeveloperId}{' '}
          →{' '}
          {sprints.find((sp) => sp.id === keyboardMove.targetSprintId)?.name ??
            keyboardMove.targetSprintId}
        </p>
      ) : null}
    </div>
  );
}
