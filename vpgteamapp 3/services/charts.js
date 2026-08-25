// Tiny server-side SVG bar-chart builder - no client-side charting library,
// just precomputed path/geometry data that the view renders straight into
// inline SVG. Bars use rounded "data ends" (the end away from zero) and a
// square edge at the baseline (zero), per the house chart style: thin marks,
// single hue, minimal chrome.

function roundedTopBarPath(x, y, w, h, r) {
  // Vertical bar growing UP from a baseline - rounded top, square bottom.
  if (h <= 0) return `M ${x} ${y} L ${x + w} ${y}`;
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
}

function roundedRightBarPath(x, y, w, h, r) {
  // Horizontal bar growing RIGHT from a baseline - rounded right end, square left.
  if (w <= 0) return `M ${x} ${y} L ${x} ${y + h}`;
  r = Math.max(0, Math.min(r, w, h / 2));
  return `M ${x} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x} ${y + h} Z`;
}

// items: [{ label, value, valueLabel? }]
function buildBarChart(items, opts) {
  const {
    width = 600,
    height = 200,
    bottomPadding = 26,
    topPadding = 20,
    barRadius = 4,
    gapRatio = 0.45,
  } = opts || {};

  const maxValue = Math.max(0, ...items.map((i) => i.value));
  const baselineY = height - bottomPadding;
  const usableHeight = baselineY - topPadding;
  const slot = items.length > 0 ? width / items.length : width;

  const bars = items.map((item, i) => {
    const barWidth = slot * (1 - gapRatio);
    const h = maxValue > 0 ? (item.value / maxValue) * usableHeight : 0;
    const x = i * slot + (slot - barWidth) / 2;
    const y = baselineY - h;
    const r = Math.max(0, Math.min(barRadius, barWidth / 2, h));
    return {
      path: roundedTopBarPath(x, y, barWidth, h, r),
      centerX: x + barWidth / 2,
      y,
      height: h,
      value: item.value,
      label: item.label,
      valueLabel: item.valueLabel !== undefined ? item.valueLabel : String(item.value),
    };
  });

  return { bars, width, height, baselineY, maxValue };
}

// items: [{ label, value, valueLabel? }]
function buildHBarChart(items, opts) {
  const {
    width = 600,
    rowHeight = 34,
    leftPadding = 150,
    rightPadding = 44,
    barRadius = 4,
    gapRatio = 0.35,
  } = opts || {};

  const maxValue = Math.max(0, ...items.map((i) => i.value));
  const plotWidth = width - leftPadding - rightPadding;
  const height = items.length * rowHeight;

  const bars = items.map((item, i) => {
    const rowY = i * rowHeight;
    const barH = rowHeight * (1 - gapRatio);
    const y = rowY + (rowHeight - barH) / 2;
    const w = maxValue > 0 ? (item.value / maxValue) * plotWidth : 0;
    const r = Math.max(0, Math.min(barRadius, barH / 2, w));
    return {
      path: roundedRightBarPath(leftPadding, y, w, barH, r),
      labelX: leftPadding - 10,
      valueX: leftPadding + w + 8,
      rowCenterY: rowY + rowHeight / 2,
      width: w,
      value: item.value,
      label: item.label,
      valueLabel: item.valueLabel !== undefined ? item.valueLabel : String(item.value),
    };
  });

  return { bars, width, height, leftPadding, maxValue };
}

module.exports = { buildBarChart, buildHBarChart };
