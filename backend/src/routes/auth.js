import { prisma } from '../lib/prisma.js'

export async function authRoutes(fastify) {
  fastify.post('/auth/sync', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { sub, email, user_metadata } = request.user

    const user = await prisma.user.upsert({
      where: { id: sub },
      update: {
        name: user_metadata?.full_name ?? user_metadata?.name ?? null,
      },
      create: {
        id: sub,
        name: user_metadata?.full_name ?? user_metadata?.name ?? null,
      },
    })

    return reply.code(200).send({ user })
  })
}
