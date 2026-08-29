#!/usr/bin/env node

let blocked = false;
try {
  await fetch('https://external-network-probe.invalid/');
} catch (error) {
  blocked = error?.code === 'OUTCOME_MEASUREMENT_EXTERNAL_NETWORK_BLOCKED';
}

if (!blocked) {
  throw new Error('Slice 1 external-network guard did not block the probe');
}

process.stdout.write(`${JSON.stringify({ ok: true, external_probe_blocked_before_network: true })}\n`);
