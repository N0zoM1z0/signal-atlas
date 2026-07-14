export interface IntegerCanvasMetrics {
  height: number;
  pixelScale: number;
  width: number;
}

export function calculateIntegerCanvasMetrics(
  availableWidth: number,
  availableHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): IntegerCanvasMetrics {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    !Number.isFinite(logicalWidth) ||
    !Number.isFinite(logicalHeight) ||
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    throw new RangeError('Canvas and logical dimensions must be finite positive numbers.');
  }

  const pixelScale = Math.max(
    1,
    Math.floor(Math.min(availableWidth / logicalWidth, availableHeight / logicalHeight)),
  );
  return {
    height: logicalHeight * pixelScale,
    pixelScale,
    width: logicalWidth * pixelScale,
  };
}

export function clampZoomStep(step: number): number {
  return Math.max(-2, Math.min(3, Math.round(step)));
}

export function pixelScaleForZoom(basePixelScale: number, zoomStep: number): number {
  if (!Number.isInteger(basePixelScale) || basePixelScale < 1) {
    throw new RangeError('Base pixel scale must be a positive integer.');
  }
  return Math.max(1, basePixelScale + clampZoomStep(zoomStep) * 2);
}

export function parseCssColor(value: string): number {
  const color = value.trim();
  const hexMatch = /^#([\da-f]{6})$/i.exec(color);
  if (hexMatch?.[1]) return Number.parseInt(hexMatch[1], 16);

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
    const channels = rgbMatch.slice(1, 4).map(Number);
    if (channels.some((channel) => channel < 0 || channel > 255)) {
      throw new RangeError(`CSS color channel is outside 0–255: ${value}`);
    }
    return (channels[0] ?? 0) * 65_536 + (channels[1] ?? 0) * 256 + (channels[2] ?? 0);
  }

  throw new TypeError(`Unsupported CSS color: ${value}`);
}
