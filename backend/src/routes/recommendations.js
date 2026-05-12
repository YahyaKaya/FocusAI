import { prisma } from '../lib/prisma.js'

export async function recommendationRoutes(fastify) {

  // Get the latest recommendation for the current user
  fastify.get('/recommendations/latest', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub

    const recommendation = await prisma.recommendation.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    })

    return reply.send({ recommendation })
  })

  // Get all recommendations for the current user
  fastify.get('/recommendations', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub

    const recommendations = await prisma.recommendation.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20,
    })

    return reply.send({ recommendations })
  })

  // Apply or dismiss a recommendation
  fastify.patch('/recommendations/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params
    const { interaction } = request.body

    if (!['APPLIED', 'DISMISSED'].includes(interaction)) {
      return reply.code(400).send({ error: 'interaction must be APPLIED or DISMISSED' })
    }

    const recommendation = await prisma.recommendation.findFirst({
      where: { id, user_id: userId },
    })

    if (!recommendation) return reply.code(404).send({ error: 'Recommendation not found' })

    const updated = await prisma.recommendation.update({
      where: { id },
      data: {
        interaction,
        interacted_at: new Date(),
      },
    })

    return reply.send({ recommendation: updated })
  })
}
