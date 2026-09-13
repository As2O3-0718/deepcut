// Run with: node --env-file=.env.local scripts/check-deepseek.js
// This read-only model-list check does not request a text completion.
const key = process.env.DEEPSEEK_API_KEY;
if (!key) { console.error('Missing DEEPSEEK_API_KEY. Run the setup script first.'); process.exit(1); }
try {
  const response = await fetch('https://api.deepseek.com/models', {
    headers: {Authorization: `Bearer ${key}`},
    signal: AbortSignal.timeout(20000),
    redirect: 'error'
  });
  if (!response.ok) {
    console.error(`DeepSeek returned HTTP ${response.status}. Check the key and account status.`);
    process.exitCode = 1;
  } else {
    const data = await response.json();
    const available = Array.isArray(data.data) && data.data.some(m => m.id === (process.env.DEEPSEEK_MODEL || 'deepseek-flash'));
    console.log(available ? 'Connection succeeded; configured model is available.' : 'Connection succeeded; configured model was not found in the model list.');
    if (!available) process.exitCode = 1;
  }
} catch {
  console.error('Connection failed or timed out. No credentials or response bodies were logged.');
  process.exitCode = 1;
}
