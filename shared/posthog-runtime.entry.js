import posthog from 'posthog-js';

// Product Analytics only. Session Replay and Error Tracking already run through
// Sentry (see shared/sentry-runtime.entry.js) — enabling PostHog's versions of
// those too would record every session and capture every exception twice.
async function init() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const config = await res.json();
    if (!config.posthogKey) return;

    posthog.init(config.posthogKey, {
      api_host: config.posthogHost || 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      capture_exceptions: false
    });

    window.WorldServerPostHog = posthog;
  } catch (error) {
    console.warn('PostHog init skipped:', error && error.message);
  }
}

init();
