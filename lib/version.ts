// The app version, single-sourced from package.json.
//
// Injected by next.config.ts `env` (NEXT_PUBLIC_APP_VERSION), which inlines it
// at build time. That indirection is deliberate: importing package.json from a
// client component would ship the whole dependency list into the browser; this
// ships only the version string.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
