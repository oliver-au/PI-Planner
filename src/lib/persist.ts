import type { Developer, Feature, Sprint, Ticket } from '../types';
import {
  BACKLOG_COLUMN_ID,
  DEFAULT_SPRINT_CAPACITY,
  REQUIRED_SPRINT_COUNT,
  UNASSIGNED_DEVELOPER_ID,
} from '../constants';

const STORAGE_KEY = 'piPlanner.v1';

type PersistedTicket = Omit<Ticket, 'createdAt' | 'sprintIds' | 'dependencies'> & {
  createdAt?: number;
  sprintId?: string;
  sprintIds?: string[];
  dependencies?: string[];
};

type PersistShape = {
  sprints: Sprint[];
  developers: Developer[];
  features: Feature[];
  tickets: PersistedTicket[];
  currentSprintId?: string | null;
};

export type PlannerData = {
  sprints: Sprint[];
  developers: Developer[];
  features: Feature[];
  tickets: Ticket[];
  currentSprintId: string | null;
};

const defaultData = buildSeedData();

function ensureUnassignedDeveloper(developers: Developer[]): Developer[] {
  if (developers.some((dev) => dev.id === UNASSIGNED_DEVELOPER_ID)) {
    return developers;
  }
  return [{ id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' }, ...developers];
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

export function loadPlannerState(): PlannerData {
  if (typeof window === 'undefined') {
    return defaultData;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }

    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || !Array.isArray(parsed.tickets)) {
      return defaultData;
    }

    const migratedTickets = parsed.tickets.map((ticket, index) =>
      migrateTicket(ticket, index),
    );

    const developers = ensureUnassignedDeveloper(
      parsed.developers?.length ? parsed.developers : defaultData.developers,
    );
    const sprints = ensureSprintSlots(
      parsed.sprints?.length ? parsed.sprints : defaultData.sprints,
    );

    const orderedByOrder = [...sprints].sort((a, b) => a.order - b.order);
    const fallbackCurrent = orderedByOrder[0]?.id ?? null;
    const persistedCurrent =
      typeof parsed.currentSprintId === 'string'
        ? parsed.currentSprintId
        : defaultData.currentSprintId;
    const currentSprintId =
      persistedCurrent && sprints.some((sprint) => sprint.id === persistedCurrent)
        ? persistedCurrent
        : fallbackCurrent;

    const data: PlannerData = {
      sprints,
      developers,
      features: parsed.features?.length
        ? parsed.features
        : defaultData.features,
      tickets: migratedTickets.map((ticket) => ({
        ...ticket,
        developerId: developers.some((dev) => dev.id === ticket.developerId)
          ? ticket.developerId
          : UNASSIGNED_DEVELOPER_ID,
      })),
      currentSprintId: currentSprintId ?? null,
    };

    return data;
  } catch (error) {
    console.warn('pi-planner: failed to load state, using defaults', error);
    return defaultData;
  }
}

export function persistPlannerState(data: PlannerData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('pi-planner: failed to persist state', error);
  }
}

function migrateTicket(ticket: PersistedTicket, index: number): Ticket {
  const baseCreatedAt =
    Date.now() - 60_000 * 10 + index * 1000; /* stable-ish ordering */

  const sprintTrail =
    ticket.sprintIds ??
    (ticket.sprintId ? [ticket.sprintId] : defaultSprintTrail());

  return {
    ...ticket,
    createdAt: ticket.createdAt ?? baseCreatedAt,
    sprintIds: sprintTrail,
    dependencies: ticket.dependencies ?? [],
  };
}

function defaultSprintTrail(): string[] {
  const { sprints } = defaultData;
  return sprints.length ? [sprints[0]!.id] : [BACKLOG_COLUMN_ID];
}

