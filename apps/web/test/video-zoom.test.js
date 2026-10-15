import test from 'node:test';
import assert from 'node:assert/strict';
import { fitVideo, constrainView, zoomAt, initialView } from '../src/features/room/utils/video-zoom.ts';

test('zoom steps, limits, reset and cursor anchor', () => {
  const g = fitVideo(800, 450, 1920, 1080);
  assert.deepEqual(initialView, { scale: 1, x: 0, y: 0 });
  let v = zoomAt(initialView, .25, g, 100, 50);
  assert.deepEqual(v, { scale: 1.25, x: -25, y: -12.5 });
  assert.equal((100 - v.x) / v.scale, 100);
  v = zoomAt(v, -.25, g, 100, 50);
  assert.deepEqual(v, initialView);
  assert.equal(zoomAt(v, -1, g).scale, 1);
  for (let i = 0; i < 20; i++) v = zoomAt(v, .25, g);
  assert.equal(v.scale, 3);
});

test('contain geometry bounds across aspect ratios and resize', () => {
  for (const [w, h] of [[1920,1080], [1024,768], [3440,1440], [1080,1920]]) {
    const g = fitVideo(800, 600, w, h);
    assert.ok(g.fittedWidth <= 800 && g.fittedHeight <= 600);
    const v = constrainView({ scale: 2, x: 10000, y: -10000 }, g);
    assert.equal(v.x, Math.max(0, (g.fittedWidth * 2 - 800) / 2));
    assert.equal(Math.abs(v.y), Math.max(0, (g.fittedHeight * 2 - 600) / 2));
    assert.deepEqual(constrainView({ ...v, scale: 1 }, g), initialView);
    const resized = fitVideo(400, 900, w, h);
    const next = constrainView(v, resized);
    assert.ok(Math.abs(next.x) <= Math.max(0, (resized.fittedWidth * 2 - 400) / 2));
  }
  assert.equal(fitVideo(800, 600, 0, 0).fittedWidth, 0);
});
