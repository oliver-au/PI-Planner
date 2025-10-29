import { useDndContext } from '@dnd-kit/core';
import type { ReactNode, RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const { active } = useDndContext();
  const activeTicketId =
    active && typeof active.id === 'string' ? (active.id as string) : null;
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const setTicketPosition = useCallback((id: string, rect: RectSnapshot) => {
    pendingRemovalRef.current.delete(id);
    setPositions((prev) => {
      const current = prev[id];
      if (current && rectEquals(current, rect)) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const removeTicketPosition = useCallback((id: string) => {
    if (activeTicketId === id) {
      pendingRemovalRef.current.add(id);
      return;
    }
    setPositions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [activeTicketId]);

  useEffect(() => {
    if (activeTicketId) return;
    if (pendingRemovalRef.current.size === 0) return;
    const toRemove = new Set(pendingRemovalRef.current);
    if (toRemove.size === 0) return;
    pendingRemovalRef.current.clear();
    setPositions((prev) => {
      let mutated = false;
      const next = { ...prev };
      toRemove.forEach((id) => {
        if (id in next) {
          delete next[id];
          mutated = true;
        }
      });
      return mutated ? next : prev;
    });
  }, [activeTicketId]);

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
  const { active } = useDndContext();
  const activeTicketId =
    active && typeof active.id === 'string' ? (active.id as string) : null;
  const activeClientRect =
    active?.rect.current.translated ?? active?.rect.current.initial ?? null;
  const activeRectSnapshot = useMemo(
    () => (activeClientRect ? snapshotRect(activeClientRect as DOMRect) : null),
    [activeClientRect],
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

    type RelativeRect = {
      id: string;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    };

    type Point = { x: number; y: number };

    const toRelativeRect = (id: string, rect: RectSnapshot): RelativeRect => {
      const left = rect.left - containerRect.left;
      const right = rect.right - containerRect.left;
      const top = rect.top - containerRect.top;
      const bottom = rect.bottom - containerRect.top;
      return {
        id,
        left,
        right,
        top,
        bottom,
        width: rect.width,
        height: rect.height,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
      };
    };

    const rectMap = new Map<string, RelativeRect>();
    const rectList: RelativeRect[] = [];
    Object.entries(positions).forEach(([id, rect]) => {
      if (!rect) return;
      const relative = toRelativeRect(id, rect);
      rectMap.set(id, relative);
      rectList.push(relative);
    });

    if (
      activeTicketId &&
      activeRectSnapshot &&
      !rectMap.has(activeTicketId)
    ) {
      const relative = toRelativeRect(activeTicketId, activeRectSnapshot);
      rectMap.set(activeTicketId, relative);
      rectList.push(relative);
    }

    if (rectList.length === 0) return [];

    const startTotals = new Map<string, number>();
    const endTotals = new Map<string, number>();

    const CLEARANCE = 6;
    const GUTTER_BASE = 28;
    const GUTTER_STEP = 18;
    const GUTTER_ATTEMPTS = 5;
    const LANE_STEP = 32;
    const MIN_Y = 12;
    const MAX_Y = Math.max(MIN_Y + 4, containerRect.height - 12);

    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    const horizontalBlocked = (
      y: number,
      x1: number,
      x2: number,
      ignore: Set<string>,
    ): boolean => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (const rect of rectList) {
        if (ignore.has(rect.id)) continue;
        const verticalHit =
          y >= rect.top - CLEARANCE && y <= rect.bottom + CLEARANCE;
        const horizontalHit =
          maxX >= rect.left - CLEARANCE && minX <= rect.right + CLEARANCE;
        if (verticalHit && horizontalHit) return true;
      }
      return false;
    };

    const verticalBlocked = (
      x: number,
      y1: number,
      y2: number,
      ignore: Set<string>,
    ): boolean => {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (const rect of rectList) {
        if (ignore.has(rect.id)) continue;
        const horizontalHit =
          x >= rect.left - CLEARANCE && x <= rect.right + CLEARANCE;
        const verticalHit =
          maxY >= rect.top - CLEARANCE && minY <= rect.bottom + CLEARANCE;
        if (horizontalHit && verticalHit) return true;
      }
      return false;
    };

    const dedupePoints = (pts: Point[]): Point[] => {
      const reduced: Point[] = [];
      pts.forEach((pt) => {
        const last = reduced[reduced.length - 1];
        if (!last || last.x !== pt.x || last.y !== pt.y) {
          reduced.push({ x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 });
        }
      });
      return reduced;
    };

    const findLaneY = (
      basePrefersDown: boolean,
      startRect: RelativeRect,
      endRect: RelativeRect,
      exitX: number,
      entryX: number,
      lanePreference: number,
      startAnchorY: number,
      endAnchorY: number,
    ): number | null => {
      const preferDown = basePrefersDown;
      const downStart = clamp(
        Math.max(startRect.bottom, endRect.bottom) + 20,
        MIN_Y,
        MAX_Y,
      );
      const upStart = clamp(
        Math.min(startRect.top, endRect.top) - 20,
        MIN_Y,
        MAX_Y,
      );

      const tested = new Set<number>();
      const orderedBases = preferDown
        ? [downStart, upStart]
        : [upStart, downStart];

      const defaultOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
      const offsets: number[] = [];
      if (lanePreference !== 0) {
        const magnitude = Math.max(1, Math.round(Math.abs(lanePreference)));
        const preferred = magnitude * Math.sign(lanePreference);
        if (!Number.isNaN(preferred)) offsets.push(preferred);
      }
      defaultOffsets.forEach((offset) => {
        if (!offsets.includes(offset)) offsets.push(offset);
      });

      for (const base of orderedBases) {
        if (Number.isNaN(base)) continue;
        for (const offset of offsets) {
          const candidateRaw = base + offset * LANE_STEP;
          const candidate = clamp(candidateRaw, MIN_Y, MAX_Y);
          if (tested.has(candidate)) continue;
          tested.add(candidate);
          if (
            (candidate > startRect.top - CLEARANCE &&
              candidate < startRect.bottom + CLEARANCE) ||
            (candidate > endRect.top - CLEARANCE &&
              candidate < endRect.bottom + CLEARANCE)
          ) {
            continue;
          }
          if (
            horizontalBlocked(candidate, exitX, entryX, new Set([
              startRect.id,
              endRect.id,
            ]))
          ) {
            continue;
          }
          if (
            verticalBlocked(exitX, startAnchorY, candidate, new Set([
              startRect.id,
            ]))
          ) {
            continue;
          }
          if (
            verticalBlocked(entryX, endAnchorY, candidate, new Set([endRect.id]))
          ) {
            continue;
          }
          return candidate;
        }
      }

      return null;
    };

    const buildCrossColumnPath = (
      startRect: RelativeRect,
      endRect: RelativeRect,
      startAnchorY: number,
      endAnchorY: number,
      horizontalDir: 1 | -1,
      laneOffsetIndex: number,
    ): Point[] | null => {
      const preferDown =
        laneOffsetIndex === 0
          ? endRect.centerY >= startRect.centerY
          : laneOffsetIndex > 0;
      const startEdgeX =
        horizontalDir > 0 ? startRect.right : startRect.left;
      const endEdgeX =
        horizontalDir > 0 ? endRect.left : endRect.right;

      for (let attempt = 0; attempt < GUTTER_ATTEMPTS; attempt += 1) {
        const gutter =
          GUTTER_BASE + Math.abs(laneOffsetIndex) * GUTTER_STEP + attempt * 6;
        const exitX = startEdgeX + horizontalDir * gutter;
        const entryX = endEdgeX - horizontalDir * gutter;
        if (
          verticalBlocked(
            exitX,
            startAnchorY,
            startAnchorY,
            new Set([startRect.id]),
          )
        ) {
          continue;
        }
        const laneY = findLaneY(
          preferDown,
          startRect,
          endRect,
          exitX,
          entryX,
          laneOffsetIndex,
          startAnchorY,
          endAnchorY,
        );
        if (laneY == null) {
          continue;
        }

        const points: Point[] = [
          { x: startEdgeX, y: startAnchorY },
          { x: exitX, y: startAnchorY },
          { x: exitX, y: laneY },
          { x: entryX, y: laneY },
          { x: entryX, y: endAnchorY },
          { x: endEdgeX, y: endAnchorY },
        ];
        return dedupePoints(points);
      }

      return null;
    };

    const buildSameColumnPath = (
      startRect: RelativeRect,
      endRect: RelativeRect,
      startAnchorY: number,
      endAnchorY: number,
      laneIndex: number,
    ): Point[] | null => {
      const directions: Array<1 | -1> = [];
      const rightSpace =
        containerRect.width - Math.max(startRect.right, endRect.right);
      const leftSpace = Math.min(startRect.left, endRect.left);
      if (rightSpace >= leftSpace) {
        directions.push(1, -1);
      } else {
        directions.push(-1, 1);
      }

      const SAME_COLUMN_BASE = 28;
      const SAME_COLUMN_STEP = 22;

      const clampX = (value: number) =>
        clamp(value, 4, containerRect.width - 4);

      for (const dir of directions) {
        const startEdgeX = dir > 0 ? startRect.right : startRect.left;
        const endEdgeX = dir > 0 ? endRect.right : endRect.left;
        const laneXRaw =
          startEdgeX + dir * (SAME_COLUMN_BASE + laneIndex * SAME_COLUMN_STEP);
        const laneX = clampX(laneXRaw);

        if (
          verticalBlocked(
            laneX,
            Math.min(startAnchorY, endAnchorY),
            Math.max(startAnchorY, endAnchorY),
            new Set([startRect.id, endRect.id]),
          )
        ) {
          continue;
        }

        const points: Point[] = [
          { x: startEdgeX, y: startAnchorY },
          { x: laneX, y: startAnchorY },
          { x: laneX, y: endAnchorY },
          { x: endEdgeX, y: endAnchorY },
        ];
        return dedupePoints(points);
      }

      return null;
    };

    const buildPath = (
      startRect: RelativeRect,
      endRect: RelativeRect,
      startAnchorY: number,
      endAnchorY: number,
      sameColumn: boolean,
      horizontalDir: 1 | -1,
      laneOffsetIndex: number,
      laneIndexSameColumn: number,
    ): Point[] | null => {
      if (sameColumn) {
        return buildSameColumnPath(
          startRect,
          endRect,
          startAnchorY,
          endAnchorY,
          laneIndexSameColumn,
        );
      }
      return buildCrossColumnPath(
        startRect,
        endRect,
        startAnchorY,
        endAnchorY,
        horizontalDir,
        laneOffsetIndex,
      );
    };

    type Segment = {
      from: string;
      to: string;
      startRect: RelativeRect;
      endRect: RelativeRect;
      startSprintIdx: number;
      endSprintIdx: number;
      sameColumn: boolean;
      horizontalDir: 1 | -1;
      groupKey: string;
      orderKey: number;
      startSideKey: string;
      endSideKey: string;
      startSlot?: number;
      endSlot?: number;
    };

    const segments: Segment[] = [];

    tickets.forEach((ticket) => {
      ticket.dependencies.forEach((depId) => {
        if (
          activeTicketId &&
          activeTicketId !== depId &&
          activeTicketId !== ticket.id
        ) {
          return;
        }
        const fromTicket = tickets.find((item) => item.id === depId);
        if (!fromTicket) return;

        const startRect = rectMap.get(depId);
        const endRect = rectMap.get(ticket.id);
        if (!startRect || !endRect) return;

        const startSprintIdx = orderedSprintIds.indexOf(
          currentSprintId(fromTicket),
        );
        const endSprintIdx = orderedSprintIds.indexOf(
          currentSprintId(ticket),
        );

        if (startSprintIdx === -1 || endSprintIdx === -1) return;

        const sameColumn = startSprintIdx === endSprintIdx;
        const horizontalDir: 1 | -1 = endRect.centerX >= startRect.centerX ? 1 : -1;
        const startSide = horizontalDir > 0 ? 'right' : 'left';
        const endSide = horizontalDir > 0 ? 'left' : 'right';
        const startSideKey = `${depId}:${startSide}`;
        const endSideKey = `${ticket.id}:${endSide}`;
        startTotals.set(
          startSideKey,
          (startTotals.get(startSideKey) ?? 0) + 1,
        );
        endTotals.set(endSideKey, (endTotals.get(endSideKey) ?? 0) + 1);
        const baseGroup = sameColumn
          ? `col-${startSprintIdx}`
          : `row-${startSprintIdx}-${endSprintIdx}-${horizontalDir > 0 ? 'r' : 'l'}`;
        const orderKey = (startRect.centerY + endRect.centerY) / 2;

        segments.push({
          from: depId,
          to: ticket.id,
          startRect,
          endRect,
          startSprintIdx,
          endSprintIdx,
          sameColumn,
          horizontalDir,
          groupKey: baseGroup,
          orderKey,
          startSideKey,
          endSideKey,
        });
      });
    });

    const assignSlots = (
      key: 'startSideKey' | 'endSideKey',
      slot: 'startSlot' | 'endSlot',
      totalMap: Map<string, number>,
      byStart: boolean,
    ) => {
      const sorted = [...segments].sort((a, b) => {
        const primary = byStart
          ? a.startRect.centerY - b.startRect.centerY
          : a.endRect.centerY - b.endRect.centerY;
        if (primary !== 0) return primary;
        return byStart
          ? a.endRect.centerY - b.endRect.centerY
          : a.startRect.centerY - b.startRect.centerY;
      });
      const assigned = new Map<string, number>();
      sorted.forEach((segment) => {
        const mapKey = segment[key];
        const total = totalMap.get(mapKey) ?? 1;
        if (total <= 1) {
          segment[slot] = 0;
          return;
        }
        const next = assigned.get(mapKey) ?? 0;
        segment[slot] = next;
        assigned.set(mapKey, next + 1);
      });
    };

    assignSlots('startSideKey', 'startSlot', startTotals, true);
    assignSlots('endSideKey', 'endSlot', endTotals, false);

    const computeAnchor = (
      rect: RelativeRect,
      slot: number | undefined,
      total: number,
    ): number => {
      if (slot === undefined || total <= 1) return rect.centerY;
      const clampedSlot = Math.max(0, Math.min(slot, total - 1));
      const step = rect.height / (total + 1);
      return rect.top + step * (clampedSlot + 1);
    };

    const grouped = new Map<string, Segment[]>();
    segments.forEach((segment) => {
      const list = grouped.get(segment.groupKey);
      if (list) {
        list.push(segment);
      } else {
        grouped.set(segment.groupKey, [segment]);
      }
    });

    const results: { from: string; to: string; d: string }[] = [];

    grouped.forEach((list) => {
      list.sort((a, b) => a.orderKey - b.orderKey);
      list.forEach((segment, idx) => {
        const span = (list.length - 1) / 2;
        const relative = idx - span;
        const laneOffsetIndex =
          segment.sameColumn
            ? idx
            : relative === 0
              ? 0
              : relative > 0
                ? Math.ceil(relative)
                : Math.floor(relative);
        const startTotal = startTotals.get(segment.startSideKey) ?? 1;
        const endTotal = endTotals.get(segment.endSideKey) ?? 1;
        const startAnchorY = computeAnchor(
          segment.startRect,
          segment.startSlot,
          startTotal,
        );
        const endAnchorY = computeAnchor(
          segment.endRect,
          segment.endSlot,
          endTotal,
        );
        const points = buildPath(
          segment.startRect,
          segment.endRect,
          startAnchorY,
          endAnchorY,
          segment.sameColumn,
          segment.horizontalDir,
          laneOffsetIndex,
          idx,
        );
        if (!points || points.length < 2) return;
        const d = points
          .map((point, pointIdx) => `${pointIdx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
          .join(' ');
        results.push({ from: segment.from, to: segment.to, d });
      });
    });

    return results;
  }, [
    containerRect,
    positions,
    show,
    tickets,
    orderedSprintIds,
    activeTicketId,
    activeRectSnapshot,
  ]);
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
      {paths.map((path) => (
        <path
          key={`${path.from}-${path.to}`}
          d={path.d}
          stroke="#A5ADBA"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          markerEnd="url(#arrow)"
          opacity="0.95"
          filter="url(#arrow-glow)"
        />
      ))}
    </svg>
  );
}
