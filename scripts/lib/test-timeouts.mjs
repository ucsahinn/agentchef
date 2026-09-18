// Subprocess timeouts in tests and validators guard against hangs, not
// performance. Slow developer machines can stretch them uniformly with
// CODEX_CHEF_TEST_TIMEOUT_SCALE (for example 3) without changing CI defaults.
const rawScale = Number(process.env.CODEX_CHEF_TEST_TIMEOUT_SCALE || "1");
const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;

export function scaledTimeout(milliseconds) {
  return Math.round(milliseconds * scale);
}

export const timeoutScale = scale;
