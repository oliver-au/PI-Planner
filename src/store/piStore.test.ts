import { beforeEach, describe, expect, it } from 'vitest';
import { BACKLOG_COLUMN_ID, UNASSIGNED_DEVELOPER_ID } from '../constants';
import { getStoreState, resetPiStore } from '../test/storeTestUtils';

describe('usePiStore ticket lifecycle', () => {
  beforeEach(() => {
    resetPiStore();
  });

  it('adds a ticket with defaults when optional fields are omitted', () => {
  const store = getStoreState();
    const featureId = store.features[0]?.id ?? 'feature-default';
    const developerId = store.developers[0]?.id ?? 'dev-default';
    const startingCount = store.tickets.length;

    store.addTicket({
      key: 'ART-500',
      name: 'Scenario planning',
      storyPoints: 5,
      featureId,
      developerId,
    });

  const { tickets } = getStoreState();
    expect(tickets).toHaveLength(startingCount + 1);
    const added = tickets.find((ticket) => ticket.key === 'ART-500');
    expect(added).toBeDefined();
    expect(added?.sprintIds).toEqual([BACKLOG_COLUMN_ID]);
    expect(added?.jiraUrl).toBeUndefined();
  });

  it('normalises ticket keys and URLs on update', () => {
  const store = getStoreState();
    const ticket = store.tickets[0]!;

    store.updateTicket(ticket.id, {
      key: 'ref-123',
      jiraUrl: '  https://issues.example.com/browse/ref-123  ',
    });

  const updated = getStoreState().tickets.find((item) => item.id === ticket.id);
    expect(updated?.key).toBe('REF-123');
    expect(updated?.jiraUrl).toBe('https://issues.example.com/browse/ref-123');
  });

  it('removes downstream dependencies when a ticket is deleted', () => {
    const store = getStoreState();
    const target = store.tickets.find((candidate) =>
      store.tickets.some((other) => other.dependencies.includes(candidate.id)),
    );
    expect(target).toBeDefined();
    if (!target) return;

    store.deleteTicket(target.id);

  const state = getStoreState();
    const stillPresent = state.tickets.find((ticket) => ticket.id === target.id);
    expect(stillPresent).toBeUndefined();
    expect(
      state.tickets.some((ticket) => ticket.dependencies.includes(target.id)),
    ).toBe(false);
  });

  it('extends a ticket across sprints in extend mode', () => {
  const store = getStoreState();
    const sprintIds = store.sprints.map((sprint) => sprint.id);
    const nextSprint = sprintIds[1];
    const firstSprint = sprintIds[0];
    const ticket = store.tickets.find(
      (item) => item.sprintIds.length === 1 && item.sprintIds[0] === firstSprint,
    );
    expect(ticket).toBeDefined();
    if (!ticket || !nextSprint || !firstSprint) return;

    store.moveTicketTo(ticket.id, nextSprint, ticket.developerId, 'extend');

  const updated = getStoreState().tickets.find((item) => item.id === ticket.id);
    expect(updated?.sprintIds).toEqual([firstSprint, nextSprint]);
  });
});

describe('usePiStore feature and capacity helpers', () => {
  beforeEach(() => {
    resetPiStore();
  });

  it('trims feature names and URLs when updating', () => {
  const store = getStoreState();
    const feature = store.features[0]!;

    store.updateFeature(feature.id, {
      name: `  ${feature.name} v2  `,
      url: ' https://product.example.com/features/updated ',
    });

  const updated = getStoreState().features.find((item) => item.id === feature.id);
    expect(updated?.name).toBe(`${feature.name} v2`);
    expect(updated?.url).toBe('https://product.example.com/features/updated');

    store.updateFeature(feature.id, { url: '   ' });
  const cleared = getStoreState().features.find((item) => item.id === feature.id);
    expect(cleared?.url).toBeUndefined();
  });

  it('calculates capacity per developer and sprint', () => {
  const store = getStoreState();
    const developer = store.developers.find(
      (dev) => dev.id !== UNASSIGNED_DEVELOPER_ID,
    );
    const sprint = store.sprints[0]!;
    if (!developer) {
      throw new Error('Expected seeded developer');
    }

  const summary = store.getCapacityBy(developer.id, sprint.id);
    expect(summary.capacity).toBeGreaterThan(0);
    expect(summary.assigned).toBeGreaterThanOrEqual(0);
    expect(summary.over).toBe(summary.assigned > summary.capacity);
  });

  it('announces updates when the ticket base URL changes', () => {
  const store = getStoreState();

    store.setTicketBaseUrl(' https://jira.example.com/path ');

  const state = getStoreState();
    expect(state.ticketBaseUrl).toBe('https://jira.example.com/path');
    expect(state.liveAnnouncement?.message).toBe(
      'Ticket links will now use https://jira.example.com/path/ + key.',
    );

    store.setTicketBaseUrl('   ');
  const cleared = getStoreState();
    expect(cleared.ticketBaseUrl).toBeNull();
    expect(cleared.liveAnnouncement?.message).toBe('Ticket link base cleared.');
  });
});
