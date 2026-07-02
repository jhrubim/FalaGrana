import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_KEY) {
      console.error('RESEND_API_KEY não configurado');
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Em produção, troque para um domínio verificado no Resend.
        // Em modo de teste, o Resend permite 'onboarding@resend.dev' somente para o e-mail do dono da conta.
        from: 'FalaGrana Security <onboarding@resend.dev>',
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
              Se não foi você, considere alterar sua senha imediatamente pelo Supabase Dashboard.
            </p>
          </div>
        `,
      }),
    });

    const body = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, data: body }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
