export type RectSnapshot = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const epsilon = 0.5;

export const snapshotRect = (rect: DOMRect): RectSnapshot => ({
  top: rect.top,
  left: rect.left,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

export const rectEquals = (a: RectSnapshot, b: RectSnapshot): boolean =>
  Math.abs(a.top - b.top) < epsilon &&
  Math.abs(a.left - b.left) < epsilon &&
  Math.abs(a.right - b.right) < epsilon &&
  Math.abs(a.bottom - b.bottom) < epsilon &&
  Math.abs(a.width - b.width) < epsilon &&
  Math.abs(a.height - b.height) < epsilon;
