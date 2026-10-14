import { searchBestWin } from '@/game/solver';
import type { State } from '@/game/gameState';

// Run CPU-heavy search off the UI thread. The caller can terminate this worker
// when the puzzle changes or the search is no longer needed.
self.onmessage = (event: MessageEvent<State>) => {
  try {
    const result = searchBestWin(event.data, {
      maxDurationMs: 15_000,
      maxStates: 1_000_000,
    });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
