import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { currentSprintId, isMoveBlockedByDeps, sortSprintTrail } from '../lib/calc';
import { clearPlannerState, loadPlannerState, persistPlannerState, type PlannerData } from '../lib/persist';
import type { Developer, Feature, Sprint, Ticket } from '../types';
import {
  BACKLOG_COLUMN_ID,
  DEFAULT_SPRINT_CAPACITY,
  REQUIRED_SPRINT_COUNT,
  UNASSIGNED_DEVELOPER_ID,
} from '../constants';

type MoveMode = 'move' | 'extend';

type KeyboardMoveState = {
  ticketId: string;
  targetDeveloperId: string;
  targetSprintId: string;
};

type LiveAnnouncement = {
  message: string;
  timestamp: number;
};

type NoticeTone = 'info' | 'error';

export type PlannerNotice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

type PlannerStore = PlannerData & {
  showDependencies: boolean;
  keyboardMove: KeyboardMoveState | null;
  liveAnnouncement: LiveAnnouncement | null;
  notices: PlannerNotice[];
  addFeature: (name: string) => void;
  updateFeature: (id: string, patch: Partial<Feature>) => void;
  removeFeature: (id: string) => void;
  addDeveloper: (name: string) => void;
  updateDeveloper: (id: string, patch: Partial<Developer>) => void;
  removeDeveloper: (id: string) => void;
  addTicket: (partial: Omit<Ticket, 'id' | 'createdAt' | 'dependencies' | 'sprintIds'> & { sprintIds?: string[]; dependencies?: string[] }) => void;
  updateTicket: (id: string, patch: Partial<Ticket>) => void;
  deleteTicket: (id: string) => void;
  moveTicket: (id: string, toSprintId: string, mode: MoveMode) => void;
  moveTicketTo: (id: string, toSprintId: string, developerId: string, mode: MoveMode) => void;
  setSprintTrail: (id: string, sprintIds: string[]) => void;
  refreshTicketPositions: () => void;
  replaceState: (data: PlannerData) => void;
  getPlannerSnapshot: () => PlannerData;
  getTicketsByFeature: (featureId: string) => Ticket[];
  getCapacityBy: (
    developerId: string,
    sprintId: string,
  ) => { assigned: number; capacity: number; over: boolean };
  isMoveBlockedByDeps: (ticketId: string, targetSprintId: string) => {
    blocked: boolean;
    blockers: string[];
  };
  toggleDependencies: () => void;
  announce: (message: string) => void;
  clearAnnouncement: () => void;
  beginKeyboardMove: (ticketId: string) => void;
  moveKeyboardTarget: (axis: 'row' | 'column', delta: number) => void;
  commitKeyboardMove: (mode: MoveMode) => void;
  cancelKeyboardMove: () => void;
  pushNotice: (message: string, tone?: NoticeTone) => void;
  dismissNotice: (id: number) => void;
  setCurrentSprint: (id: string | null) => void;
  resetPlanner: () => void;
  setTicketBaseUrl: (url: string | null) => void;
};

const seed = normalizeState(loadPlannerState());

