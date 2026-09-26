// ============================================================================
// Per-frame world updates (life, clock, lights)
// ============================================================================
function updateWorld(dt, t) {
  updateClock();
  if (typeof updateInteriors === 'function') updateInteriors(dt);
  if (typeof updateFields === 'function') updateFields(dt);
  if (typeof updateLife === 'function') updateLife(dt, t);
}
