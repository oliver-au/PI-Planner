import type { Sprint, Ticket } from '../types';
import { BACKLOG_COLUMN_ID } from '../constants';

export const currentSprintId = (ticket: Ticket): string =>
  ticket.sprintIds[ticket.sprintIds.length - 1];

export const sprintIndex = (id: string, ordered: string[]): number =>
  ordered.indexOf(id);

export const sortSprintTrail = (
  sprintIds: string[],
  ordered: string[],
): string[] => {
  const seen = new Set<string>();
  const deduped = sprintIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return deduped.sort(
    (a, b) => sprintIndex(a, ordered) - sprintIndex(b, ordered),
  );
};

export function isMoveBlockedByDeps(
  ticket: Ticket,
  targetSprintId: string,
  getTicket: (id: string) => Ticket | undefined,
  orderedIds: string[],
): { blocked: boolean; blockers: string[] } {
  if (targetSprintId === BACKLOG_COLUMN_ID) {
    return { blocked: false, blockers: [] };
  }
  const targetIdx = sprintIndex(targetSprintId, orderedIds);
  const blockers = ticket.dependencies.filter((depId) => {
    const dep = getTicket(depId);
    if (!dep) return false;
    return sprintIndex(currentSprintId(dep), orderedIds) > targetIdx;
  });
  return { blocked: blockers.length > 0, blockers };
}

export const capacityForSprint = (
  sprintId: string,
  sprints: Sprint[],
): number => {
  const sprint = sprints.find((s) => s.id === sprintId);
  return sprint?.capacityPerDevSP ?? 8;
};
