import jwt, { SignOptions } from 'jsonwebtoken';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not configured in production');
    }
    return 'dev-insecure-secret';
  }
  return secret;
};

export const signToken = (payload: object, options: SignOptions = { expiresIn: '7d' }): string => {
  return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyToken = <T = any>(token: string): T => {
  return jwt.verify(token, getJwtSecret()) as T;
};
