import type { Request, RequestHandler, Response } from 'express';

export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve().then(() => handler(req, res)).catch(next);
  };
}
