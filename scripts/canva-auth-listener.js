import { startOAuthFlow } from '../mcp-servers/canva-mcp/dist/auth.js';

async function main() {
  console.log('Starting Canva OAuth listener on port 3000...');
  const { authUrl, waitForCompletion } = await startOAuthFlow(3000);
  console.log('\n======================================================');
  console.log('CANVA OAUTH LOGIN URL:');
  console.log(authUrl);
  console.log('======================================================\n');
  console.log('Waiting for user authorization in browser...');
  
  try {
    const tokens = await waitForCompletion();
    console.log('SUCCESS: Tokens acquired and saved to ~/.canva-tokens.json');
    console.log('Access token expires in:', tokens.expires_in, 'seconds');
    process.exit(0);
  } catch (err) {
    console.error('ERROR during Canva OAuth completion:', err);
    process.exit(1);
  }
}

main();
