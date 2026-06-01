/**
 * Smart Lead Routing Service
 * Scores experts based on destination match, specialty, availability, and response rate.
 * Replaces the city-queue FIFO with a ranked assignment system.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface ExpertScore {
  expertId: string;
  expertName: string;
  totalScore: number;
  destinationScore: number;
  specialtyScore: number;
  availabilityScore: number;
  responseRateScore: number;
  queueDepth: number;
}

export interface RoutingResult {
  assignedExpertId: string | null;
  scores: ExpertScore[];
  reason: string;
}

export interface LeadContext {
  destination: string;
  topic?: string;
  requestType?: string;
  userId?: string;
  tripId?: string;
}

class LeadRoutingService {
  /**
   * Score all approved experts for a given lead and return ranked list.
   * Scoring weights:
   *   - Destination match: 40 pts
   *   - Specialty match:   25 pts
   *   - Availability:      20 pts (inverse of active queue depth, max 20)
   *   - Response rate:     15 pts
   */
  async scoreExperts(ctx: LeadContext): Promise<ExpertScore[]> {
    try {
      const dest = ctx.destination?.toLowerCase().trim() || '';
      const topic = ctx.topic?.toLowerCase().trim() || '';

      const experts = await db.execute(sql`
        SELECT
          lef.user_id        AS expert_id,
          u.first_name       AS first_name,
          u.last_name        AS last_name,
          lef.specialties    AS specialties,
          lef.cities_covered AS cities_covered,
          lef.languages      AS languages,
          lef.status         AS status
        FROM local_expert_forms lef
        JOIN users u ON u.id = lef.user_id
        WHERE lef.status = 'approved'
      `);

      if (!experts.rows || experts.rows.length === 0) return [];

      const scores: ExpertScore[] = await Promise.all(
        experts.rows.map(async (e: any) => {
          const expertId = e.expert_id;

          // ── 1. Destination score (40 pts) ──────────────────────────────
          let destinationScore = 0;
          const cities: string[] = Array.isArray(e.cities_covered)
            ? e.cities_covered
            : typeof e.cities_covered === 'string'
            ? JSON.parse(e.cities_covered || '[]')
            : [];

          for (const city of cities) {
            const c = city.toLowerCase().trim();
            if (c === dest) { destinationScore = 40; break; }
            if (c.includes(dest) || dest.includes(c)) { destinationScore = Math.max(destinationScore, 25); }
          }

          // ── 2. Specialty score (25 pts) ────────────────────────────────
          let specialtyScore = 0;
          if (topic) {
            const specialties: string[] = Array.isArray(e.specialties)
              ? e.specialties
              : typeof e.specialties === 'string'
              ? JSON.parse(e.specialties || '[]')
              : [];

            for (const sp of specialties) {
              const s = sp.toLowerCase().trim();
              if (s === topic) { specialtyScore = 25; break; }
              if (s.includes(topic) || topic.includes(s)) { specialtyScore = Math.max(specialtyScore, 15); }
            }
          } else {
            specialtyScore = 10;
          }

          // ── 3. Availability score (20 pts) ────────────────────────────
          const queueResult = await db.execute(sql`
            SELECT COUNT(*) AS active_count
            FROM expert_requests
            WHERE assigned_expert_id = ${expertId}
              AND status IN ('queued', 'assigned', 'in_progress')
          `);
          const queueDepth = parseInt((queueResult.rows?.[0] as any)?.active_count || '0', 10);
          const availabilityScore = Math.max(0, 20 - queueDepth * 4);

          // ── 4. Response rate score (15 pts) ───────────────────────────
          const responseResult = await db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE status != 'queued') AS responded,
              COUNT(*) AS total
            FROM expert_requests
            WHERE assigned_expert_id = ${expertId}
              AND created_at > NOW() - INTERVAL '90 days'
          `);
          const responded = parseInt((responseResult.rows?.[0] as any)?.responded || '0', 10);
          const total = parseInt((responseResult.rows?.[0] as any)?.total || '0', 10);
          const rate = total > 0 ? responded / total : 0.5;
          const responseRateScore = Math.round(rate * 15);

          const totalScore = destinationScore + specialtyScore + availabilityScore + responseRateScore;

          return {
            expertId,
            expertName: `${e.first_name || ''} ${e.last_name || ''}`.trim() || `Expert ${expertId.slice(0, 6)}`,
            totalScore,
            destinationScore,
            specialtyScore,
            availabilityScore,
            responseRateScore,
            queueDepth,
          };
        })
      );

      return scores.sort((a, b) => b.totalScore - a.totalScore);
    } catch (error: any) {
      console.error('[LeadRouting] scoreExperts error:', error.message);
      return [];
    }
  }

  /**
   * Route a lead: score experts, pick the top one, log the decision.
   */
  async routeLead(ctx: LeadContext): Promise<RoutingResult> {
    const scores = await this.scoreExperts(ctx);

    if (scores.length === 0) {
      return { assignedExpertId: null, scores: [], reason: 'No approved experts found' };
    }

    const top = scores[0];

    if (top.totalScore === 0) {
      return {
        assignedExpertId: null,
        scores,
        reason: 'No expert matched the destination or specialty',
      };
    }

    await this.logRoutingDecision(ctx, scores);

    return {
      assignedExpertId: top.expertId,
      scores,
      reason: `Assigned to ${top.expertName} (score: ${top.totalScore}/100 — dest: ${top.destinationScore}, specialty: ${top.specialtyScore}, availability: ${top.availabilityScore}, response: ${top.responseRateScore})`,
    };
  }

  /**
   * Log the routing decision to lead_routing_logs for admin transparency.
   */
  private async logRoutingDecision(ctx: LeadContext, scores: ExpertScore[]) {
    try {
      await db.execute(sql`
        INSERT INTO lead_routing_logs (
          id, trip_id, user_id, destination, topic,
          assigned_expert_id, top_score, scores_json, created_at
        ) VALUES (
          gen_random_uuid(),
          ${ctx.tripId || null},
          ${ctx.userId || null},
          ${ctx.destination},
          ${ctx.topic || null},
          ${scores[0].expertId},
          ${scores[0].totalScore},
          ${JSON.stringify(scores.slice(0, 5))}::jsonb,
          NOW()
        )
      `);
    } catch (_) {
      // Non-critical — don't break the flow if logging fails
    }
  }
}

export const leadRoutingService = new LeadRoutingService();