function buildSeedData(): PlannerData {
  const sprints: Sprint[] = ensureSprintSlots([
    { id: 'S1', name: 'Sprint 1', order: 1, capacityPerDevSP: DEFAULT_SPRINT_CAPACITY },
    { id: 'S2', name: 'Sprint 2', order: 2, capacityPerDevSP: DEFAULT_SPRINT_CAPACITY },
    { id: 'S3', name: 'Sprint 3', order: 3, capacityPerDevSP: DEFAULT_SPRINT_CAPACITY },
    { id: 'S4', name: 'Sprint 4', order: 4, capacityPerDevSP: DEFAULT_SPRINT_CAPACITY },
  ]);

  const developers: Developer[] = [
    { id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' },
    { id: 'dev-alice', name: 'Alice' },
    { id: 'dev-bob', name: 'Bob' },
    { id: 'dev-carol', name: 'Carol' },
    { id: 'dev-david', name: 'David' },
    { id: 'dev-ethan', name: 'Ethan' },
  ];

  const features: Feature[] = [
    { id: 'F1', name: 'Unified Billing' },
    { id: 'F2', name: 'Onboarding Experience' },
  ];

  const rawTickets: Omit<Ticket, 'createdAt'>[] = [
    {
      id: 't-key-11',
      key: 'KEY-11',
      name: 'Order ingest service',
      storyPoints: 5,
      developerId: 'dev-alice',
      featureId: 'F1',
      sprintIds: ['S1'],
      dependencies: [],
    },
    {
      id: 't-key-2',
      key: 'KEY-2',
      name: 'Checkout adapter integration',
      storyPoints: 3,
      developerId: 'dev-bob',
      featureId: 'F1',
      sprintIds: ['S2'],
      dependencies: ['t-key-11'],
    },
    {
      id: 't-key-13',
      key: 'KEY-13',
      name: 'Release toggle UI',
      storyPoints: 5,
      developerId: 'dev-carol',
      featureId: 'F1',
      sprintIds: ['S3'],
      dependencies: ['t-key-2'],
    },
    {
      id: 't-key-5',
      key: 'KEY-5',
      name: 'Plan metrics API',
      storyPoints: 4,
      developerId: 'dev-david',
      featureId: 'F1',
      sprintIds: ['S2', 'S3'],
      dependencies: [],
    },
    {
      id: 't-key-8',
      key: 'KEY-8',
      name: 'Analytics connector',
      storyPoints: 2,
      developerId: 'dev-ethan',
      featureId: 'F1',
      sprintIds: ['S4'],
      dependencies: [],
    },
    {
      id: 't-key-21',
      key: 'KEY-21',
      name: 'Persona mapping',
      storyPoints: 3,
      developerId: 'dev-alice',
      featureId: 'F2',
      sprintIds: ['S2'],
      dependencies: ['t-key-23'],
    },
    {
      id: 't-key-22',
      key: 'KEY-22',
      name: 'Guided tour scaffolding',
      storyPoints: 5,
      developerId: 'dev-bob',
      featureId: 'F2',
      sprintIds: ['S3'],
      dependencies: [],
    },
    {
      id: 't-key-23',
      key: 'KEY-23',
      name: 'Event bus instrumentation',
      storyPoints: 4,
      developerId: 'dev-carol',
      featureId: 'F2',
      sprintIds: ['S2'],
      dependencies: [],
    },
    {
      id: 't-key-24',
      key: 'KEY-24',
      name: 'Role sync worker',
      storyPoints: 3,
      developerId: 'dev-david',
      featureId: 'F2',
      sprintIds: ['S1'],
      dependencies: [],
    },
    {
      id: 't-key-25',
      key: 'KEY-25',
      name: 'Lifecycle emails',
      storyPoints: 5,
      developerId: 'dev-ethan',
      featureId: 'F2',
      sprintIds: ['S3'],
      dependencies: ['t-key-22'],
    },
    {
      id: 't-key-26',
      key: 'KEY-26',
      name: 'Feedback exporter',
      storyPoints: 2,
      developerId: 'dev-bob',
      featureId: 'F2',
      sprintIds: ['S4'],
      dependencies: [],
    },
  ];

  const baseTime = Date.now() - rawTickets.length * 1000;
  const tickets: Ticket[] = rawTickets.map((ticket, index) => ({
    ...ticket,
    createdAt: baseTime + index * 1000,
  }));

  return {
    sprints,
    developers,
    features,
    tickets,
    currentSprintId: sprints[0]?.id ?? null,
  };
}

export { ensureUnassignedDeveloper, ensureSprintSlots };

export function clearPlannerState(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
