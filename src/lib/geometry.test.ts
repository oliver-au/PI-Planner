import { describe, expect, it } from 'vitest';
import { rectEquals, snapshotRect } from './geometry';

describe('geometry utilities', () => {
  it('captures DOMRect values in a snapshot', () => {
    const rect = {
      top: 1,
      left: 2,
      right: 10,
      bottom: 20,
      width: 8,
      height: 19,
    } as DOMRect;

    expect(snapshotRect(rect)).toEqual({
      top: 1,
      left: 2,
      right: 10,
      bottom: 20,
      width: 8,
      height: 19,
    });
  });

  it('compares rectangles with an epsilon tolerance', () => {
    const base = {
      top: 0,
      left: 0,
      right: 100,
      bottom: 200,
      width: 100,
      height: 200,
    };

    const withinTolerance = {
      ...base,
      bottom: 200.3,
    };

    const outsideTolerance = {
      ...base,
      width: 101,
    };

    expect(rectEquals(base, withinTolerance)).toBe(true);
    expect(rectEquals(base, outsideTolerance)).toBe(false);
  });
});
