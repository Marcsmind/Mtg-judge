/**
 * Miniature damage-grid layouts that mirror the actual player card positions
 * for each player count + mode combination.
 *
 * Canonical perspective: P[0] at bottom (or bottom-left), matching how the
 * game renders. Each PlayerCard renders the same grid; the card's own CSS
 * rotation makes it readable from that player's direction.
 */

export type GridCell = {
  playerIdx: number;    // 0-based index into players array
  rowStart: number;     // CSS grid-row-start (1-indexed)
  rowEnd: number;       // CSS grid-row-end (exclusive)
  colStart: number;     // CSS grid-column-start (1-indexed)
  colEnd: number;       // CSS grid-column-end (exclusive)
};

export type GridLayout = {
  rows: number;
  cols: number;
  cells: GridCell[];
};

export function getLayoutGrid(
  playerCount: number,
  layoutMode: 'table' | 'scorekeeper',
): GridLayout {
  if (playerCount === 2) {
    return { rows: 2, cols: 1, cells: [
      { playerIdx: 0, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
      { playerIdx: 1, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
    ]};
  }

  if (playerCount === 3) {
    if (layoutMode === 'table') {
      // [P[1](90°) | P[2](270°)] + hub + P[0](0°)
      return { rows: 2, cols: 2, cells: [
        { playerIdx: 1, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
        { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 },
        { playerIdx: 0, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 3 },
      ]};
    }
    // scorekeeper: P[1](180°) + hub + [P[0](90°) | P[2](270°)]
    return { rows: 2, cols: 2, cells: [
      { playerIdx: 1, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 3 },
      { playerIdx: 0, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
      { playerIdx: 2, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
    ]};
  }

  if (playerCount === 4) {
    if (layoutMode === 'table') {
      // [P[1] | P[2]] + hub + [P[0] | P[3]]
      return { rows: 2, cols: 2, cells: [
        { playerIdx: 1, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
        { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 },
        { playerIdx: 0, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
        { playerIdx: 3, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
      ]};
    }
    // scorekeeper: P[2](180°) + [P[1] | P[3]] + hub + P[0](0°)
    return { rows: 3, cols: 2, cells: [
      { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 3 },
      { playerIdx: 1, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
      { playerIdx: 3, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
      { playerIdx: 0, rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 3 },
    ]};
  }

  if (playerCount === 5) {
    if (layoutMode === 'table') {
      // [P[2]|P[3]] + [P[1]|P[4]] + hub + P[0]
      return { rows: 3, cols: 2, cells: [
        { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
        { playerIdx: 3, rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 },
        { playerIdx: 1, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
        { playerIdx: 4, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
        { playerIdx: 0, rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 3 },
      ]};
    }
    // scorekeeper: P[2](180°) + hub + [P[1]|P[3]] + [P[0]|P[4]]
    return { rows: 3, cols: 2, cells: [
      { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 3 },
      { playerIdx: 1, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
      { playerIdx: 3, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
      { playerIdx: 0, rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 2 },
      { playerIdx: 4, rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3 },
    ]};
  }

  // 6P
  if (layoutMode === 'table') {
    // [P[2]|P[3]] + [P[1]|P[4]] + hub + [P[0]|P[5]]
    return { rows: 3, cols: 2, cells: [
      { playerIdx: 2, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
      { playerIdx: 3, rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 },
      { playerIdx: 1, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
      { playerIdx: 4, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
      { playerIdx: 0, rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 2 },
      { playerIdx: 5, rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3 },
    ]};
  }
  // 6P scorekeeper: P[3](180°) + [P[2]|P[4]] + [P[1]|P[5]] + hub + P[0]
  return { rows: 4, cols: 2, cells: [
    { playerIdx: 3, rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 3 },
    { playerIdx: 2, rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
    { playerIdx: 4, rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
    { playerIdx: 1, rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 2 },
    { playerIdx: 5, rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3 },
    { playerIdx: 0, rowStart: 4, rowEnd: 5, colStart: 1, colEnd: 3 },
  ]};
}
