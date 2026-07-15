// Vercel Serverless Function: "Email summary to AgOptics" submission.
// The Netlify implementation is written against the web-standard
// Request/Response API, which Vercel's Node runtime also supports, so this
// simply re-exports it. Reached at /api/submit; vercel.json rewrites the
// app's /.netlify/functions/submit calls here so index.html needs no changes.

export { default } from '../app/netlify/functions/submit.mjs';
