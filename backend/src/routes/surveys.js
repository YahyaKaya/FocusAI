import { prisma } from '../lib/prisma.js'

function calculateProductivityScore({ productivity, focus, satisfaction, distraction, actual_duration, planned_duration }) {
  const distractionMap = { NONE: 0.0, FEW: 0.5, MANY: 1.0 }
  const D = distractionMap[distraction] ?? 0.0
  const P = (productivity - 1) / 4
  const F = (focus - 1) / 4
  const S = (satisfaction - 1) / 4
  const baseScore = 100 * (0.4 * P + 0.3 * F + 0.2 * S + 0.1 * (1 - D))

  // Small penalty only if user completed less than 50% of planned duration
  let durationFactor = 1.0
  if (planned_duration && actual_duration && planned_duration > 0) {
    const threshold = planned_duration * 0.5
    if (actual_duration < threshold) {
      durationFactor = actual_duration / threshold
    }
  }

  return Math.round(baseScore * durationFactor * 10) / 10
}

export async function surveyRoutes(fastify) {

  // Submit pre-survey
  fastify.post('/sessions/:id/pre-survey', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params
    const { mood, energy, motivation, goal_difficulty, environment, music_type } = request.body

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })

    const existing = await prisma.preSurvey.findUnique({
      where: { session_id: id },
    })
    if (existing) return reply.code(400).send({ error: 'Pre-survey already submitted' })

    const survey = await prisma.preSurvey.create({
      data: {
        session_id: id,
        mood,
        energy,
        motivation,
        goal_difficulty,
        environment: environment ?? 'QUIET',
        music_type: music_type ?? null,
      },
    })

    return reply.code(201).send({ survey })
  })

  // Submit post-survey and calculate productivity score
  fastify.post('/sessions/:id/post-survey', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params
    const { productivity, focus, satisfaction, distraction, notes } = request.body

    const session = await prisma.session.findFirst({
      where: { id, user_id: userId },
    })

    if (!session) return reply.code(404).send({ error: 'Session not found' })
    if (session.status !== 'COMPLETED') return reply.code(400).send({ error: 'Session must be completed before submitting post-survey' })

    const existing = await prisma.postSurvey.findUnique({
      where: { session_id: id },
    })
    if (existing) return reply.code(400).send({ error: 'Post-survey already submitted' })

    const score = calculateProductivityScore({
      productivity,
      focus,
      satisfaction,
      distraction,
      actual_duration: session.actual_duration,
      planned_duration: session.planned_duration,
    })

    const [survey] = await prisma.$transaction([
      prisma.postSurvey.create({
        data: {
          session_id: id,
          productivity,
          focus,
          satisfaction,
          distraction: distraction ?? 'NONE',
          notes: notes ?? null,
        },
      }),
      prisma.session.update({
        where: { id },
        data: { productivity_score: score },
      }),
    ])

    // Call ML service and save recommendation to DB
    const mlUrl = process.env.ML_SERVICE_URL
    if (mlUrl) {
      ;(async () => {
        try {
          const mlRes = await fetch(`${mlUrl}/generate-recommendation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
          })

          if (!mlRes.ok) return

          const mlData = await mlRes.json()

          if (mlData.status === 'not_enough_data') return

          await prisma.recommendation.create({
            data: {
              user_id: userId,
              session_id: id,
              type: 'TIME_OF_DAY',
              content: mlData.description,
              reasoning: JSON.stringify({
                title: mlData.title,
                method: mlData.method,
                sessions_analyzed: mlData.sessions_analyzed,
                suggested_settings: mlData.suggested_settings,
                insight: mlData.insight,
              }),
            },
          })
        } catch (err) {
          fastify.log.warn('ML service call failed: ' + err.message)
        }
      })()
    }

    return reply.code(201).send({ survey, productivity_score: score })
  })
}
