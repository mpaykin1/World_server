import * as Sentry from "@sentry/browser";

const isNetlifyDeployPreview = /^deploy-preview-\d+--world-server\.netlify\.app$/i.test(window.location.hostname);
const integrations = [Sentry.browserTracingIntegration()];
if (!isNetlifyDeployPreview) integrations.push(Sentry.replayIntegration());

Sentry.init({
  dsn: "https://002daf8ea24e505d001cb42049448994@o4511958092218368.ingest.de.sentry.io/4511958110699600",

  sendDefaultPii: false,

  integrations,

  tracesSampleRate: 0.2,

  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.vercel\.app\//
  ],

  replaysSessionSampleRate: isNetlifyDeployPreview ? 0 : 0.05,
  replaysOnErrorSampleRate: isNetlifyDeployPreview ? 0 : 1.0,

  beforeSend(event) {
    event.tags = {
      ...(event.tags || {}),
      runtime: "world-server-production"
    };
    return event;
  }
});

window.WorldServerSentry = Sentry;
