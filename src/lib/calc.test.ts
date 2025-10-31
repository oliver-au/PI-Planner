import { describe, expect, it } from 'vitest';
import { BACKLOG_COLUMN_ID } from '../constants';
import {
  capacityForSprint,
  currentSprintId,
  isMoveBlockedByDeps,
  sortSprintTrail,
} from './calc';
import type { Sprint, Ticket } from '../types';

describe('calc helpers', () => {
  const orderedSprintIds = ['S1', 'S2', 'S3'];

  const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
    id: overrides.id ?? 't-1',
    key: overrides.key ?? 'KEY-1',
    name: overrides.name ?? 'Example',
    storyPoints: overrides.storyPoints ?? 3,
    developerId: overrides.developerId ?? 'dev-a',
    featureId: overrides.featureId ?? 'feature-a',
    sprintIds: overrides.sprintIds ?? ['S1'],
    dependencies: overrides.dependencies ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    jiraUrl: overrides.jiraUrl,
  });

  it('sorts sprint trails by PI order and de-duplicates entries', () => {
    const trail = ['S3', 'S1', 'S2', 'S3'];
    const sorted = sortSprintTrail(trail, orderedSprintIds);
    expect(sorted).toEqual(['S1', 'S2', 'S3']);
  });

  it('derives the current sprint from the last entry in the trail', () => {
    const ticket = makeTicket({ sprintIds: ['S1', 'S3'] });
    expect(currentSprintId(ticket)).toBe('S3');
  });

  it('blocks moves when dependencies finish in later sprints', () => {
    const dependency = makeTicket({ id: 'dep-1', sprintIds: ['S3'] });
    const target = makeTicket({
      id: 'target',
      dependencies: ['dep-1'],
      sprintIds: ['S1'],
    });

    const { blocked, blockers } = isMoveBlockedByDeps(
      target,
      'S1',
      (id) => (id === 'dep-1' ? dependency : undefined),
      orderedSprintIds,
    );

    expect(blocked).toBe(true);
    expect(blockers).toEqual(['dep-1']);
  });

  it('allows moves into the backlog regardless of dependency trail', () => {
    const dependency = makeTicket({ id: 'dep-2', sprintIds: ['S3'] });
    const target = makeTicket({
      id: 'target-2',
      dependencies: ['dep-2'],
    });

    const { blocked } = isMoveBlockedByDeps(
      target,
      BACKLOG_COLUMN_ID,
      (id) => (id === 'dep-2' ? dependency : undefined),
      orderedSprintIds,
    );

    expect(blocked).toBe(false);
  });

  it('falls back to the default capacity when a sprint is missing', () => {
    const sprints: Sprint[] = [
      { id: 'S1', name: 'Sprint 1', order: 1, capacityPerDevSP: 5 },
    ];

    expect(capacityForSprint('S1', sprints)).toBe(5);
    expect(capacityForSprint('S2', sprints)).toBe(8);
  });
});
