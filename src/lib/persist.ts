import { UNASSIGNED_DEVELOPER_ID } from '../constants';
import type { Ticket } from '../types';
import {
  buildSeedData,
  defaultSprintTrail,
  ensureSprintSlots,
  ensureUnassignedDeveloper,
  type PlannerData,
  type PersistedTicket,
} from './plannerData';

type PersistShape = {
  sprints?: PlannerData['sprints'];
  developers?: PlannerData['developers'];
  features?: PlannerData['features'];
  tickets?: PersistedTicket[];
  currentSprintId?: string | null;
  ticketBaseUrl?: string | null;
};

const API_ENDPOINT = '/api/planner';
const defaultData = buildSeedData();

export type { PlannerData } from './plannerData';

export async function loadPlannerState(): Promise<PlannerData> {
  if (typeof window === 'undefined') {
    return defaultData;
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = (await response.json()) as PersistShape | undefined;
    return hydratePersistedData(payload);
  } catch (error) {
    console.warn('pi-planner: failed to load planner data, using defaults', error);
    return defaultData;
  }
}

export async function persistPlannerState(data: PlannerData): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
  } catch (error) {
    console.warn('pi-planner: failed to persist planner data', error);
  }
}

export async function clearPlannerState(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch(API_ENDPOINT, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
  } catch (error) {
    console.warn('pi-planner: failed to clear planner data', error);
  }
}

function hydratePersistedData(payload: PersistShape | null | undefined): PlannerData {
  if (!payload || !Array.isArray(payload.tickets)) {
    return defaultData;
  }

  const developers = ensureUnassignedDeveloper(
    payload.developers?.length ? payload.developers : defaultData.developers,
  );
  const sprints = ensureSprintSlots(
    payload.sprints?.length ? payload.sprints : defaultData.sprints,
  );

  const migratedTickets = payload.tickets.map((ticket, index) =>
    migrateTicket(ticket, index),
  );

  const ordered = [...sprints].sort((a, b) => a.order - b.order);
  const fallbackCurrent = ordered[0]?.id ?? null;
  const persistedCurrent =
    typeof payload.currentSprintId === 'string'
      ? payload.currentSprintId
      : defaultData.currentSprintId;
  const currentSprintId =
    persistedCurrent && sprints.some((sprint) => sprint.id === persistedCurrent)
      ? persistedCurrent
      : fallbackCurrent;

  const normalizedTicketList = migratedTickets.map((ticket) => ({
    ...ticket,
    developerId: developers.some((dev) => dev.id === ticket.developerId)
      ? ticket.developerId
      : UNASSIGNED_DEVELOPER_ID,
  }));

  return {
    sprints,
    developers,
    features: payload.features?.length ? payload.features : defaultData.features,
    tickets: normalizedTicketList,
    currentSprintId: currentSprintId ?? null,
    ticketBaseUrl:
      typeof payload.ticketBaseUrl === 'string'
        ? payload.ticketBaseUrl
        : defaultData.ticketBaseUrl,
  };
}

function migrateTicket(ticket: PersistedTicket, index: number): Ticket {
  const baseCreatedAt =
    Date.now() - 60_000 * 10 + index * 1000; /* stable-ish ordering */

  const sprintTrail =
    ticket.sprintIds ??
    (ticket.sprintId ? [ticket.sprintId] : defaultSprintTrail(defaultData));

  return {
    ...ticket,
    createdAt: ticket.createdAt ?? baseCreatedAt,
    sprintIds: sprintTrail,
    dependencies: ticket.dependencies ?? [],
    jiraUrl: ticket.jiraUrl?.trim() ? ticket.jiraUrl.trim() : undefined,
    status: ticket.status ?? 'TO DO',
  };
}

export { buildSeedData, ensureSprintSlots, ensureUnassignedDeveloper };
