import fp from "fastify-plugin";
import * as jose from "jose";

async function jwt(fastify) {
  const SUPABASE_URL = process.env.SUPABASE_URL;

  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL environment variable is not set");
  }

  const JWKS = jose.createRemoteJWKSet(
    new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  );

  fastify.decorate("authenticate", async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const token = authHeader.slice(7);
      const { payload } = await jose.jwtVerify(token, JWKS, {
        algorithms: ["ES256", "RS256", "HS256"],
      });
      request.user = payload;
    } catch (err) {
      fastify.log.error("Token verification failed: " + err.message);
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

export const jwtPlugin = fp(jwt);
