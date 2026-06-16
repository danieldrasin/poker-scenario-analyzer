import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const htmlPath = resolve(import.meta.dirname, '../../packages/web/src/public/index.html');
const jsPath = resolve(import.meta.dirname, '../../packages/web/src/public/app.js');

const html = readFileSync(htmlPath, 'utf-8');
const js = readFileSync(jsPath, 'utf-8');

// Strip the <script src="app.js"> tag — we'll eval the JS ourselves
const htmlNoScript = html.replace(/<script src="app\.js"><\/script>/, '');

const dom = new JSDOM(htmlNoScript, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  storageQuota: 10000000,
});

// Names to export from the script's scope to window
const constExports = [
  'SUIT', 'FACE_SUIT', 'RANKS', 'ORDER', 'rv', 'VARIANTS',
  'HB_STRUCTURES', 'HB_SUITED', 'HB_SIDES', 'HB_FAST_PRESETS',
  'HAND_CATS', 'FINAL_FREQ', 'PRESETS', 'state',
  'C', 'SESSIONS', 'SEED_HANDS',
];
const fnExports = [
  'evaluate', 'advise', 'reasonText', 'parseNotation',
  'combinations', 'evaluate5Card', 'evaluateOmaha', 'isNutHand',
  'boardDanger', 'calcPotOdds', 'hbQueryBadge', 'hbGenerateHands',
  'holeCount', 'fieldProb', 'outcome', 'rowData',
  'newHand', 'saveCurrentHand', 'placeCard', 'switchTab', 'persist',
  'renderPlay', 'buildConversation',
];

const allExports = [...constExports, ...fnExports];
const exportPatch = allExports.map(name =>
  `try { window.${name} = ${name}; } catch(e) {}`
).join('\n');

// Execute the script in JSDOM's window context via eval
dom.window.eval(js + '\n' + exportPatch);

// Copy JSDOM's window properties onto vitest's global window/globalThis
for (const name of allExports) {
  if (dom.window[name] !== undefined) {
    globalThis[name] = dom.window[name];
  }
}