function ensureUnassignedDeveloper(developers: Developer[]): Developer[] {
  if (developers.some((dev) => dev.id === UNASSIGNED_DEVELOPER_ID)) {
    return developers;
  }
  return [
    { id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' },
    ...developers,
  ];
}

function ensureSprintSlots(sprints: Sprint[]): Sprint[] {
  const sorted = [...sprints].sort((a, b) => a.order - b.order);
  let nextOrder = sorted.length ? sorted[sorted.length - 1]!.order + 1 : 1;
  const result = [...sorted];
  while (result.length < REQUIRED_SPRINT_COUNT) {
    const index = result.length + 1;
    result.push({
      id: `S${index}`,
      name: `Sprint ${index}`,
      order: nextOrder,
      capacityPerDevSP: DEFAULT_SPRINT_CAPACITY,
    });
    nextOrder += 1;
  }
  return result;
}

export const usePiStore = create<PlannerStore>((set, get) => {
  const commit = (patch: Partial<PlannerData>) => {
    const state = get();
    persistPlannerState({
      sprints: patch.sprints ?? state.sprints,
      developers: patch.developers ?? state.developers,
      features: patch.features ?? state.features,
      tickets: patch.tickets ?? state.tickets,
      currentSprintId: patch.currentSprintId ?? state.currentSprintId,
      ticketBaseUrl: patch.ticketBaseUrl ?? state.ticketBaseUrl,
    });
  };

  return {
    ...seed,
    showDependencies: true,
    keyboardMove: null,
    liveAnnouncement: null,
    notices: [],

    addFeature: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { features } = get();
      const nextFeatures = [...features, { id: nanoid(), name: trimmed }];
      commit({ features: nextFeatures });
      set({ features: nextFeatures });
    },

    updateFeature: (id, patch) => {
      const { features } = get();
      const nextFeatures = features.map((feature) => {
        if (feature.id !== id) return feature;
        const trimmedName = patch.name?.trim();
        const providedUrl =
          typeof patch.url === 'string' ? patch.url.trim() : undefined;
        const normalizedUrl =
          patch.url === undefined
            ? feature.url
            : providedUrl
            ? providedUrl
            : undefined;
        return {
          ...feature,
          ...patch,
          name: trimmedName ? trimmedName : feature.name,
          url: normalizedUrl,
        };
      });
      commit({ features: nextFeatures });
      set({ features: nextFeatures });
    },

    removeFeature: (id) => {
      const { features, tickets } = get();
      const nextFeatures = features.filter((feature) => feature.id !== id);
      const nextTickets = tickets.filter((ticket) => ticket.featureId !== id);
      commit({ features: nextFeatures, tickets: nextTickets });
      set({ features: nextFeatures, tickets: nextTickets });
    },

    addDeveloper: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { developers } = get();
      const nextDevelopers = [
        ...developers,
        { id: nanoid(), name: trimmed },
      ];
      commit({ developers: nextDevelopers });
      set({ developers: nextDevelopers });
    },

    updateDeveloper: (id, patch) => {
      if (id === UNASSIGNED_DEVELOPER_ID) return;
      const { developers } = get();
      const nextDevelopers = developers.map((developer) =>
        developer.id === id
          ? {
              ...developer,
              ...patch,
              name: patch.name?.trim() ? patch.name.trim() : developer.name,
            }
          : developer,
      );
      commit({ developers: nextDevelopers });
      set({ developers: nextDevelopers });
    },

    removeDeveloper: (id) => {
      if (id === UNASSIGNED_DEVELOPER_ID) return;
      const { developers, tickets } = get();
      const nextDevelopers = developers.filter((developer) => developer.id !== id);
      const nextTickets = tickets.map((ticket) =>
        ticket.developerId === id
          ? { ...ticket, developerId: UNASSIGNED_DEVELOPER_ID }
          : ticket,
      );
      commit({ developers: nextDevelopers, tickets: nextTickets });
      set({ developers: nextDevelopers, tickets: nextTickets });
    },

    addTicket: (partial) => {
      const { tickets } = get();
      const orderedSprintIds = orderedSprints(get());
      const sprintIds = sortSprintTrail(partial.sprintIds ?? [], orderedSprintIds);
      const resolvedSprintIds = sprintIds.length
        ? sprintIds
        : [BACKLOG_COLUMN_ID];
      const developerId = partial.developerId ?? UNASSIGNED_DEVELOPER_ID;
      const ticket: Ticket = {
        ...partial,
        id: nanoid(),
        createdAt: Date.now(),
        sprintIds: resolvedSprintIds,
        dependencies: partial.dependencies ?? [],
        developerId,
        jiraUrl: partial.jiraUrl?.trim() ? partial.jiraUrl.trim() : undefined,
      };
      const nextTickets = [...tickets, ticket];
      commit({ tickets: nextTickets });
      set({ tickets: nextTickets });
    },

    updateTicket: (id, patch) => {
      const { tickets } = get();
      const orderedSprintIds = orderedSprints(get());
      const nextTickets = tickets.map((ticket) => {
        if (ticket.id !== id) return ticket;
        const developerId = patch.developerId ?? ticket.developerId ?? UNASSIGNED_DEVELOPER_ID;
        let sprintIds = patch.sprintIds ?? ticket.sprintIds;
        if (patch.sprintIds) {
          sprintIds = sortSprintTrail(patch.sprintIds, orderedSprintIds);
        }
        if (sprintIds.length === 0) {
          sprintIds = [BACKLOG_COLUMN_ID];
        }
        const normalizedKey =
          patch.key === undefined
            ? ticket.key
            : patch.key.trim()
            ? patch.key.trim().toUpperCase()
            : ticket.key;

        return {
          ...ticket,
          ...patch,
          key: normalizedKey,
          developerId,
          sprintIds,
          jiraUrl: patch.jiraUrl === undefined
            ? ticket.jiraUrl
            : patch.jiraUrl?.trim()
              ? patch.jiraUrl.trim()
              : undefined,
        };
      });
      commit({ tickets: nextTickets });
      set({ tickets: nextTickets });
    },

    deleteTicket: (id) => {
      const { tickets } = get();
      const nextTickets = tickets
        .filter((ticket) => ticket.id !== id)
        .map((ticket) => ({
          ...ticket,
          dependencies: ticket.dependencies.filter((depId) => depId !== id),
        }));
      commit({ tickets: nextTickets });
      set({ tickets: nextTickets });
    },

    moveTicket: (id, toSprintId, mode) => {
      const ticket = get().tickets.find((t) => t.id === id);
      if (!ticket) return;
      get().moveTicketTo(id, toSprintId, ticket.developerId, mode);
    },

    moveTicketTo: (id, toSprintId, developerId, mode) => {
      const { tickets } = get();
      const orderedSprintIds = orderedSprints(get());
      const nextTickets = tickets.map((ticket) => {
        if (ticket.id !== id) return ticket;
        const baseTrail =
          mode === 'extend' && toSprintId !== BACKLOG_COLUMN_ID
            ? sortSprintTrail([...ticket.sprintIds, toSprintId], orderedSprintIds)
            : [toSprintId];
        return {
          ...ticket,
          sprintIds: baseTrail.length ? baseTrail : [BACKLOG_COLUMN_ID],
          developerId,
        };
      });
      commit({ tickets: nextTickets });
      set({ tickets: nextTickets });
    },

    setSprintTrail: (id, sprintIds) => {
      const orderedSprintIds = orderedSprints(get());
      const nextTrail = sortSprintTrail(sprintIds, orderedSprintIds);
      get().updateTicket(id, {
        sprintIds: nextTrail.length ? nextTrail : [BACKLOG_COLUMN_ID],
      });
    },

    refreshTicketPositions: () => {
      const { tickets } = get();
      set({ tickets: [...tickets] });
    },

    replaceState: (data) => {
      const normalized = normalizeState(data);
      persistPlannerState(normalized);
      set(normalized);
    },

    getPlannerSnapshot: () => normalizeState(get()),

    getTicketsByFeature: (featureId) =>
      get().tickets.filter((ticket) => ticket.featureId === featureId),

    getCapacityBy: (developerId, sprintId) => {
      const { tickets, sprints } = get();
      const sprint = sprints.find((s) => s.id === sprintId);
      const capacity = sprint?.capacityPerDevSP ?? DEFAULT_SPRINT_CAPACITY;
      const assigned = tickets
        .filter(
          (ticket) =>
            ticket.developerId === developerId &&
            currentSprintId(ticket) === sprintId,
        )
        .reduce((sum, ticket) => sum + ticket.storyPoints, 0);
      return { assigned, capacity, over: assigned > capacity };
    },

    isMoveBlockedByDeps: (ticketId, targetSprintId) => {
      const { tickets } = get();
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) return { blocked: false, blockers: [] };
      const orderedSprintIds = orderedSprints(get());
      return isMoveBlockedByDeps(
        ticket,
        targetSprintId,
        (id) => tickets.find((t) => t.id === id),
        orderedSprintIds,
      );
    },

    toggleDependencies: () =>
      set((state) => ({ showDependencies: !state.showDependencies })),

    announce: (message) =>
      set({
        liveAnnouncement: {
          message,
          timestamp: Date.now(),
        },
      }),

    clearAnnouncement: () => set({ liveAnnouncement: null }),

    beginKeyboardMove: (ticketId) => {
      const ticket = get().tickets.find((t) => t.id === ticketId);
      if (!ticket) return;
      set({
        keyboardMove: {
          ticketId,
          targetDeveloperId: ticket.developerId,
          targetSprintId: currentSprintId(ticket),
        },
      });
    },

    moveKeyboardTarget: (axis, delta) => {
      const move = get().keyboardMove;
      if (!move) return;
      if (axis === 'row') {
        const developers = get().developers;
        const idx = developers.findIndex(
          (dev) => dev.id === move.targetDeveloperId,
        );
        const nextIdx = clampIndex(idx + delta, developers.length);
        set({
          keyboardMove: {
            ...move,
            targetDeveloperId: developers[nextIdx]?.id ?? move.targetDeveloperId,
          },
        });
      } else {
        const ids = orderedSprints(get());
        const augmented = [BACKLOG_COLUMN_ID, ...ids];
        const idx = augmented.indexOf(move.targetSprintId);
        const nextIdx = clampIndex(idx + delta, augmented.length);
        set({
          keyboardMove: {
            ...move,
            targetSprintId: augmented[nextIdx] ?? move.targetSprintId,
          },
        });
      }
    },

    commitKeyboardMove: (mode) => {
      const move = get().keyboardMove;
      if (!move) return;
      const { ticketId, targetSprintId, targetDeveloperId } = move;
      const { blocked, blockers } = get().isMoveBlockedByDeps(
        ticketId,
        targetSprintId,
      );
      if (blocked) {
        const blockerKeys = blockers
          .map((id) => get().tickets.find((t) => t.id === id)?.key)
          .filter(Boolean)
          .join(', ');
        get().announce(`Move blocked by ${blockerKeys}`);
        return;
      }

      const actualMode =
        targetSprintId === BACKLOG_COLUMN_ID ? 'move' : mode;
      get().moveTicketTo(ticketId, targetSprintId, targetDeveloperId, actualMode);
      const ticket = get().tickets.find((t) => t.id === ticketId);
      if (ticket) {
        const developer = get().developers.find(
          (dev) => dev.id === targetDeveloperId,
        );
        const sprint =
          targetSprintId === BACKLOG_COLUMN_ID
            ? { name: 'Backlog' }
            : get().sprints.find((sp) => sp.id === targetSprintId);
        get().announce(
          `${ticket.key} scheduled for ${developer?.name ?? 'Unknown'} in ${
            sprint?.name ?? targetSprintId
          }`,
        );
      }
      set({ keyboardMove: null });
    },

    cancelKeyboardMove: () => set({ keyboardMove: null }),

    pushNotice: (message, tone = 'info') => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      set((state) => ({
        notices: [...state.notices, { id, message, tone }],
      }));
    },

    dismissNotice: (id) =>
      set((state) => ({
        notices: state.notices.filter((notice) => notice.id !== id),
      })),

    setCurrentSprint: (id: string | null) => {
      const { sprints } = get();
      const ordered = [...sprints].sort((a, b) => a.order - b.order);
      const fallback = ordered[0]?.id ?? null;
      const valid =
        id && sprints.some((sprint) => sprint.id === id) ? id : fallback;
      commit({ currentSprintId: valid });
      set({ currentSprintId: valid });
    },

    setTicketBaseUrl: (url) => {
      const trimmed =
        url && url.trim().length > 0 ? url.trim() : null;
      commit({ ticketBaseUrl: trimmed });
      set({ ticketBaseUrl: trimmed });
      if (trimmed) {
        get().announce(`Ticket links will now use ${trimmed}${trimmed.endsWith('/') ? '' : '/' } + key.`);
      } else {
        get().announce('Ticket link base cleared.');
      }
    },

    resetPlanner: () => {
      clearPlannerState();
      const seeded = normalizeState(loadPlannerState());
      const cleared: PlannerData = {
        ...seeded,
        developers: [
          { id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' },
        ],
        features: [],
        tickets: [],
      };
      persistPlannerState(cleared);
      set({
        ...cleared,
        notices: [],
        keyboardMove: null,
        liveAnnouncement: null,
      });
    },
  };
});

