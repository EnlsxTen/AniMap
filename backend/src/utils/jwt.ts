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

// payload 中应包含 userId、role、tokenVersion（用于密码变更/账号封禁时吊销旧 token）
export const signToken = (payload: object, options: SignOptions = { expiresIn: '7d' }): string => {
  return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyToken = <T = any>(token: string): T => {
  return jwt.verify(token, getJwtSecret()) as T;
};
