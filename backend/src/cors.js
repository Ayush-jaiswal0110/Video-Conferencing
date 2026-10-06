import cors from 'cors';

export const deployedFrontend = 'https://video-conferencing-v179.onrender.com';

export function frontendOrigins(value = process.env.FRONTEND_ORIGIN) {
  if (!value?.trim()) return process.env.NODE_ENV === 'production'
    ? [deployedFrontend]
    : [deployedFrontend, 'http://localhost:3000', 'http://127.0.0.1:3000'];
  if (value.trim() === '*') return '*';
  // Browser Origin headers never contain paths or trailing slashes.
  return [...new Set(value.split(',').map(entry => {
    const address = entry.trim().replace(/^(["'])(.*)\1$/, '$2');
    try {
      const url = new URL(address);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return url.origin;
    } catch { throw new Error('FRONTEND_ORIGIN must contain comma-separated http(s) frontend URLs, for example https://video-conferencing-v179.onrender.com'); }
  }))];
}

export function corsOptions() {
  return {
    origin: frontendOrigins(),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  };
}

// Register globally before authentication and body parsing so OPTIONS needs no token.
export function frontendCors() { return cors(corsOptions()); }
