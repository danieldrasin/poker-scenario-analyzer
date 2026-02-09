const {
  Card,
  analyzeFlopTexture,
  describeFlopTexture,
  getFlopAdvice,
  parseHandQuery,
  matchesQuery,
  describeQuery,
  QUERY_PRESETS
} = require('./packages/core/dist');

console.log('=== FLOP TEXTURE CLASSIFIER TEST ===\n');

// Test various flop textures
const testFlops = [
  ['Ks', '7d', '2c'],  // Dry rainbow
  ['8s', '9s', 'Ts'],  // Monotone connected
  ['Jh', 'Qh', 'Kh'],  // Monotone high
  ['7s', '8d', '9c'],  // Rainbow connected
  ['Ks', 'Kd', '7c'],  // Paired dry
  ['8s', '8d', '9c'],  // Paired wet
  ['2c', '7d', 'Js'],  // Scattered rainbow
  ['7s', '8s', '9d'],  // Two-tone connected
];

testFlops.forEach(flopStrs => {
  const flop = flopStrs.map(s => Card.parse(s));
  const analysis = analyzeFlopTexture(flop);

  console.log(`Flop: ${flopStrs.join(' ')}`);
  console.log(`  Category: ${analysis.category}`);
  console.log(`  Nut Danger: ${analysis.nutDangerLevel}`);
  console.log(`  Description: ${describeFlopTexture(analysis)}`);
  console.log('');
});

console.log('\n=== HAND QUERY SYSTEM TEST ===\n');

// Test query parsing
const testQueries = [
  'pair:AA:ds',
  'pair:TT+:ds',
  'pair:88-QQ',
  'run:J+:ds',
  'dpair:any',
  'bway:ds'
];

testQueries.forEach(queryStr => {
  const query = parseHandQuery(queryStr);
  console.log(`Query: "${queryStr}"`);
  console.log(`  Parsed: ${JSON.stringify(query)}`);
  console.log(`  Description: ${describeQuery(query)}`);
  console.log('');
});

console.log('\n=== HAND MATCHING TEST ===\n');

// Create some test hands and check if they match queries
const testHands = [
  ['As', 'Ah', 'Ks', 'Qh'],  // AA with broadway, double-suited
  ['As', 'Ah', '7c', '2d'],  // AA rainbow junk
  ['Ts', 'Th', '9s', '8h'],  // TT connected double-suited
  ['Jh', 'Td', '9c', '8s'],  // Rundown rainbow
  ['Js', 'Ts', '9h', '8h'],  // Rundown double-suited
  ['Ks', 'Kh', 'Qs', 'Qh'],  // Double-paired ds
];

const testMatchQueries = [
  'pair:AA:ds',
  'pair:TT+:ds',
  'pair:TT+:ds:conn',
  'run:any:ds',
  'dpair:any'
];

console.log('Testing hands against queries:\n');
testHands.forEach(handStrs => {
  const hand = handStrs.map(s => Card.parse(s));
  console.log(`Hand: ${handStrs.join(' ')}`);

  testMatchQueries.forEach(queryStr => {
    const query = parseHandQuery(queryStr);
    const matches = matchesQuery(hand, query);
    console.log(`  ${queryStr}: ${matches ? '✓ MATCH' : '✗'}`);
  });
  console.log('');
});

console.log('\n=== PRESETS ===\n');
Object.entries(QUERY_PRESETS).forEach(([name, preset]) => {
  console.log(`${name}: "${preset.query}" - ${preset.description}`);
});
