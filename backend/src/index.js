import "dotenv/config";
import Fastify from "fastify";
import { corsPlugin } from "./plugins/cors.js";
import { jwtPlugin } from "./plugins/jwt.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/sessions.js";
import { surveyRoutes } from "./routes/surveys.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { signalRoutes } from "./routes/signals.js";

const fastify = Fastify({ logger: true });

await fastify.register(corsPlugin);
await fastify.register(jwtPlugin);
await fastify.register(authRoutes);
await fastify.register(sessionRoutes);
await fastify.register(surveyRoutes);
await fastify.register(recommendationRoutes);
await fastify.register(signalRoutes);

fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.get("/debug", async () => {
  return {
    status: "ok",
    env: {
      JWT_SECRET: process.env.JWT_SECRET ? "SET" : "NOT SET",
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ? "SET" : "NOT SET",
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
    },
    timestamp: new Date().toISOString(),
  };
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

try {
  await fastify.listen({ port, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
