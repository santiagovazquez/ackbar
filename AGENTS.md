# Production endpoints

- Public web application: `https://ackb.ar`
- Public API and health check: `https://api.ackb.ar` (`/health`)
- SSH deployment host: read `.agents/production.local.md` when it exists.

The SSH host is private local configuration and must not be committed. Never
infer an API hostname from it; production checks use `https://api.ackb.ar`.
