/**
 * Generate all k-combinations of an array
 * Uses iterative algorithm for efficiency
 */
export function combinations<T>(arr: T[], k: number): T[][] {
  if (k > arr.length || k <= 0) {
    return [];
  }
  if (k === arr.length) {
    return [[...arr]];
  }
  if (k === 1) {
    return arr.map(item => [item]);
  }

  const result: T[][] = [];
  const indices = Array.from({ length: k }, (_, i) => i);
  const n = arr.length;

  while (true) {
    // Generate current combination
    result.push(indices.map(i => arr[i]));

    // Find rightmost index that can be incremented
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) {
      i--;
    }

    // All combinations generated
    if (i < 0) break;

    // Increment and reset indices to the right
    indices[i]++;
    for (let j = i + 1; j < k; j++) {
      indices[j] = indices[j - 1] + 1;
    }
  }

  return result;
}

/**
 * Count combinations without generating them (n choose k)
 */
export function countCombinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;

  // Use symmetry to minimize iterations
  if (k > n - k) {
    k = n - k;
  }

  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}
