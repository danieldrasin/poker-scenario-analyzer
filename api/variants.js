export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json([
    { name: 'omaha4', display: '4-card Omaha (PLO)', cards: 4, maxPlayers: 10 },
    { name: 'omaha5', display: '5-card Omaha (PLO5)', cards: 5, maxPlayers: 9 },
    { name: 'omaha6', display: '6-card Omaha (PLO6)', cards: 6, maxPlayers: 7 },
    { name: 'holdem', display: 'Texas Hold\'em', cards: 2, maxPlayers: 10 }
  ]);
}