const orderedSprints = (state: Pick<PlannerStore, 'sprints'>): string[] =>
  [...state.sprints]
    .sort((a, b) => a.order - b.order)
    .map((sprint) => sprint.id);

const clampIndex = (value: number, length: number): number => {
  if (length === 0) return 0;
  if (value < 0) return 0;
  if (value > length - 1) return length - 1;
  return value;
};

export const selectDevelopers = (state: PlannerStore): Developer[] =>
  state.developers;

export const selectOrderedSprints = (state: PlannerStore) =>
  [...state.sprints].sort((a, b) => a.order - b.order);

function normalizeState(data: PlannerData): PlannerData {
  const developers = ensureUnassignedDeveloper(data.developers);
  const sprints = ensureSprintSlots(data.sprints);
  const features = data.features.length ? data.features : [{ id: 'feature-default', name: 'New Feature' }];
  const featureIds = new Set(features.map((feature) => feature.id));
  const developerIds = new Set(developers.map((developer) => developer.id));
  const sprintOrder = sprints.map((sprint) => sprint.id);
  const sprintSet = new Set<string>([...sprintOrder, BACKLOG_COLUMN_ID]);
  const ticketMap = new Map<string, Ticket>();
  data.tickets.forEach((ticket) => ticketMap.set(ticket.id, ticket));

  const sanitizedTickets = data.tickets.map((ticket) => {
    const developerId = developerIds.has(ticket.developerId)
      ? ticket.developerId
      : UNASSIGNED_DEVELOPER_ID;
    const featureId = featureIds.has(ticket.featureId)
      ? ticket.featureId
      : features[0]?.id ?? 'feature-default';
    const trail = sortSprintTrail(
      ticket.sprintIds.filter((id) => sprintSet.has(id)),
      sprintOrder,
    );
    const dependencies = ticket.dependencies
      .filter((depId) => depId !== ticket.id)
      .filter((depId) => ticketMap.has(depId));

    return {
      ...ticket,
      developerId,
      featureId,
      sprintIds: trail.length ? trail : [BACKLOG_COLUMN_ID],
      dependencies,
      jiraUrl: ticket.jiraUrl?.trim() ? ticket.jiraUrl.trim() : undefined,
    };
  });

  const ordered = [...sprints].sort((a, b) => a.order - b.order);
  const fallbackCurrent = ordered[0]?.id ?? null;
  const currentSprintId =
    data.currentSprintId && sprints.some((sprint) => sprint.id === data.currentSprintId)
      ? data.currentSprintId
      : fallbackCurrent;

  return {
    sprints,
    developers,
    features,
    tickets: sanitizedTickets,
    currentSprintId: currentSprintId ?? null,
    ticketBaseUrl: data.ticketBaseUrl?.trim() ? data.ticketBaseUrl.trim() : null,
  };
}
