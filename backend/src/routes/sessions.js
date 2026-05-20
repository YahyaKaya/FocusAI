import { prisma } from '../lib/prisma.js'

export async function sessionRoutes(fastify) {

  // Start a new session
  fastify.post('/sessions', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { session_type, planned_duration } = request.body

    const session = await prisma.session.create({
      data: {
        user_id: userId,
        session_type: session_type ?? 'OTHER',
        planned_duration: planned_duration ?? null,
        status: 'ACTIVE',
      },
    })

    return reply.code(201).send({ session })
  })

  // Pause a session
  fastify.patch('/sessions/:id/pause', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })
    if (session.status !== 'ACTIVE') return reply.code(400).send({ error: 'Session is not active' })

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: 'PAUSED',
        pause_count: { increment: 1 },
      },
    })

    return reply.send({ session: updated })
  })

  // Resume a session
  fastify.patch('/sessions/:id/resume', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params
    const { break_duration_mins } = request.body

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })
    if (session.status !== 'PAUSED') return reply.code(400).send({ error: 'Session is not paused' })

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        total_break_mins: {
          increment: break_duration_mins ?? 0,
        },
      },
    })

    return reply.send({ session: updated })
  })

  // End a session
  fastify.patch('/sessions/:id/end', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })
    if (session.status === 'COMPLETED') {
      // Already completed — return it as-is so mobile can proceed to post-survey
      return reply.send({ session })
    }

    const endTime = new Date()
    // actual_duration = wall clock minus total break time already accumulated
    const wallClockMins = Math.round(
      (endTime.getTime() - session.start_time.getTime()) / 60000
    )
    const actualDuration = Math.max(1, wallClockMins - (session.total_break_mins ?? 0))

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        end_time: endTime,
        actual_duration: actualDuration,
      },
    })

    return reply.send({ session: updated })
  })

  // Get all sessions for the current user
  fastify.get('/sessions', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub

    const sessions = await prisma.session.findMany({
      where: { user_id: userId },
      orderBy: { start_time: 'desc' },
      include: {
        pre_survey: true,
        post_survey: true,
      },
    })

    return reply.send({ sessions })
  })

  // Get a single session
  fastify.get('/sessions/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
      include: {
        pre_survey: true,
        post_survey: true,
        recommendations: true,
      },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })

    return reply.send({ session })
  })

  // Update session type
  fastify.patch('/sessions/:id/type', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { id } = request.params;
    const { session_type } = request.body;

    const session = await prisma.session.findFirst({ where: { id, user_id: userId } });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const updated = await prisma.session.update({
      where: { id },
      data: { session_type },
    });

    return reply.send({ session: updated });
  })

  // Delete a session
  fastify.delete('/sessions/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params

    const session = await prisma.session.findFirst({ where: { id, user_id: userId } })
    if (!session) return reply.code(404).send({ error: 'Session not found' })

    await prisma.session.delete({ where: { id } })
    return reply.code(204).send()
  })
}
