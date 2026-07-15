import { describe, expect, it } from 'vitest';

import config, { browserSecurityHeaders } from '../vite.config.js';

describe('local web response security', () => {
  it('denies framing in both development and preview serving modes', () => {
    expect(browserSecurityHeaders).toEqual({
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    });
    expect(config).toMatchObject({
      server: { headers: browserSecurityHeaders },
      preview: { headers: browserSecurityHeaders },
    });
  });
});
