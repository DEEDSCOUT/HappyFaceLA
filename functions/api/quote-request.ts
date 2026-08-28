// Cloudflare Pages Function - POST /api/quote-request
//
// Minimal audited production wrapper for the accepted durable quote-request
// handler. The Astro route under src/pages/api is local-dev reference only.

import { handleQuoteRequest, type QuoteRequestEnv } from '../../src/lib/quote-request/delivery.ts';

type PagesFunctionContext = {
  request: Request;
  env: QuoteRequestEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export const onRequest = async (context: PagesFunctionContext): Promise<Response> => {
  const execution = typeof context.waitUntil === 'function'
    ? {
        // Cloudflare's waitUntil is receiver-bound. Keep the provider context as
        // the call receiver instead of passing a detached method reference.
        waitUntil(promise: Promise<unknown>) {
          context.waitUntil!(promise);
        },
      }
    : undefined;
  return handleQuoteRequest(context.request, context.env, execution);
};
