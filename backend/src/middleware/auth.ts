import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  try {
    jwt.verify(header.slice(7), secret());
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

export function signToken(username: string): string {
  return jwt.sign({ sub: username }, secret(), { expiresIn: '8h' });
}
