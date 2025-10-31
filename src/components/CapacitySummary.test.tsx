import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { CapacitySummary } from './CapacitySummary';
import { UNASSIGNED_DEVELOPER_ID } from '../constants';
import { getStoreState, resetPiStore } from '../test/storeTestUtils';

describe('CapacitySummary', () => {
  beforeEach(() => {
    resetPiStore();
  });

  it('lists developers with assigned capacity data', () => {
    render(<CapacitySummary />);

    expect(
      screen.getByRole('heading', { name: /team capacity by sprint/i }),
    ).toBeInTheDocument();

    const developer = getStoreState().developers.find(
      (dev) => dev.id !== UNASSIGNED_DEVELOPER_ID,
    );
    expect(developer).toBeDefined();
    if (!developer) return;

    const row = screen.getByRole('row', { name: new RegExp(developer.name, 'i') });
    expect(row).toBeInTheDocument();
    expect(row.textContent).toMatch(/\d+ \/ \d+/);
  });

  it('toggles visibility when the header button is pressed', async () => {
    const user = userEvent.setup();
    render(<CapacitySummary />);

    const toggle = screen.getByRole('button', {
      name: /team capacity by sprint/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const scrollContainer = screen.getByRole('table').parentElement;
    expect(scrollContainer?.hasAttribute('hidden')).toBe(false);

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(scrollContainer?.hasAttribute('hidden')).toBe(true);
  });
});
