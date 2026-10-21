import { Request, Response, NextFunction, RequestHandler } from 'express';

// Type req.params explicitly as Record<string, string> so route handlers get plain
// string params regardless of which @types/express-serve-static-core version is installed.
type AsyncFn = (req: Request<Record<string, string>>, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncFn): RequestHandler {
  return (req, res, next) =>
    fn(req as Request<Record<string, string>>, res, next).catch(next);
}
