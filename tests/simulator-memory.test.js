import { describe, expect, it } from 'vitest';
import { runMemoryVerification } from '../simulator/server/simulate.mjs';

describe('simulator memory job', () => {
  it('rejects an unknown device before touching the toolchain', async () => {
    const result = await runMemoryVerification({ device: 'eeprom', tools: null });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('BAD_REQUEST');
    expect(result.detail).toMatch(/Unknown memory device/);
  });

  it('reports unavailable tools instead of fabricating a result', async () => {
    const result = await runMemoryVerification({
      device: 'sdram',
      tools: { byId: { iverilog: { available: false }, vvp: { available: false } } },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.log).toBe('');
  });
});
