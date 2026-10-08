export const DEMO_LINES = [
  'There is a quiet kind of magic',
  'in the pages of a book.',
  'A few simple words can open',
  'a door to somewhere new.',
  'Slow down. Take a breath.',
  'Let the story come to you.',
];
export function drawDemo(canvas: HTMLCanvasElement) {
  canvas.width = 1200; canvas.height = 760;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#faf7ef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2e2b26'; ctx.font = '42px Georgia';
  DEMO_LINES.forEach((line, i) => ctx.fillText(line, 110, 155 + i * 87));
}
