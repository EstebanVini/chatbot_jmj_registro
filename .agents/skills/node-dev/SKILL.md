---
name: node-dev
description: Expert Node.js backend development skill, focusing on Express/Fastify, REST/GraphQL, and asynchronous programming.
---

# Node.js Development Skill

Use this skill when developing backend services using Node.js.

## Guidelines

1. **Architecture**: Use a clear layered architecture (e.g., Controllers, Services, Data Access/Repositories).
2. **Asynchronous Code**: Prefer `async/await` over raw promises or callbacks. Handle rejections properly.
3. **Error Handling**: Use centralized error handling middleware. Do not let application crash on unhandled exceptions (except where necessary).
4. **Security**: Validate all incoming inputs (using libraries like Zod or Joi). Prevent SQL injection and XSS.
5. **Environment Variables**: Use `.env` files for configuration. Never hardcode secrets.
6. **Logging**: Use a structured logging library like Winston or Pino instead of simple `console.log`.
7. **Performance**: Be mindful of the event loop. Avoid synchronous operations that can block the loop.
