import { describe, expect, it } from 'vitest';

import {
  calculateIntegerCanvasMetrics,
  clampZoomStep,
  parseCssColor,
  pixelScaleForZoom,
} from '../src/geometry.js';

describe('integer world geometry', () => {
  it('uses the largest whole-number scale that fits the authored 48 × 30 world', () => {
    expect(calculateIntegerCanvasMetrics(904, 658, 48, 30)).toEqual({
      height: 540,
      pixelScale: 18,
      width: 864,
    });
    expect(calculateIntegerCanvasMetrics(744, 560, 48, 30)).toEqual({
      height: 450,
      pixelScale: 15,
      width: 720,
    });
  });

  it('rejects invalid dimensions and keeps zoom on bounded integer scales', () => {
    expect(() => calculateIntegerCanvasMetrics(0, 600, 48, 30)).toThrow(RangeError);
    expect(clampZoomStep(-99)).toBe(-2);
    expect(clampZoomStep(99)).toBe(3);
    expect(pixelScaleForZoom(15, -1)).toBe(13);
    expect(pixelScaleForZoom(15, 2)).toBe(19);
  });

  it('converts computed CSS palette colors without embedding a second palette', () => {
    expect(parseCssColor('#010203')).toBe(66_051);
    expect(parseCssColor('rgb(10, 20, 30)')).toBe(660_510);
    expect(parseCssColor('rgba(100, 110, 120, 0.5)')).toBe(6_581_880);
    expect(() => parseCssColor('transparent')).toThrow(TypeError);
  });
});
