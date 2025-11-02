import type { Developer, Feature, Sprint, Ticket, TicketStatus } from '../types';
import {
  BACKLOG_COLUMN_ID,
  DEFAULT_SPRINT_CAPACITY,
  REQUIRED_SPRINT_COUNT,
  UNASSIGNED_DEVELOPER_ID,
} from '../constants';

export type PersistedTicket = Omit<
  Ticket,
  'createdAt' | 'sprintIds' | 'dependencies' | 'status'
> & {
  createdAt?: number;
  sprintId?: string;
  sprintIds?: string[];
  dependencies?: string[];
  jiraUrl?: string;
  status?: TicketStatus;
};

export type PlannerData = {
  sprints: Sprint[];
  developers: Developer[];
  features: Feature[];
  tickets: Ticket[];
  currentSprintId: string | null;
  ticketBaseUrl: string | null;
};

export function ensureUnassignedDeveloper(developers: Developer[]): Developer[] {
  if (developers.some((dev) => dev.id === UNASSIGNED_DEVELOPER_ID)) {
    return developers;
  }
  return [{ id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' }, ...developers];
}

export function ensureSprintSlots(sprints: Sprint[]): Sprint[] {
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

export function buildSeedData(): PlannerData {
  const sprints: Sprint[] = ensureSprintSlots([]);
  const developers: Developer[] = [{ id: UNASSIGNED_DEVELOPER_ID, name: 'Unassigned' }];

  return {
    sprints,
    developers,
    features: [],
    tickets: [],
    currentSprintId: sprints[0]?.id ?? null,
    ticketBaseUrl: null,
  };
}

export function defaultSprintTrail(seedData: PlannerData): string[] {
  const { sprints } = seedData;
  return sprints.length ? [sprints[0]!.id] : [BACKLOG_COLUMN_ID];
}
