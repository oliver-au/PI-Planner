import type { ReactNode, RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import { currentSprintId } from '../lib/calc';
import {
  rectEquals,
  snapshotRect,
  type RectSnapshot,
} from '../lib/geometry';

type TicketRefContextValue = {
  positions: Record<string, RectSnapshot>;
  setTicketPosition: (id: string, rect: RectSnapshot) => void;
  removeTicketPosition: (id: string) => void;
};

const TicketRefContext = createContext<TicketRefContextValue | undefined>(
  undefined,
);

export const useTicketRefs = (): TicketRefContextValue => {
  const ctx = useContext(TicketRefContext);
  if (!ctx) throw new Error('useTicketRefs must be used within TicketRefProvider');
  return ctx;
};

type TicketRefProviderProps = {
  children: ReactNode;
};

export function TicketRefProvider({ children }: TicketRefProviderProps) {
  const [positions, setPositions] = useState<Record<string, RectSnapshot>>({});

  const setTicketPosition = useCallback((id: string, rect: RectSnapshot) => {
    setPositions((prev) => {
      const current = prev[id];
      if (current && rectEquals(current, rect)) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const removeTicketPosition = useCallback((id: string) => {
    setPositions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return (
    <TicketRefContext.Provider
      value={{ positions, setTicketPosition, removeTicketPosition }}
    >
      {children}
    </TicketRefContext.Provider>
  );
}

type DependencyOverlayProps = {
  containerRef: RefObject<HTMLElement | null>;
};

export function DependencyOverlay({ containerRef }: DependencyOverlayProps) {
  const { positions } = useTicketRefs();
  const { tickets, show, sprints } = usePiStore(
    useShallow((state) => ({
      tickets: state.tickets,
      show: state.showDependencies,
      sprints: state.sprints,
    })),
  );
  const orderedSprints = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order),
    [sprints],
  );
  const orderedSprintIds = useMemo(
    () => orderedSprints.map((s) => s.id),
    [orderedSprints],
  );

  const [containerRect, setContainerRect] = useState<RectSnapshot | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateContainer = () => {
      const next = snapshotRect(node.getBoundingClientRect());
      setContainerRect((prev) => (prev && rectEquals(prev, next) ? prev : next));
    };

    updateContainer();

    const observer = new ResizeObserver(() => {
      updateContainer();
    });
    observer.observe(node);
    const handleScroll = () => {
      updateContainer();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [containerRef]);

  const paths = useMemo(() => {
    if (!containerRect || !show) return [];

    const entries = tickets.flatMap((ticket) =>
      ticket.dependencies.map((depId) => ({
        from: depId,
        to: ticket.id,
      })),
    );

    return entries
      .map(({ from, to }) => {
        const startRect = positions[from];
        const endRect = positions[to];
        if (!startRect || !endRect) return null;

        const fromTicket = tickets.find((ticket) => ticket.id === from);
        const toTicket = tickets.find((ticket) => ticket.id === to);
        if (!fromTicket || !toTicket) return null;

        const startSprintIdx = orderedSprintIds.indexOf(
          currentSprintId(fromTicket),
        );
        const endSprintIdx = orderedSprintIds.indexOf(
          currentSprintId(toTicket),
        );
        if (startSprintIdx === -1 || endSprintIdx === -1) return null;

        const startX =
          startRect.right -
          containerRect.left +
          (endSprintIdx < startSprintIdx ? -12 : 0);
        const startY =
          startRect.top - containerRect.top + startRect.height / 2;
        const endX = endRect.left - containerRect.left - 8;
        const endY = endRect.top - containerRect.top + endRect.height / 2;
        return { from, to, startX, startY, endX, endY };
      })
      .filter(
        (segment): segment is {
          from: string;
          to: string;
          startX: number;
          startY: number;
          endX: number;
          endY: number;
        } => segment !== null,
      );
  }, [containerRect, positions, show, tickets, orderedSprintIds]);

  if (!containerRect || !show || paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${containerRect.width} ${containerRect.height}`}
      role="presentation"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
        </marker>
      </defs>
      {paths.map((path) => {
        const horizontalOffset = Math.max(48, Math.abs(path.endX - path.startX) / 3);
        const control1X = path.startX + (path.endX >= path.startX ? horizontalOffset : -horizontalOffset);
        const control2X = path.endX - (path.endX >= path.startX ? horizontalOffset : -horizontalOffset);
        const d = `M ${path.startX} ${path.startY} C ${control1X} ${path.startY}, ${control2X} ${path.endY}, ${path.endX} ${path.endY}`;
        return (
          <path
            key={`${path.from}-${path.to}`}
            d={d}
            stroke="#0ea5e9"
            strokeWidth="1.6"
            fill="none"
            markerEnd="url(#arrow)"
            opacity="0.8"
          />
        );
      })}
    </svg>
  );
}
