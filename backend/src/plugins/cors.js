import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";

async function cors(fastify) {
  await fastify.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
}

export const corsPlugin = fp(cors);
