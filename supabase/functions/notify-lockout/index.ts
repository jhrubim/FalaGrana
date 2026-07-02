import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.7';

const ALERT_TO = 'jhrubim@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { email, timestamp } = await req.json();

    const GMAIL_USER = Deno.env.get('GMAIL_USER');
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error('GMAIL_USER ou GMAIL_APP_PASSWORD não configurados');
      return new Response(JSON.stringify({ ok: false, error: 'not_configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dataFormatada = new Date(timestamp).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"FalaGrana Security" <${GMAIL_USER}>`,
      to: ALERT_TO,
      subject: '⚠️ Alerta de Segurança — FalaGrana',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0d1117;color:#e6edf3;border-radius:12px;">
          <h2 style="color:#f6c453;margin-top:0;">⚠️ Tentativas de login bloqueadas</h2>
          <p>Foram detectadas <strong>5 tentativas de login incorretas</strong> seguidas no FalaGrana.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="color:#7d8590;padding:6px 0;">Conta alvo:</td>
              <td style="color:#e6edf3;font-weight:600;">${email}</td>
            </tr>
            <tr>
              <td style="color:#7d8590;padding:6px 0;">Horário:</td>
              <td style="color:#e6edf3;">${dataFormatada} (horário de Brasília)</td>
            </tr>
            <tr>
              <td style="color:#7d8590;padding:6px 0;">Bloqueio:</td>
              <td style="color:#4ade80;">10 minutos</td>
            </tr>
          </table>
          <p style="color:#7d8590;font-size:13px;">
            Se não foi você, considere alterar sua senha imediatamente.
          </p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
