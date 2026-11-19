<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Document AI processing

Set `OPENAI_API_KEY` in the API environment. The API can start without the key for non-AI endpoints; summary and embedding requests return an explicit service-unavailable error until it is configured. The API uses `gpt-4o-mini` for hierarchical summaries and `text-embedding-3-small` for 1,536-dimensional chunk embeddings. The key must not be added to the frontend.

Uploads are validated and securely stored before the API queues processing in BullMQ through Redis. The worker extracts and normalizes text, stores embeddings in PostgreSQL with pgvector, generates the summary, and updates the document through `UPLOADED`, `PROCESSING`, `EXTRACTING`, `GENERATING_EMBEDDINGS`, `SUMMARIZING`, and `COMPLETED` (or `FAILED`) states. OpenAI jobs use a 30-second request timeout, one SDK retry, and up to three queue attempts with exponential backoff. The API rejects duplicate file contents for the same owner using a SHA-256 content hash and a unique partial MongoDB index. Original files use random storage names and restrictive filesystem permissions. PostgreSQL embedding chunk IDs are recorded privately on the MongoDB document.

The upload pipeline saves a short summary by default. Authenticated document owners can request or regenerate `SHORT`, `DETAILED`, `BULLET_POINTS`, `EXECUTIVE`, `KEY_INSIGHTS`, or `KEYWORDS` summaries with `POST /api/documents/:id/summaries` and `{ "type": "DETAILED" }`. Summary jobs run asynchronously; document details report `summaryGenerationStatus`, `summaryGenerationType`, and a sanitized `summaryGenerationError`. Generated variants are saved on the MongoDB document and returned by its detail endpoint. The summarization prompts treat extracted text as untrusted source data and instruct the model not to follow embedded instructions or add unsupported facts. Administrators can queue short-summary regeneration through `POST /api/admin/refresh-summary/:id`.

Semantic search embeds natural-language queries with `text-embedding-3-small` and ranks stored chunks by pgvector cosine similarity. `GET /api/documents/search` accepts optional `documentId` and `fileType=PDF|TXT` filters. User searches scope vectors and document metadata to the authenticated owner; results are rechecked against completed MongoDB documents before returning the source title, snippet, and cosine score.

The authenticated `GET /api/documents/stats` endpoint returns the caller's total documents, completed summaries, completed documents, and successful semantic search count. Search counts are incremented atomically per user; search query text is not retained for this metric.

Set `POSTGRES_URL` to a PostgreSQL database with pgvector available. For local development, set `POSTGRES_PASSWORD` in `api/.env` and run `docker compose -f docker-compose.pgvector.yml up -d` from `api`, then set `POSTGRES_URL` to that database. Apply versioned migrations before using PostgreSQL:

```bash
npm run db:migrate
```

The migration runner applies files in `database/migrations` in order, records them in `schema_migrations`, and uses a PostgreSQL advisory lock to prevent concurrent migration runs. The initial migration creates normalized UUID-keyed `tenants`, `users`, `roles`, `permissions`, `role_permissions`, `documents`, `document_chunks`, `document_embeddings`, `summaries`, `conversations`, `messages`, `audit_logs`, and `refresh_tokens` tables. It adds foreign keys, content/status checks, soft-delete/revocation fields, timestamps, lookup indexes, a cosine HNSW vector index, and forced row-level security policies.

If the earlier runtime-created pgvector table exists, the migration imports its vectors and chunks into the normalized tables and creates stable UUID mappings from the legacy MongoDB IDs. Legacy file metadata is represented with placeholders in PostgreSQL; MongoDB continues to provide the existing document API metadata.

The API assigns each synchronized MongoDB user a PostgreSQL UUID and personal tenant. Every PostgreSQL operation that reads or writes user-owned rows sets transaction-local user/tenant context; row-level policies enforce the same owner boundary below the API. Admin search context is derived from the authenticated user role. Existing document endpoints continue to apply owner-scoped MongoDB filters and admin guards. MongoDB remains the current source for authentication and document API responses; PostgreSQL holds normalized user/document mappings, summaries, chunks, and vectors, while the other normalized tables are ready for their respective API features.

Run migrations with the same non-superuser database role configured in `POSTGRES_URL`, so the API has the required table privileges; PostgreSQL superusers and roles with `BYPASSRLS` can bypass row-level security. The migration role must be permitted to create the `vector` extension (or an administrator must enable it first). The API no longer creates or alters tables at runtime; missing migrations are reported as a PostgreSQL availability error. PostgreSQL remains optional for local startup when `POSTGRES_URL` is unset, but document processing and semantic search require it.

Text extraction errors, corrupted PDFs, empty documents, missing original files, and AI/vector-store outages mark the document `FAILED` after configured queue retries. A sanitized `processingError` is returned with the document; credentials and provider internals are not exposed.

## Redis

Redis is required only as BullMQ's backend for asynchronous document processing; there is no custom RedisService, application cache, or Redis-backed rate limiter. To run a local Redis instance with the API's default `127.0.0.1:6379` settings:

```bash
docker compose -f docker-compose.redis.yml up -d
docker compose -f docker-compose.redis.yml ps
```

The Compose file binds Redis to loopback, persists queue data, and enables authentication when `REDIS_PASSWORD` is non-empty in `api/.env`. Keep `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` consistent between the API and Redis. In development, Redis connection failures use a logged in-process fallback so uploads can still be accepted and processed asynchronously; pending fallback jobs are not durable across API restarts. Production has no fallback and reports queue failures, so run Redis for reliable production processing.

## Initial administrator

Public registration always creates `USER` accounts. To create the first administrator, build the API and run `npm run seed:admin`. The command creates `admin@kriscent.local` with a one-time generated password by default. Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and optionally `BOOTSTRAP_ADMIN_PASSWORD` in the API environment to customize it. The seed command refuses to promote an existing regular user; use MongoDB Compass to review such a record rather than weakening public registration.
