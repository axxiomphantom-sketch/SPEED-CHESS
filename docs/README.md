# SPEED CHESS documentation

| Document | Read it when |
| --- | --- |
| [`API.md`](API.md) | You are calling the API: every HTTP/WebSocket endpoint, access level, payload and failure mode. |
| [`SCHEMA.md`](SCHEMA.md) | You are touching the database: every table, relationship, index and PostgreSQL porting note. |
| [`SUPABASE.md`](SUPABASE.md) | You are setting up authentication: Supabase project configuration, email templates, RLS policies and the identity bridge. |
| [`CLOUDFLARE.md`](CLOUDFLARE.md) | You are deploying to Cloudflare: what the Worker does, why the API stays on Node, and the verified test matrix. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | You are shipping: environment variables, Docker, reverse proxy, backups, scaling, security checklist. |

Start with the root [`README.md`](../README.md) for what the product does and which features are real
versus deliberately left unintegrated (payments, SMTP, OAuth).
