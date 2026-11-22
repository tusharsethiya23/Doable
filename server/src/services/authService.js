// Auth business logic: register, log in, refresh sessions and issue tokens.
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, setRefreshCookie, verifyRefreshToken } from '../utils/tokens.js';

export async function registerUser({ name, email, password, timezone }) {
  if (await User.exists({ email })) throw new ApiError(409, 'Email is already registered');

  const user = new User({ name, email, ...(timezone && { timezone }) });
  await user.setPassword(password);
  await user.save();
  return user;
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
  // Same message for "no user" and "wrong password" so attackers can't discover emails
  if (!user?.passwordHash || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return user;
}

// Checks the refresh-token cookie and returns its user if the session is still valid
export async function refreshSession(token) {
  if (!token) throw new ApiError(401, 'No session');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Session expired, please log in again');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.v) throw new ApiError(401, 'Session expired, please log in again');
  return user;
}

// Sets a fresh refresh cookie and returns a new access token
export function issueTokens(res, user) {
  setRefreshCookie(res, signRefreshToken(user));
  return signAccessToken(user);
}
