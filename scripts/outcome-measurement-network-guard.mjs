import { appendFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const logPath = process.env.OUTCOME_MEASUREMENT_NETWORK_GUARD_LOG;
if (!logPath) {
  throw new Error('OUTCOME_MEASUREMENT_NETWORK_GUARD_LOG is required');
}

function record(type, surface) {
  appendFileSync(logPath, `${JSON.stringify({ type, surface })}\n`, 'utf8');
}

function normalizedHost(value) {
  return String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopbackHost(host) {
  const value = normalizedHost(host);
  return value === ''
    || value === 'localhost'
    || value.endsWith('.localhost')
    || value === '::1'
    || value === '0.0.0.0'
    || value.startsWith('127.');
}

function httpHost(input) {
  if (input instanceof URL) return input.hostname;
  if (typeof input === 'string') {
    try {
      return new URL(input).hostname;
    } catch {
      return '';
    }
  }
  if (input && typeof input === 'object') return input.hostname || input.host || '';
  return '';
}

function socketHost(args) {
  const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  if (first && typeof first === 'object') {
    if (first.path) return '';
    return first.host || first.hostname || '';
  }
  if (typeof first === 'string') return '';
  return typeof values[1] === 'string' ? values[1] : '';
}

function block(surface) {
  record('blocked', surface);
  const error = new Error('External network access blocked by Slice 1 evidence guard');
  error.code = 'OUTCOME_MEASUREMENT_EXTERNAL_NETWORK_BLOCKED';
  throw error;
}

record('loaded', 'node');

if (typeof globalThis.fetch === 'function') {
  const nativeFetch = globalThis.fetch;
  let activeFetch = nativeFetch;
  const guardedFetch = function guardedFetch(input, init) {
    const host = httpHost(input);
    const syntheticIntercept = normalizedHost(host).endsWith('.test') && activeFetch !== nativeFetch;
    if (!isLoopbackHost(host) && !syntheticIntercept) block('fetch');
    return Reflect.apply(activeFetch, this, [input, init]);
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => guardedFetch,
    set: (replacement) => {
      if (typeof replacement !== 'function') block('fetch-replacement');
      activeFetch = replacement;
    },
  });
}

for (const [module, surface] of [[http, 'http'], [https, 'https']]) {
  for (const method of ['request', 'get']) {
    const original = module[method];
    module[method] = function guardedRequest(...args) {
      if (!isLoopbackHost(httpHost(args[0]))) block(surface);
      return Reflect.apply(original, this, args);
    };
  }
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  if (!isLoopbackHost(socketHost(args))) block('tcp');
  return Reflect.apply(originalSocketConnect, this, args);
};

const originalTlsConnect = tls.connect;
tls.connect = function guardedTlsConnect(...args) {
  if (!isLoopbackHost(socketHost(args))) block('tls');
  return Reflect.apply(originalTlsConnect, this, args);
};
