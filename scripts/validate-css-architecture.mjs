import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const index = readFileSync('index.html', 'utf8');
const activeCss = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((match) => match[1].split('?')[0])
  .filter((path) => path.endsWith('.css'));

assert.ok(activeCss.length > 0, 'no active CSS found in index.html');
assert.ok(!activeCss.includes('assets/v8-tighter-rows.css'), 'obsolete v8 tighter-row layer is still loaded');
assert.equal(existsSync('assets/v8-tighter-rows.css'), false, 'obsolete v8 tighter-row file still exists');

const cssByPath = new Map(activeCss.map((path) => [path, readFileSync(path, 'utf8')]));
const allCss = [...cssByPath.values()].join('\n');

for (const deadSelector of [
  '.macro-density-strip',
  '.ux-macro-indicator',
  '.project-ribbon-activity',
  '.project-ribbon-milestones',
]) {
  assert.equal(allCss.includes(deadSelector), false, `dead selector returned: ${deadSelector}`);
}

const v6 = cssByPath.get('assets/v6-workspace-ux.css') || '';
const v7 = cssByPath.get('assets/v7-overview-density.css') || '';
const v9 = cssByPath.get('assets/v9-macro-overview.css') || '';
const v11 = cssByPath.get('assets/v11-project-surface.css') || '';
const v12 = cssByPath.get('assets/v12-time-compass.css') || '';
const v13 = cssByPath.get('assets/v13-sage-polish.css') || '';

assert.ok(v7.includes('#ux-row-density-dock'), 'row density styling must be owned by v7');
assert.equal(v12.includes('#ux-row-density-dock'), false, 'Time Compass must not own row density styling');
assert.ok(v9.includes('.macro-label-panel'), 'Macro geometry must be owned by v9');
assert.equal(v11.includes('.macro-label-panel'), false, 'Project Surface must not override Macro geometry');
assert.equal(v6.includes('.ux-present-bar'), false, 'workspace layer must not own Present HUD geometry');
assert.ok(v13.includes('.ux-present-bar'), 'Present HUD geometry must be owned by the polish layer');
assert.ok(v12.includes('.time-compass-meta'), 'Time Compass visuals must be owned by v12');
assert.ok(v13.includes('[hidden] { display: none !important; }'), 'global hidden-state contract is missing');

const report = {
  activeFiles: activeCss.length,
  cssBytes: activeCss.reduce((sum, path) => sum + Buffer.byteLength(cssByPath.get(path) || '', 'utf8'), 0),
  cssLines: activeCss.reduce((sum, path) => sum + (cssByPath.get(path) || '').split('\n').length, 0),
  importantCount: (allCss.match(/!important/g) || []).length,
  mediaQueryCount: (allCss.match(/@media/g) || []).length,
};

console.log(`CSS architecture OK ${JSON.stringify(report)}`);
