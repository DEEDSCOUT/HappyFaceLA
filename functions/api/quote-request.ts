// Cloudflare Pages Function - POST /api/quote-request
//
// Minimal audited production wrapper for the accepted durable quote-request
// handler. The Astro route under src/pages/api is local-dev reference only.

import { handleQuoteRequest, type QuoteRequestEnv } from '../../src/lib/quote-request/delivery.ts';

type PagesFunctionContext = {
  request: Request;
  env: QuoteRequestEnv;
};

export const onRequest = async ({ request, env }: PagesFunctionContext): Promise<Response> => {
  return handleQuoteRequest(request, env);
};
