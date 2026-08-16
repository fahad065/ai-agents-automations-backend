import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY || '';
  private readonly from = process.env.SMTP_FROM || 'noreply@logicmate.io';
  private readonly adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'knowledgetruth2023@gmail.com';

  // ── Core send via Resend HTTP API ─────────────────────────
  private async send(to: string | string[], subject: string, html: string, cc?: string): Promise<boolean> {
    try {
      const body: any = {
        from: `LogicMate <${this.from}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      };
      if (cc) body.cc = [cc];

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend API error ${res.status}: ${err}`);
      }

      this.logger.log(`[Email] ✓ Sent "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
      return true;
    } catch (e) {
      this.logger.error(`[Email] Failed "${subject}": ${e.message}`);
      return false;
    }
  }

  // Keep backward-compatible methods
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    return this.send(to, subject, html);
  }

  async sendEmailWithCC(to: string, cc: string, subject: string, html: string): Promise<boolean> {
    return this.send(to, subject, html, cc);
  }

  // ── Base template ─────────────────────────────────────────
  private base(content: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding-bottom:24px;text-align:center;">
  <span style="font-size:20px;font-weight:700;color:#e5e5e5;">Logic<span style="color:#7c3aed;">Mate</span></span>
</td></tr>
<tr><td style="background:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
  ${content}
</td></tr>
<tr><td style="padding:24px 0;text-align:center;">
  <p style="color:#404040;font-size:12px;margin:0;">© ${new Date().getFullYear()} LogicMate · <a href="https://www.logicmate.io" style="color:#7c3aed;text-decoration:none;">logicmate.io</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  }

  // ── 1. Welcome Email ──────────────────────────────────────
  async sendWelcomeEmail(user: { name: string; email: string }): Promise<void> {
    const html = this.base(`
      <div style="padding:40px 36px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🎉</div>
        <h1 style="color:#e5e5e5;font-size:24px;font-weight:700;margin:0 0 8px;">Welcome to LogicMate!</h1>
        <p style="color:#737373;font-size:15px;margin:0 0 28px;">Your AI automation platform is ready</p>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:left;">
          Hi ${user.name || 'there'}, welcome aboard! LogicMate automates your content creation with AI — videos, shorts, thumbnails — all on autopilot.
        </p>
        <div style="background:#1a1a1a;border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:20px;margin:0 0 28px;text-align:left;">
          <p style="color:#a78bfa;font-size:13px;font-weight:600;margin:0 0 12px;">🚀 Get started in 3 steps:</p>
          ${['Add your API keys in Settings', 'Browse the Module Marketplace', 'Configure & run your first pipeline'].map((s, i) => `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
              <span style="width:24px;height:24px;background:#7c3aed;border-radius:50%;text-align:center;line-height:24px;color:white;font-size:12px;font-weight:700;display:inline-block;">${i + 1}</span>
              <span style="color:#d4d4d4;font-size:14px;">${s}</span>
            </div>`).join('')}
        </div>
        <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">
          Go to Dashboard →
        </a>
        <p style="color:#525252;font-size:13px;margin:24px 0 0;">You have a <strong style="color:#f59e0b;">30-day free trial</strong>. No credit card required.</p>
      </div>
    `);
    await this.send(user.email, '🎉 Welcome to LogicMate!', html);
    await this.send(this.adminEmail, `[LogicMate] New signup: ${user.name} (${user.email})`,
      `<p style="font-family:sans-serif;padding:20px;">New user signed up:<br><strong>${user.name}</strong><br>${user.email}<br><small>${new Date().toISOString()}</small></p>`);
  }

  // ── 2. Pipeline Complete ──────────────────────────────────
  async sendPipelineCompleteEmail(user: { name: string; email: string }, data: {
    title: string; youtubeUrl: string; moduleName: string; cost?: number; duration?: string;
  }): Promise<void> {
    const html = this.base(`
      <div style="background:linear-gradient(135deg,rgba(34,197,94,0.1),rgba(34,197,94,0.05));padding:32px 36px 0;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:48px;margin-bottom:12px;">🎬</div>
        <h1 style="color:#22c55e;font-size:22px;font-weight:700;margin:0 0 8px;">Video Uploaded Successfully!</h1>
        <p style="color:#737373;font-size:14px;margin:0 0 24px;">${data.moduleName} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      <div style="padding:28px 36px;">
        <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:24px;">
          <p style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;">Video Title</p>
          <p style="color:#e5e5e5;font-size:16px;font-weight:600;margin:0;">"${data.title}"</p>
        </div>
        ${data.cost ? `<div style="margin-bottom:24px;display:flex;gap:12px;">
          <div style="flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;text-align:center;">
            <p style="color:#737373;font-size:11px;margin:0 0 4px;">API Cost</p>
            <p style="color:#f59e0b;font-size:18px;font-weight:700;margin:0;">$${data.cost.toFixed(2)}</p>
          </div>
        </div>` : ''}
        <div style="text-align:center;margin-bottom:16px;">
          <a href="${data.youtubeUrl}" style="display:inline-block;background:#ef4444;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">▶ Watch on YouTube</a>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/pipeline-logs" style="color:#7c3aed;font-size:13px;text-decoration:none;">View pipeline logs →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `🎬 Your video is live: "${data.title}"`, html, this.adminEmail);
  }

  // ── 3. Pipeline Failed ────────────────────────────────────
  async sendPipelineFailedEmail(user: { name: string; email: string }, data: {
    moduleName: string; errorMessage: string; step?: string;
  }): Promise<void> {
    const html = this.base(`
      <div style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05));padding:32px 36px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:48px;margin-bottom:12px;">❌</div>
        <h1 style="color:#ef4444;font-size:22px;font-weight:700;margin:0 0 8px;">Pipeline Failed</h1>
        <p style="color:#737373;font-size:14px;margin:0;">${data.moduleName}${data.step ? ` · Failed at ${data.step}` : ''}</p>
      </div>
      <div style="padding:28px 36px;">
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 20px;">Hi ${user.name || 'there'}, your pipeline encountered an error and couldn't complete.</p>
        <div style="background:#1a1a1a;border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:16px;margin-bottom:24px;">
          <p style="color:#737373;font-size:11px;text-transform:uppercase;margin:0 0 6px;">Error</p>
          <p style="color:#fca5a5;font-size:13px;font-family:monospace;margin:0;">${data.errorMessage.slice(0, 200)}</p>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/pipeline-logs" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">View Logs & Retry →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `❌ Pipeline failed — ${data.moduleName}`, html, this.adminEmail);
  }

  // ── 4. Trial Started ──────────────────────────────────────
  async sendTrialStartedEmail(user: { name: string; email: string }, data: {
    moduleName: string; trialEndDate: Date;
  }): Promise<void> {
    const endDate = data.trialEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const html = this.base(`
      <div style="padding:40px 36px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🚀</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;">30-Day Trial Started!</h1>
        <p style="color:#737373;font-size:14px;margin:0 0 24px;">${data.moduleName}</p>
        <div style="background:#1a1a1a;border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
          <p style="color:#737373;font-size:12px;margin:0 0 4px;">Trial ends on</p>
          <p style="color:#a78bfa;font-size:20px;font-weight:700;margin:0;">${endDate}</p>
        </div>
        <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/modules" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Configure & Run →</a>
      </div>
    `);
    await this.send(user.email, `🚀 Your 30-day trial for ${data.moduleName} has started!`, html);
  }

  // ── 5. Trial Expiring ─────────────────────────────────────
  async sendTrialExpiringEmail(user: { name: string; email: string }, data: {
    moduleName: string; daysLeft: number; trialEndDate: Date;
  }): Promise<void> {
    const endDate = data.trialEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const html = this.base(`
      <div style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.05));padding:32px 36px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:48px;margin-bottom:12px;">⏰</div>
        <h1 style="color:#f59e0b;font-size:22px;font-weight:700;margin:0 0 8px;">Trial Ending in ${data.daysLeft} Days</h1>
        <p style="color:#737373;font-size:14px;margin:0;">${data.moduleName} · Expires ${endDate}</p>
      </div>
      <div style="padding:28px 36px;">
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${user.name || 'there'}, your trial expires in ${data.daysLeft} days. Upgrade to keep your automations running.</p>
        <div style="background:#1a1a1a;border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
          <p style="color:#f59e0b;font-size:13px;font-weight:600;margin:0 0 8px;">What happens when trial expires:</p>
          <p style="color:#737373;font-size:13px;margin:0;">• Pipeline stops running automatically</p>
          <p style="color:#737373;font-size:13px;margin:4px 0 0;">• All your settings and data are preserved</p>
          <p style="color:#737373;font-size:13px;margin:4px 0 0;">• Upgrade anytime to resume instantly</p>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/payment-instructions" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">View Payment Instructions →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `⏰ Your trial expires in ${data.daysLeft} days — ${data.moduleName}`, html);
  }

  // ── 6. Trial Expired ──────────────────────────────────────
  async sendTrialExpiredEmail(user: { name: string; email: string }, data: { moduleName: string }): Promise<void> {
    const html = this.base(`
      <div style="padding:40px 36px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">⏰</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;">Your Trial Has Ended</h1>
        <p style="color:#737373;font-size:14px;margin:0 0 28px;">${data.moduleName} has been paused</p>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">
          Your 30-day free trial has ended. To continue using your AI pipeline, 
          subscribe via manual bank transfer. All your settings and data are saved.
        </p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;margin:0 0 28px;text-align:left;">
          <p style="color:#f59e0b;font-size:13px;font-weight:600;margin:0 0 12px;">⚡ How to continue:</p>
          <p style="color:#a3a3a3;font-size:13px;line-height:1.8;margin:0;">
            1. Transfer subscription fee to our UAE bank account<br/>
            2. Send us your transaction reference<br/>
            3. We'll activate your account within 24 hours
          </p>
        </div>
        <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/payment-instructions" 
           style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">
          View Payment Instructions →
        </a>
        <p style="color:#525252;font-size:12px;margin:20px 0 0;">
          Questions? Reply to this email or contact hello@logicmate.io
        </p>
      </div>
    `);
    await this.send(user.email, `Your trial has ended — continue with ${data.moduleName}`, html);
  }

  // ── Day 1 — API Keys reminder ─────────────────────────────
  async sendDay1Email(user: { name: string; email: string }): Promise<void> {
    const html = this.base(`
      <div style="padding:40px 36px;">
        <div style="font-size:48px;margin-bottom:12px;text-align:center;">🔑</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;text-align:center;">One step to get started</h1>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${user.name || 'there'}, you signed up for LogicMate yesterday — great!</p>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">To run your first AI pipeline, you need to add your API keys. It takes less than 5 minutes:</p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;margin:0 0 28px;">
          <p style="color:#f59e0b;font-size:13px;font-weight:600;margin:0 0 12px;">🔑 Required API keys:</p>
          <p style="color:#a3a3a3;font-size:13px;line-height:1.8;margin:0;">
            1. <strong style="color:#e5e5e5;">OpenAI API key</strong> — for script writing, voiceover and thumbnails<br/>
            2. <strong style="color:#e5e5e5;">Atlas Cloud (Seedance) key</strong> — for AI video clip generation<br/>
            3. <strong style="color:#e5e5e5;">YouTube OAuth</strong> — to auto-upload videos to your channel
          </p>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/api-keys" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Add API Keys →</a>
        </div>
        <p style="color:#525252;font-size:12px;margin:20px 0 0;text-align:center;">Questions? Reply to this email — we respond within a few hours.</p>
      </div>
    `);
    await this.send(user.email, `One step left to run your first AI pipeline`, html);
  }

  // ── Day 3 — Step by step guide ────────────────────────────
  async sendDay3Email(user: { name: string; email: string }): Promise<void> {
    const html = this.base(`
      <div style="padding:40px 36px;">
        <div style="font-size:48px;margin-bottom:12px;text-align:center;">🚀</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;text-align:center;">Your first AI video — step by step</h1>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${user.name || 'there'}, here's exactly how to get your first AI-generated video live on YouTube tonight:</p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;margin:0 0 28px;">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">1</div>
            <div>
              <p style="color:#e5e5e5;font-size:13px;font-weight:600;margin:0 0 4px;">Add your API keys</p>
              <p style="color:#a3a3a3;font-size:12px;margin:0;">Settings → API Keys → Add OpenAI and Atlas Cloud keys</p>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">2</div>
            <div>
              <p style="color:#e5e5e5;font-size:13px;font-weight:600;margin:0 0 4px;">Add YouTube Agent</p>
              <p style="color:#a3a3a3;font-size:12px;margin:0;">My Modules → Add Module → YouTube Agent → Connect YouTube</p>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">3</div>
            <div>
              <p style="color:#e5e5e5;font-size:13px;font-weight:600;margin:0 0 4px;">Enter your niche</p>
              <p style="color:#a3a3a3;font-size:12px;margin:0;">e.g. "dark psychology", "personal finance UAE", "fitness motivation"</p>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">4</div>
            <div>
              <p style="color:#e5e5e5;font-size:13px;font-weight:600;margin:0 0 4px;">Click Run Now</p>
              <p style="color:#a3a3a3;font-size:12px;margin:0;">Your first video uploads in 20-40 minutes. Cost: ~$3-5</p>
            </div>
          </div>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/modules" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Get Started Now →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `Your first AI video — here's exactly how`, html);
  }

  // ── Day 7 — YouTube growth tips ──────────────────────────
  async sendDay7Email(user: { name: string; email: string }): Promise<void> {
    const html = this.base(`
      <div style="padding:40px 36px;">
        <div style="font-size:48px;margin-bottom:12px;text-align:center;">📈</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;text-align:center;">5 tips to grow your AI YouTube channel</h1>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${user.name || 'there'}, you've been on LogicMate for a week. Here are 5 tips from our experience running AI YouTube channels:</p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;margin:0 0 28px;">
          <p style="color:#a78bfa;font-size:13px;font-weight:600;margin:0 0 16px;">💡 Top 5 growth tips:</p>
          <p style="color:#a3a3a3;font-size:13px;line-height:2;margin:0;">
            1. <strong style="color:#e5e5e5;">Pick a specific niche</strong> — "dark psychology" beats "psychology" every time<br/>
            2. <strong style="color:#e5e5e5;">Upload daily</strong> — consistency is the #1 growth factor on YouTube<br/>
            3. <strong style="color:#e5e5e5;">Check your Shorts</strong> — 3 Shorts upload with every video, promote them too<br/>
            4. <strong style="color:#e5e5e5;">Watch your CTR</strong> — if below 4%, try a different niche prompt<br/>
            5. <strong style="color:#e5e5e5;">Be patient</strong> — most channels see real growth after 60-90 days of daily uploads
          </p>
        </div>
        <div style="background:#0d1a0d;border:1px solid #1a3a1a;border-radius:10px;padding:16px;margin:0 0 28px;">
          <p style="color:#22c55e;font-size:13px;font-weight:600;margin:0 0 8px;">📊 Real results from Knowledge Truth (runs on LogicMate):</p>
          <p style="color:#a3a3a3;font-size:13px;line-height:1.8;margin:0;">
            Cost per video: ~$3-5 · Daily uploads · 20+ videos generated
          </p>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">View my dashboard →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `5 tips to grow your AI YouTube channel faster`, html);
  }

  // ── 7. Password Reset ─────────────────────────────────────
  async sendPasswordResetEmail(user: { name: string; email: string }, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/reset-password?token=${resetToken}`;
    const html = this.base(`
      <div style="padding:40px 36px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🔐</div>
        <h1 style="color:#e5e5e5;font-size:22px;font-weight:700;margin:0 0 8px;">Reset Your Password</h1>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${user.name || 'there'}, click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Reset Password →</a>
        <p style="color:#525252;font-size:13px;margin:24px 0 0;">If you didn't request this, ignore this email.</p>
      </div>
    `);
    await this.send(user.email, '🔐 Reset your LogicMate password', html);
  }

  // ── 8. Payment Success ────────────────────────────────────
  async sendPaymentSuccessEmail(user: { name: string; email: string }, data: {
    plan: string; amount: number; nextBillingDate?: string;
  }): Promise<void> {
    const html = this.base(`
      <div style="background:linear-gradient(135deg,rgba(34,197,94,0.1),rgba(34,197,94,0.05));padding:32px 36px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <h1 style="color:#22c55e;font-size:22px;font-weight:700;margin:0 0 8px;">Payment Successful!</h1>
        <p style="color:#737373;font-size:14px;margin:0;">${data.plan} Plan</p>
      </div>
      <div style="padding:28px 36px;">
        <div style="background:#1a1a1a;border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
          <p style="color:#737373;font-size:12px;margin:0 0 4px;">Amount charged</p>
          <p style="color:#22c55e;font-size:28px;font-weight:700;margin:0;">$${data.amount.toFixed(2)}</p>
          ${data.nextBillingDate ? `<p style="color:#525252;font-size:12px;margin:8px 0 0;">Next billing: ${data.nextBillingDate}</p>` : ''}
        </div>
        <p style="color:#a3a3a3;font-size:14px;line-height:1.6;margin:0 0 24px;">Thank you for subscribing to LogicMate! Your agents are now active and running.</p>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Go to Dashboard →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `✅ Payment confirmed — ${data.plan} Plan`, html);
    await this.send(this.adminEmail, `[LogicMate] Payment: ${user.name} subscribed to ${data.plan} ($${data.amount})`,
      `<p style="font-family:sans-serif;padding:20px;">Payment received:<br><strong>${user.name}</strong> (${user.email})<br>Plan: ${data.plan}<br>Amount: $${data.amount}<br>${new Date().toISOString()}</p>`);
  }

  // ── 9. Payment Failed ─────────────────────────────────────
  async sendPaymentFailedEmail(user: { name: string; email: string }, data: {
    plan: string; amount: number; reason?: string;
  }): Promise<void> {
    const html = this.base(`
      <div style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05));padding:32px 36px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <h1 style="color:#ef4444;font-size:22px;font-weight:700;margin:0 0 8px;">Payment Failed</h1>
        <p style="color:#737373;font-size:14px;margin:0;">${data.plan} Plan · $${data.amount}</p>
      </div>
      <div style="padding:28px 36px;">
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 20px;">Hi ${user.name || 'there'}, we couldn't process your payment${data.reason ? `: ${data.reason}` : '.'}. Please update your payment method to keep your agents running.</p>
        <div style="text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/dashboard/payment-instructions" style="display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">View Payment Instructions →</a>
        </div>
      </div>
    `);
    await this.send(user.email, `⚠️ Payment failed — action required`, html);
    await this.send(this.adminEmail, `[LogicMate] Payment FAILED: ${user.name} (${data.plan})`,
      `<p style="font-family:sans-serif;padding:20px;">Payment failed:<br><strong>${user.name}</strong> (${user.email})<br>Plan: ${data.plan}<br>Reason: ${data.reason || 'unknown'}</p>`);
  }

  // ── 10. Admin Alert ───────────────────────────────────────
  async sendAdminAlert(subject: string, message: string): Promise<void> {
    await this.send(this.adminEmail, `[LogicMate Admin] ${subject}`,
      `<div style="font-family:sans-serif;padding:20px;background:#111;color:#e5e5e5;">
        <h2 style="color:#a78bfa;">LogicMate Admin Alert</h2>
        <p>${message}</p>
        <p style="color:#525252;font-size:12px;">${new Date().toISOString()}</p>
      </div>`);
  }

  async sendVerificationEmail(user: { name: string; email: string }, token: string): Promise<void> {
    const verifyUrl = `${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/verify-email?token=${token}`;
    const html = this.base(`
      <div style="padding:40px 36px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">✉️</div>
        <h1 style="color:#e5e5e5;font-size:24px;font-weight:700;margin:0 0 8px;">Verify your email</h1>
        <p style="color:#737373;font-size:15px;margin:0 0 28px;">One click to activate your LogicMate account</p>
        <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 32px;">
          Hi ${user.name}, click the button below to verify your email address and start automating your content.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;text-decoration:none;padding:16px 40px;border-radius:10px;font-weight:700;font-size:16px;letter-spacing:-0.01em;">
          Verify Email Address →
        </a>
        <p style="color:#525252;font-size:13px;margin:28px 0 0;">
          This link expires in 24 hours. If you didn't create an account, ignore this email.
        </p>
        <p style="color:#333;font-size:12px;margin:16px 0 0;word-break:break-all;">
          Or copy this link: ${verifyUrl}
        </p>
      </div>
    `);
    await this.send(user.email, '✉️ Verify your LogicMate email address', html);
  }
}