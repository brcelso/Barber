/**
 * Utility functions for Universal Scheduler App Server
 * Suporte Multi-Nicho: Barbearia, Petshop, Clínicas, etc.
 */

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Email',
};

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

export const MASTER_EMAIL = 'celsosilvajunior90@gmail.com';

export const getMasterEmail = (env) => env.SUPER_ADMIN_EMAIL || MASTER_EMAIL;

/**
 * Envia uma mensagem via WhatsApp usando a Bridge configurada do provedor.
 * @param {object} env - Ambiente Cloudflare
 * @param {string} phone - Número do destinatário
 * @param {string} message - Texto da mensagem
 * @param {string} providerEmail - E-mail do profissional/unidade (antigo barberEmail)
 * @param {string} bridgeUrlOverride - URL opcional para sobrescrever a busca
 */
export const sendMessage = async (env, phone, message, providerEmail, bridgeUrlOverride = null) => {
    let BRIDGE_URL = bridgeUrlOverride;

    // Busca dinâmica da Bridge vinculada ao profissional ou ao dono da unidade
    if (!BRIDGE_URL && providerEmail && env.DB) {
        try {
            const user = await env.DB.prepare('SELECT wa_bridge_url, owner_id FROM users WHERE email = ?').bind(providerEmail).first();
            BRIDGE_URL = user?.wa_bridge_url;
            if (!BRIDGE_URL && user?.owner_id) {
                const owner = await env.DB.prepare('SELECT wa_bridge_url FROM users WHERE email = ?').bind(user.owner_id).first();
                BRIDGE_URL = owner?.wa_bridge_url;
            }
        } catch (e) {
            console.error('[Bridge Lookup Error]', e.message);
        }
    }

    if (!BRIDGE_URL) BRIDGE_URL = env.WA_BRIDGE_URL;
    const BRIDGE_KEY = env.WA_BRIDGE_KEY;

    if (!BRIDGE_URL || !BRIDGE_KEY) {
        console.log(`[WhatsApp Bot] Bridge não configurada. MSG: ${message} (Destino: ${phone})`);
        return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

    try {
        await fetch(`${BRIDGE_URL}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: BRIDGE_KEY,
                number: finalPhone,
                message: message,
                professional_email: providerEmail,
                barber_email: providerEmail
            })
        });
    } catch (e) {
        console.error('[Bot Send Error]', e.message, 'URL:', BRIDGE_URL);
    }
};

/**
 * Notifica o cliente sobre o status de um agendamento.
 */
export const notifyWhatsApp = async (env, DB, appointmentId, status, options = {}) => {
    try {
        let appt = null;
        if (appointmentId) {
            appt = await DB.prepare(`
                SELECT a.*, s.name as service_name, u.phone, u.name as user_name, pr.name as professional_name, 
                       pr.welcome_message, pr.business_type, pr.bot_name
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                JOIN users u ON a.user_email = u.email
                LEFT JOIN users pr ON a.barber_email = pr.email
                WHERE a.id = ?
            `).bind(appointmentId).first();
        } else if (options.to) {
            appt = { phone: options.to, barber_email: options.providerEmail };
        }

        if (!appt || !appt.phone) return;

        const providerEmail = appt.barber_email || options.providerEmail || getMasterEmail(env);
        const providerUser = await DB.prepare('SELECT subscription_expires, owner_id, wa_bridge_url FROM users WHERE email = ?').bind(providerEmail).first();

        let expiresStr = providerUser?.subscription_expires;
        let bridgeUrl = providerUser?.wa_bridge_url;

        // Herança: Se for staff, usa a assinatura e bridge do dono
        if (providerUser?.owner_id) {
            const owner = await DB.prepare('SELECT subscription_expires, wa_bridge_url FROM users WHERE email = ?').bind(providerUser.owner_id).first();
            expiresStr = owner?.subscription_expires;
            if (!bridgeUrl) bridgeUrl = owner?.wa_bridge_url;
        }

        const now = new Date();
        let expires = expiresStr ? new Date(expiresStr) : null;

        // Privilégio Master: Celso sempre ativo
        if (providerEmail === getMasterEmail(env)) {
            expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365);
        }

        if (!expires || expires < now) {
            console.log(`[WhatsApp] AVISO: Assinatura do provedor ${providerEmail} vencida.`);
            return;
        }

        let message = "";
        let formattedDate = "";
        if (appt.appointment_date) {
            const dateParts = appt.appointment_date.split('-');
            formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        }

        const bizType = appt.business_type || 'default';
        const defaultIcon = (bizType === 'barbearia' || bizType === 'default') ? '✂️' : (bizType === 'petshop' ? '🐾' : '🗓️');

        if (status === 'confirmed') {
            const template = appt.welcome_message || `✅ *Agendamento Confirmado!* \n\nOlá {{user_name}}, seu horário para *{{service_name}}* com {{professional_name}} no dia *{{date}}* às *{{time}}* foi confirmado. \n\nTe esperamos lá! ${defaultIcon}`;
            message = template
                .replace(/{{user_name}}/g, appt.user_name)
                .replace(/{{service_name}}/g, appt.service_name)
                .replace(/{{professional_name}}/g, appt.professional_name || 'Profissional')
                .replace(/{{date}}/g, formattedDate)
                .replace(/{{time}}/g, appt.appointment_time);
        } else if (status === 'cancelled') {
            message = `❌ *Agendamento Cancelado* \n\nOlá ${appt.user_name}, informamos que o agendamento para *${appt.service_name}* com *${appt.professional_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi cancelado.`;
        } else if (status === 'pending') {
            message = `⏳ *Agendamento Recebido* \n\nOlá ${appt.user_name}, seu agendamento para *${appt.service_name}* com *${appt.professional_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi recebido e está aguardando confirmação.`;
        } else if (status === 'custom') {
            message = options.message;
        }

        if (message) {
            await sendMessage(env, appt.phone, message, providerEmail, bridgeUrl);
        }
    } catch (e) {
        console.error('[WhatsApp Notify Error]', e);
    }
};
