import { prisma } from '../lib/prisma.js'

export async function signalRoutes(fastify) {

  // Submit passive signals (opt-in only)
  fastify.post('/sessions/:id/signals', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params
    const { notification_count, distraction_taps, unlock_count } = request.body

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })

    // Check user has consent enabled
    const consent = await prisma.userConsent.findUnique({
      where: { user_id: userId },
    })

    if (!consent || (!consent.notifications_enabled && !consent.distraction_tap_enabled && !consent.unlock_tracking_enabled)) {
      return reply.code(403).send({ error: 'No passive signal consent given' })
    }

    const signal = await prisma.passiveSignal.create({
      data: {
        session_id: id,
        notification_count: consent.notifications_enabled ? (notification_count ?? null) : null,
        distraction_taps: consent.distraction_tap_enabled ? (distraction_taps ?? null) : null,
        unlock_count: consent.unlock_tracking_enabled ? (unlock_count ?? null) : null,
      },
    })

    return reply.code(201).send({ signal })
  })
}
