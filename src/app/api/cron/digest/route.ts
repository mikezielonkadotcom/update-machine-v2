import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Clean up expired magic links
    try {
      await query("DELETE FROM magic_links WHERE expires_at < NOW()");
    } catch {}

    // Clean up expired sessions
    try {
      await query("DELETE FROM sessions WHERE expires_at < NOW()");
    } catch {}

    // Get error digest
    const totalResult = await queryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours'"
    );
    const totalErrors = Number(totalResult?.c || 0);

    if (totalErrors === 0) {
      return NextResponse.json({ ok: true, message: 'No errors to report' });
    }

    const byLevelRows = await queryAll<{ level: string; c: string }>(
      "SELECT level, COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY level"
    );
    const bySourceRows = await queryAll<{ source: string; c: string }>(
      "SELECT source, COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY source"
    );
    const recent = await queryAll<any>(
      "SELECT * FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 10"
    );

    const levelSummary = byLevelRows.map(r => `${r.level}: ${r.c}`).join(', ') || 'none';
    const sourceSummary = bySourceRows.map(r => `${r.source}: ${r.c}`).join(', ') || 'none';
    const recentMessages = recent.slice(0, 5).map((e, i) => `${i + 1}. [${e.level}] ${e.source}: ${e.message}`).join('\n');

    const botToken = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL || 'C0ANNJ51A87';

    if (botToken) {
      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: `Update Machine — ${totalErrors} error(s) in last 24h`, emoji: true } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*By Level:*\n${levelSummary}` },
          { type: 'mrkdwn', text: `*By Source:*\n${sourceSummary}` },
        ]},
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `*Recent Errors:*\n\`\`\`\n${recentMessages}\n\`\`\`` } },
      ];

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${botToken}` },
        body: JSON.stringify({ channel, blocks }),
      });
    }

    return NextResponse.json({ ok: true, errors_reported: totalErrors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
