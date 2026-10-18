import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { asyncRoute } from '../lib/middleware/asyncRoute.js';

test('forwards asynchronous database failures to Express error middleware', async () => {
  const failure = Object.assign(new Error('Service unavailable.'), { code: 503 });
  const forwarded = await new Promise<unknown>((resolve) => {
    asyncRoute(async () => {
      throw failure;
    })({} as Request, {} as Response, ((error: unknown) => resolve(error)) as NextFunction);
  });

  assert.equal(forwarded, failure);
});

test('forwards unexpected asynchronous failures instead of swallowing them', async () => {
  const failure = new Error('Unexpected failure.');
  const forwarded = await new Promise<unknown>((resolve) => {
    asyncRoute(async () => {
      throw failure;
    })({} as Request, {} as Response, ((error: unknown) => resolve(error)) as NextFunction);
  });

  assert.equal(forwarded, failure);
});
