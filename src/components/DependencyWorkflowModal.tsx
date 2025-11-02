import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import type { Ticket } from '../types';
import { currentSprintId } from '../lib/calc';
import { getStatusColors } from '../utils/statusColors';

type DependencyWorkflowModalProps = {
  featureId: string;
  open: boolean;
  onClose: () => void;
};

type TicketNode = {
  ticket: Ticket;
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Connection = {
  from: string;
  to: string;
  fromNode: TicketNode;
  toNode: TicketNode;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 120;
const HORIZONTAL_SPACING = 100;
const VERTICAL_SPACING = 40;
const PADDING = 40;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

export function DependencyWorkflowModal({ featureId, open, onClose }: DependencyWorkflowModalProps) {
  const { tickets, features, sprints, developers } = usePiStore(
    useShallow((state) => ({
      tickets: state.tickets,
      features: state.features,
      sprints: state.sprints,
      developers: state.developers,
    })),
  );

  const feature = features.find((f) => f.id === featureId);
  const featureTickets = useMemo(
    () => tickets.filter((t) => t.featureId === featureId),
    [tickets, featureId]
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef({
    isPanning: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const previousZoomRef = useRef(zoom);

  // Calculate the hierarchical layout
  const { nodes, connections, totalWidth, totalHeight } = useMemo(() => {
    if (featureTickets.length === 0) {
      return { nodes: [], connections: [], totalWidth: 0, totalHeight: 0 };
    }

    // Build dependency graph
    const ticketMap = new Map<string, Ticket>();
    featureTickets.forEach((ticket) => ticketMap.set(ticket.id, ticket));

    // Find tickets with no dependencies (starting nodes)
    const startNodes = featureTickets.filter(
      (ticket) => ticket.dependencies.length === 0 || 
      ticket.dependencies.every(depId => !ticketMap.has(depId))
    );

    if (startNodes.length === 0 && featureTickets.length > 0) {
      // If all tickets have dependencies, just use all tickets
      startNodes.push(...featureTickets);
    }

    // Calculate levels using BFS with proper level tracking
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [];

    startNodes.forEach((ticket) => {
      queue.push({ id: ticket.id, level: 0 });
      levels.set(ticket.id, 0);
    });

    // BFS to assign levels - each node should be at max(dependency levels) + 1
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      visited.add(current.id);

      // Find all tickets that depend on the current ticket
      featureTickets.forEach((ticket) => {
        if (ticket.dependencies.includes(current.id)) {
          // Calculate the proper level: max of all dependency levels + 1
          const depLevels = ticket.dependencies
            .map(depId => levels.get(depId) ?? 0)
            .filter(level => level !== undefined);
          const newLevel = depLevels.length > 0 ? Math.max(...depLevels) + 1 : 0;
          
          const existingLevel = levels.get(ticket.id);
          if (existingLevel === undefined || newLevel > existingLevel) {
            levels.set(ticket.id, newLevel);
            // Re-queue to propagate the level change
            queue.push({ id: ticket.id, level: newLevel });
          }
        }
      });
    }

    // Ensure all tickets have a level
    featureTickets.forEach((ticket) => {
      if (!levels.has(ticket.id)) {
        levels.set(ticket.id, 0);
      }
    });

    // Group tickets by level
    const ticketsByLevel = new Map<number, Ticket[]>();
    featureTickets.forEach((ticket) => {
      const level = levels.get(ticket.id) ?? 0;
      if (!ticketsByLevel.has(level)) {
        ticketsByLevel.set(level, []);
      }
      ticketsByLevel.get(level)!.push(ticket);
    });

    // Sort each level by creation date
    ticketsByLevel.forEach((tickets) => {
      tickets.sort((a, b) => a.createdAt - b.createdAt);
    });

    const maxLevel = Math.max(...Array.from(levels.values()), 0);
    const calculatedNodes: TicketNode[] = [];

    // Position nodes
    for (let level = 0; level <= maxLevel; level++) {
      const levelTickets = ticketsByLevel.get(level) || [];
      const startY = PADDING;

      levelTickets.forEach((ticket, index) => {
        const x = PADDING + level * (NODE_WIDTH + HORIZONTAL_SPACING);
        const y = startY + index * (NODE_HEIGHT + VERTICAL_SPACING);
        
        calculatedNodes.push({
          ticket,
          level,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        });
      });
    }

    // Create connections
    const calculatedConnections: Connection[] = [];
    calculatedNodes.forEach((toNode) => {
      toNode.ticket.dependencies.forEach((depId) => {
        const fromNode = calculatedNodes.find((n) => n.ticket.id === depId);
        if (fromNode) {
          calculatedConnections.push({
            from: depId,
            to: toNode.ticket.id,
            fromNode,
            toNode,
          });
        }
      });
    });

    const width = maxLevel > 0 
      ? PADDING * 2 + (maxLevel + 1) * (NODE_WIDTH + HORIZONTAL_SPACING) - HORIZONTAL_SPACING
      : PADDING * 2 + NODE_WIDTH;
    
    const maxNodesInLevel = Math.max(...Array.from(ticketsByLevel.values()).map(t => t.length), 1);
    const height = PADDING * 2 + maxNodesInLevel * (NODE_HEIGHT + VERTICAL_SPACING) - VERTICAL_SPACING;

    return {
      nodes: calculatedNodes,
      connections: calculatedConnections,
      totalWidth: width,
      totalHeight: height,
    };
  }, [featureTickets]);

  // Update viewBox when nodes change
  const clampPan = (candidate: { x: number; y: number }, nextZoom = zoom) => {
    if (totalWidth <= 0 || totalHeight <= 0) {
      return { x: 0, y: 0 };
    }
    const width = totalWidth / nextZoom;
    const height = totalHeight / nextZoom;
    const maxX = Math.max(0, totalWidth - width);
    const maxY = Math.max(0, totalHeight - height);
    if (nextZoom <= 1) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.min(Math.max(candidate.x, 0), maxX),
      y: Math.min(Math.max(candidate.y, 0), maxY),
    };
  };

  useEffect(() => {
    if (totalWidth > 0 && totalHeight > 0) {
      const width = totalWidth / zoom;
      const height = totalHeight / zoom;
      const clampedPan = clampPan(pan);
      if (clampedPan.x !== pan.x || clampedPan.y !== pan.y) {
        setPan(clampedPan);
        setViewBox({ x: clampedPan.x, y: clampedPan.y, width, height });
        return;
      }
      const centeredX = zoom > 1 ? clampedPan.x : Math.max(0, (totalWidth - width) / 2);
      const centeredY = zoom > 1 ? clampedPan.y : Math.max(0, (totalHeight - height) / 2);
      setViewBox({ x: centeredX, y: centeredY, width, height });
    }
  }, [totalWidth, totalHeight, zoom, pan]);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [open, featureId]);

  useEffect(() => {
    if (totalWidth <= 0 || totalHeight <= 0) {
      previousZoomRef.current = zoom;
      return;
    }
    if (zoom > 1 && previousZoomRef.current <= 1) {
      const width = totalWidth / zoom;
      const height = totalHeight / zoom;
      const centerX = Math.max(0, (totalWidth - width) / 2);
      const centerY = Math.max(0, (totalHeight - height) / 2);
      setPan({ x: centerX, y: centerY });
    } else if (zoom <= 1 && previousZoomRef.current > 1) {
      setPan({ x: 0, y: 0 });
    }
    previousZoomRef.current = zoom;
  }, [zoom, totalWidth, totalHeight]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const getDeveloperName = (developerId: string) => {
    return developers.find(d => d.id === developerId)?.name ?? 'Unassigned';
  };

  const getSprintName = (ticket: Ticket) => {
    const sprintId = currentSprintId(ticket);
    const sprint = sprints.find(s => s.id === sprintId);
    return sprint?.name ?? 'Backlog';
  };

  if (!open) return null;

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    const svg = svgRef.current;
    if (!svg) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    panStateRef.current = {
      isPanning: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!panStateRef.current.isPanning || zoom <= 1) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const { startX, startY, originX, originY } = panStateRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;

    const nextPan = {
      x: originX - deltaX * scaleX,
      y: originY - deltaY * scaleY,
    };
    setPan(clampPan(nextPan));
  };

  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!panStateRef.current.isPanning) return;
    const svg = svgRef.current;
    if (svg) {
      if (svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
    }
    panStateRef.current = { ...panStateRef.current, isPanning: false };
    setIsPanning(false);
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    setPan((prev) =>
      clampPan({
        x: prev.x + event.deltaX * scaleX,
        y: prev.y + event.deltaY * scaleY,
      }),
    );
  };

  const handleZoomIn = () => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, +(current + ZOOM_STEP).toFixed(2));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom((current) => {
      const next = Math.max(MIN_ZOOM, +(current - ZOOM_STEP).toFixed(2));
      return next;
    });
  };

  const handleFitAll = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-title"
    >
      <div
        className="relative flex h-[80vh] max-h-[80vh] w-full max-w-[95vw] flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="workflow-title" className="text-xl font-semibold text-slate-900">
              Dependency Workflow: {feature?.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Visual representation of ticket dependencies
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          {featureTickets.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-slate-500">
              No tickets in this feature
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg
                ref={svgRef}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                className={`h-full w-full ${zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPan}
                onPointerLeave={endPan}
                onWheel={handleWheel}
              >
                <defs>
                  <marker
                    id="workflow-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                  </marker>
                  <filter id="node-shadow">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.1" />
                  </filter>
                </defs>

                {/* Draw connections first (so they appear behind nodes) */}
                {connections.map((conn) => {
                  const fromCenterY = conn.fromNode.y + conn.fromNode.height / 2;
                  const toCenterY = conn.toNode.y + conn.toNode.height / 2;

                  // Arrow from right edge of from-node to left edge of to-node
                  const x1 = conn.fromNode.x + conn.fromNode.width;
                  const y1 = fromCenterY;
                  const x2 = conn.toNode.x;
                  const y2 = toCenterY;

                  // Create a curved path
                  const midX = (x1 + x2) / 2;
                  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

                  return (
                    <path
                      key={`${conn.from}-${conn.to}`}
                      d={path}
                      stroke="#64748b"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#workflow-arrow)"
                      opacity="0.6"
                    />
                  );
                })}

                {/* Draw nodes */}
                {nodes.map((node) => {
                  const developerName = getDeveloperName(node.ticket.developerId);
                  const sprintName = getSprintName(node.ticket);
                  const statusColors = getStatusColors(node.ticket.status);
                  
                  return (
                    <g key={node.ticket.id}>
                      {/* Node background */}
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx="8"
                        fill="white"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        filter="url(#node-shadow)"
                      />

                      {/* Status indicator strip on left edge */}
                      <rect
                        x={node.x}
                        y={node.y}
                        width="4"
                        height={node.height}
                        rx="8"
                        fill={statusColors.bg.includes('slate') ? '#64748b' :
                              statusColors.bg.includes('blue') ? '#3b82f6' :
                              statusColors.bg.includes('purple') ? '#a855f7' :
                              statusColors.bg.includes('yellow') ? '#eab308' :
                              statusColors.bg.includes('orange') ? '#f97316' :
                              '#22c55e'}
                      />

                      {/* Ticket key */}
                      <text
                        x={node.x + 12}
                        y={node.y + 20}
                        className="text-sm font-semibold"
                        fill="#1e293b"
                        fontSize="13"
                        fontWeight="600"
                      >
                        {node.ticket.key}
                      </text>

                      {/* Story points badge */}
                      <rect
                        x={node.x + node.width - 50}
                        y={node.y + 8}
                        width="40"
                        height="20"
                        rx="10"
                        fill="#e2e8f0"
                      />
                      <text
                        x={node.x + node.width - 30}
                        y={node.y + 22}
                        textAnchor="middle"
                        fill="#475569"
                        fontSize="11"
                        fontWeight="500"
                      >
                        {node.ticket.storyPoints} SP
                      </text>

                      {/* Ticket name */}
                      <foreignObject
                        x={node.x + 12}
                        y={node.y + 34}
                        width={node.width - 24}
                        height={32}
                      >
                        <div className="text-xs text-slate-700" style={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.4',
                          wordBreak: 'break-word'
                        }}>
                          {node.ticket.name}
                        </div>
                      </foreignObject>

                      {/* Status badge */}
                      <foreignObject
                        x={node.x + 12}
                        y={node.y + 72}
                        width={node.width - 24}
                        height={22}
                      >
                        <div className="flex items-center">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                            {node.ticket.status}
                          </span>
                        </div>
                      </foreignObject>

                      {/* Developer and Sprint info on same line */}
                      <text
                        x={node.x + 12}
                        y={node.y + node.height - 10}
                        fill="#64748b"
                        fontSize="11"
                      >
                        👤 {developerName}
                      </text>
                      <text
                        x={node.x + node.width - 12}
                        y={node.y + node.height - 10}
                        fill="#64748b"
                        fontSize="11"
                        textAnchor="end"
                      >
                        📅 {sprintName}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-4">
              <span>{featureTickets.length} ticket{featureTickets.length === 1 ? '' : 's'}</span>
              <span>{connections.length} dependenc{connections.length === 1 ? 'y' : 'ies'}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={handleFitAll}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label="Fit all nodes in view"
              >
                Fit All
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Zoom</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoom <= MIN_ZOOM}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-sm font-medium text-slate-700">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoom >= MAX_ZOOM}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
