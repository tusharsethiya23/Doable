// JWT helpers: create/verify access & refresh tokens and manage the refresh-token cookie.
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';

export const REFRESH_COOKIE = 'refreshToken';

// Short-lived token sent in the Authorization header on every API call
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });
}

// Long-lived token kept in an httpOnly cookie; `v` lets us revoke it by bumping user.tokenVersion
export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, v: user.tokenVersion }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_DAYS}d`,
  });
}

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

// Cookie is only sent to /api/auth routes and cannot be read by JavaScript (XSS protection)
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // 'none' allows a client on a different domain in production
  path: '/api/auth',
};

export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}
