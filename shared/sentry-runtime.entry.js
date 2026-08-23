import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://002daf8ea24e505d001cb42049448994@o4511958092218368.ingest.de.sentry.io/4511958110699600",

  sendDefaultPii: false,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],

  tracesSampleRate: 0.2,

  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.vercel\.app\//
  ],

  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  beforeSend(event) {
    event.tags = {
      ...(event.tags || {}),
      runtime: "world-server-production"
    };
    return event;
  }
});

window.WorldServerSentry = Sentry;
