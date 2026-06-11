import pino from 'pino';

const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const envLevel = process.env.LOG_LEVEL;
const level = validLevels.includes(envLevel as string) ? envLevel : 'info';

export const logger = pino({
  level,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined,
});
