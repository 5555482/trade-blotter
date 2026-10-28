import { Router } from 'express';
import { signToken } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    const validUser = process.env.ADMIN_USERNAME ?? 'admin';
    const validPass = process.env.ADMIN_PASSWORD ?? 'password';

    if (!username || !password || username !== validUser || password !== validPass) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.json({ token: signToken(username) });
  }));

  return router;
}
