import { computeParentHash } from './hash.js';

export interface MerkleProofStep {
  position: 'left' | 'right';
  hash: string;
}

export interface MerkleTreeResult {
  merkleRoot: string;
  leaves: string[];
  proofs: MerkleProofStep[][];
}

/**
 * Builds a deterministic Merkle tree from an array of 64-char hex leaf hashes.
 *
 * Rules:
 * - 1 leaf [A]: merkleRoot = A, proof for index 0 = []
 * - Odd number of nodes > 1 at any level: last node is duplicated ([A, B, C] -> [A, B, C, C])
 */
export function buildMerkleTree(leafHashes: string[]): MerkleTreeResult {
  if (leafHashes.length === 0) {
    throw new Error('Cannot build a Merkle tree with zero leaves.');
  }

  const leaves = leafHashes.map((h) => h.toLowerCase());
  if (leaves.length === 1) {
    return {
      merkleRoot: leaves[0],
      leaves,
      proofs: [[]],
    };
  }

  // Track tree levels from bottom (level 0 = leaves) to top (root)
  const levels: string[][] = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const paddedLevel =
      currentLevel.length % 2 === 1
        ? [...currentLevel, currentLevel[currentLevel.length - 1]]
        : currentLevel;

    const nextLevel: string[] = [];
    for (let i = 0; i < paddedLevel.length; i += 2) {
      nextLevel.push(computeParentHash(paddedLevel[i], paddedLevel[i + 1]));
    }
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  const merkleRoot = currentLevel[0];

  // Build inclusion proof for each leaf index
  const proofs: MerkleProofStep[][] = leaves.map((_, leafIndex) => {
    const proof: MerkleProofStep[] = [];
    let idx = leafIndex;

    for (let levelIdx = 0; levelIdx < levels.length - 1; levelIdx++) {
      const level = levels[levelIdx];
      const paddedLevel =
        level.length % 2 === 1 ? [...level, level[level.length - 1]] : level;

      const isRightNode = idx % 2 === 1;
      const siblingIdx = isRightNode ? idx - 1 : idx + 1;

      proof.push({
        position: isRightNode ? 'left' : 'right',
        hash: paddedLevel[siblingIdx],
      });

      idx = Math.floor(idx / 2);
    }

    return proof;
  });

  return {
    merkleRoot,
    leaves,
    proofs,
  };
}

/**
 * Recomputes the Merkle root from a single leaf hash and its inclusion proof,
 * and checks whether it matches the expected Merkle root.
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: MerkleProofStep[],
  expectedMerkleRoot: string
): boolean {
  if (!leafHash || !expectedMerkleRoot || !Array.isArray(proof)) {
    return false;
  }

  let current = leafHash.toLowerCase();
  for (const step of proof) {
    if (!step || typeof step.hash !== 'string' || step.hash.length !== 64) {
      return false;
    }
    if (step.position === 'right') {
      current = computeParentHash(current, step.hash);
    } else if (step.position === 'left') {
      current = computeParentHash(step.hash, current);
    } else {
      return false;
    }
  }

  return current === expectedMerkleRoot.toLowerCase();
}
