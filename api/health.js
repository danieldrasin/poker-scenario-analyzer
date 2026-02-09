export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    deployment: 'vercel'
  });
}
