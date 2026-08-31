import { describe, expect, it } from 'vitest';
import {
  currentExpedition,
  DIG_SITES,
  digSiteById,
  expeditionComplete,
  expeditionProgress,
  recordSession,
  weekKey,
} from '../src/content/expeditions';

describe('week keys', () => {
  it('is stable across every day of the same Mon-Sun week', () => {
    // 2026-08-17 is a Monday.
    const days = [17, 18, 19, 20, 21, 22, 23].map((d) => new Date(2026, 7, d));
    const keys = new Set(days.map((d) => weekKey(d)));
    expect(keys.size, `got ${[...keys].join(', ')}`).toBe(1);
  });

  it('rolls over on the following Monday', () => {
    expect(weekKey(new Date(2026, 7, 23))).not.toBe(weekKey(new Date(2026, 7, 24)));
  });
});

describe('expedition lifecycle', () => {
  const monday = new Date(2026, 7, 17);
  const nextMonday = new Date(2026, 7, 24);

  it('starts fresh with nothing claimed', () => {
    const e = currentExpedition(null, monday);
    expect(e.sessionsDone).toBe(0);
    expect(e.skillsAdvanced).toEqual([]);
    expect(e.claimed).toBe(false);
    expect(expeditionComplete(e)).toBe(false);
  });

  it('keeps the same expedition for the rest of the week', () => {
    const e = recordSession(currentExpedition(null, monday), ['add-20']);
    const again = currentExpedition(e, new Date(2026, 7, 20));
    expect(again.sessionsDone).toBe(1);
    expect(again.skillsAdvanced).toEqual(['add-20']);
  });

  it('replaces an unfinished expedition when the week turns over', () => {
    const stale = recordSession(currentExpedition(null, monday), ['add-20']);
    const fresh = currentExpedition(stale, nextMonday);
    // Missing a week must cost nothing and carry no debt forward — a goal
    // that accumulates guilt is worse than no goal for a seven-year-old.
    expect(fresh.weekKey).not.toBe(stale.weekKey);
    expect(fresh.sessionsDone).toBe(0);
    expect(fresh.skillsAdvanced).toEqual([]);
  });

  it('needs both goals, not just the easy one', () => {
    let e = currentExpedition(null, monday);
    // Four sessions but nothing learned: turning up alone is not enough.
    for (let i = 0; i < 4; i++) e = recordSession(e, []);
    expect(e.sessionsDone).toBe(4);
    expect(expeditionComplete(e)).toBe(false);

    e = recordSession(e, ['add-20']);
    expect(expeditionComplete(e)).toBe(true);
  });

  it('never counts the same skill twice across a week', () => {
    let e = currentExpedition(null, monday);
    e = recordSession(e, ['add-20']);
    e = recordSession(e, ['add-20']);
    e = recordSession(e, ['add-20', 'sub-20']);
    expect(e.skillsAdvanced.sort()).toEqual(['add-20', 'sub-20']);
    expect(e.sessionsDone).toBe(3);
  });

  it('reports progress between 0 and 1 and never overshoots', () => {
    let e = currentExpedition(null, monday);
    expect(expeditionProgress(e)).toBe(0);
    for (let i = 0; i < 10; i++) e = recordSession(e, ['add-20', 'sub-20', 'add-100']);
    // Well past both goals, but a bar cannot render past full.
    expect(expeditionProgress(e)).toBe(1);
  });
});

describe('dig sites', () => {
  it('resolves every declared site, and falls back rather than crashing', () => {
    for (const site of DIG_SITES) expect(digSiteById(site.id).id).toBe(site.id);
    expect(digSiteById('a-site-that-was-removed')).toBeDefined();
  });

  it('assigns a site deterministically per week', () => {
    const a = currentExpedition(null, new Date(2026, 7, 17));
    const b = currentExpedition(null, new Date(2026, 7, 19));
    expect(a.siteId).toBe(b.siteId);
  });
});
