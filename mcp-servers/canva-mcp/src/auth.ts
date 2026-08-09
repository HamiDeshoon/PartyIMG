import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import http from 'http';
import axios from 'axios';
import dotenv from 'dotenv';
import os from 'os';

// Load global ~/.env first, then local .env if present
const homeDir = os.homedir();
const globalEnvPath = path.join(homeDir, '.env');

if (fs.existsSync(globalEnvPath)) {
  dotenv.config({ path: globalEnvPath });
}
dotenv.config(); // Fallback to current working directory .env

const TOKEN_FILE_PATH = path.join(homeDir, '.canva-tokens.json');

export interface CanvaTokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number; // timestamp in ms
  token_type?: string;
  scope?: string;
}

export function getCanvaCredentials() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = process.env.CANVA_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('CANVA_CLIENT_ID and CANVA_CLIENT_SECRET must be set in environment variables or ~/.env file.');
  }

  return { clientId, clientSecret, redirectUri };
}

// Generates base64url string without padding
function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate PKCE code verifier and challenge
export function generatePKCE() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Load saved tokens from global home directory file
export function loadSavedTokens(): CanvaTokenData | null {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const raw = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8');
      return JSON.parse(raw) as CanvaTokenData;
    }
  } catch (err) {
    console.error('Failed to read Canva token file:', err);
  }
  return null;
}

// Save tokens to global home directory file
export function saveTokens(tokenData: CanvaTokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokenData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save Canva tokens:', err);
  }
}

// Exchange auth code for tokens
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CanvaTokenData> {
  const { clientId, clientSecret, redirectUri } = getCanvaCredentials();
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code_verifier', codeVerifier);
  params.append('code', code);
  params.append('redirect_uri', redirectUri);

  const response = await axios.post('https://api.canva.com/rest/v1/oauth/token', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`
    }
  });

  const tokenData: CanvaTokenData = {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    expires_in: response.data.expires_in,
    obtained_at: Date.now(),
    token_type: response.data.token_type,
    scope: response.data.scope
  };

  saveTokens(tokenData);
  return tokenData;
}

// Refresh access token using refresh_token
export async function refreshAccessToken(refreshToken: string): Promise<CanvaTokenData> {
  const { clientId, clientSecret } = getCanvaCredentials();
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const response = await axios.post('https://api.canva.com/rest/v1/oauth/token', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`
    }
  });

  const tokenData: CanvaTokenData = {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token || refreshToken,
    expires_in: response.data.expires_in,
    obtained_at: Date.now(),
    token_type: response.data.token_type,
    scope: response.data.scope
  };

  saveTokens(tokenData);
  return tokenData;
}

// Get valid access token, auto-refreshing if expired
export async function getValidAccessToken(): Promise<string> {
  const tokens = loadSavedTokens();
  if (!tokens) {
    throw new Error('No Canva access token found. Please run the canva_auth_login tool to authenticate.');
  }

  // Check if token is expired (or about to expire in 5 minutes)
  const isExpired = Date.now() >= (tokens.obtained_at + (tokens.expires_in - 300) * 1000);
  if (isExpired && tokens.refresh_token) {
    console.error('Canva access token expired. Refreshing token...');
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    return newTokens.access_token;
  }

  return tokens.access_token;
}

// Start OAuth PKCE login server
export async function startOAuthFlow(port = 3000): Promise<{ authUrl: string; waitForCompletion: () => Promise<CanvaTokenData> }> {
  const { clientId, redirectUri } = getCanvaCredentials();
  const { verifier, challenge } = generatePKCE();
  const state = base64UrlEncode(crypto.randomBytes(16));

  const scopes = [
    'asset:read',
    'asset:write',
    'design:meta:read',
    'design:content:read',
    'design:content:write',
    'folder:read',
    'folder:write',
    'profile:read',
    'brandtemplate:meta:read',
    'brandtemplate:content:read',
    'comment:read',
    'comment:write'
  ].join(' ');

  const authUrl = `https://www.canva.com/api/oauth/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: state
  }).toString();

  let server: http.Server;

  const waitForCompletion = (): Promise<CanvaTokenData> => {
    return new Promise((resolve, reject) => {
      server = http.createServer(async (req, res) => {
        try {
          if (!req.url) return;
          const reqUrl = new URL(req.url, `http://localhost:${port}`);
          if (reqUrl.pathname === '/oauth/callback' || reqUrl.pathname === '/callback') {
            const code = reqUrl.searchParams.get('code');
            const recState = reqUrl.searchParams.get('state');
            const error = reqUrl.searchParams.get('error');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`<h2>Authentication Failed</h2><p>${error}</p>`);
              server.close();
              return reject(new Error(`Canva OAuth Error: ${error}`));
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h2>Authentication Waiting</h2><p>Missing authorization code in request.</p>');
              return;
            }

            if (recState !== state) {
              console.warn(`[OAuth Warning] State mismatch: received ${recState}, expected ${state}`);
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h2>Authentication Failed</h2><p>State mismatch. Please use the latest login link generated by Antigravity.</p>');
              return;
            }

            // Exchange code
            const tokens = await exchangeCodeForTokens(code, verifier);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h2>Authentication Successful!</h2><p>You may close this browser window and return to Antigravity.</p>');
            server.close();
            resolve(tokens);
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h2>Authentication Exception</h2><p>${err.message}</p>`);
          if (server) server.close();
          reject(err);
        }
      });

      server.listen(port, () => {
        console.error(`OAuth callback server listening on http://localhost:${port}/oauth/callback`);
      });
    });
  };

  return { authUrl, waitForCompletion };
}
