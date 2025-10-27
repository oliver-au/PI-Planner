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

        const startCenterX =
          startRect.left - containerRect.left + startRect.width / 2;
        const startCenterY =
          startRect.top - containerRect.top + startRect.height / 2;
        const endCenterX =
          endRect.left - containerRect.left + endRect.width / 2;
        const endCenterY =
          endRect.top - containerRect.top + endRect.height / 2;

        const alignedVertically =
          Math.abs(startCenterY - endCenterY) < 16;

        if (alignedVertically) {
          const direction =
            endCenterX >= startCenterX ? 1 : -1;
          const horizontalOffset = 18;
          const startEdgeX =
            direction > 0
              ? startRect.right - containerRect.left
              : startRect.left - containerRect.left;
          const endEdgeX =
            direction > 0
              ? endRect.left - containerRect.left
              : endRect.right - containerRect.left;
          const startExitX = startEdgeX + direction * horizontalOffset;
          const endEntryX = endEdgeX - direction * horizontalOffset;
          const midY =
            (startCenterY + endCenterY) / 2;
          return {
            from,
            to,
            segments: [
              { x: startEdgeX, y: startCenterY },
              { x: startExitX, y: startCenterY },
              { x: startExitX, y: midY },
              { x: endEntryX, y: midY },
              { x: endEntryX, y: endCenterY },
              { x: endEdgeX, y: endCenterY },
            ],
          };
        }

        const verticalDirection =
          endCenterY >= startCenterY ? 1 : -1;
        const verticalOffset = 18;
        const startEdgeY =
          verticalDirection > 0
            ? startRect.bottom - containerRect.top
            : startRect.top - containerRect.top;
        const endEdgeY =
          verticalDirection > 0
            ? endRect.top - containerRect.top
            : endRect.bottom - containerRect.top;

        const startExitY =
          startEdgeY + verticalDirection * verticalOffset;
        const endEntryY =
          endEdgeY - verticalDirection * verticalOffset;

        const midX =
          (startCenterX + endCenterX) / 2;

        return {
          from,
          to,
          segments: [
            { x: startCenterX, y: startEdgeY },
            { x: startCenterX, y: startExitY },
            { x: midX, y: startExitY },
            { x: midX, y: endEntryY },
            { x: endCenterX, y: endEntryY },
            { x: endCenterX, y: endEdgeY },
          ],
        };
      })
      .filter(
        (segment): segment is {
          from: string;
          to: string;
          segments: { x: number; y: number }[];
        } => segment !== null,
      );
  }, [containerRect, positions, show, tickets, orderedSprintIds]);

  if (!containerRect || !show || paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[60] h-full w-full"
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#A5ADBA" />
        </marker>
        <filter id="arrow-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#E5E8EF" floodOpacity="0.9" />
        </filter>
      </defs>
      {paths.map((path) => {
        if (path.segments.length < 2) return null;
        const segments = path.segments
          .map((point, index) =>
            `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
          )
          .join(' ');
        return (
          <path
            key={`${path.from}-${path.to}`}
            d={segments}
            stroke="#A5ADBA"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            markerEnd="url(#arrow)"
            opacity="0.95"
            filter="url(#arrow-glow)"
          />
        );
      })}
    </svg>
  );
}
