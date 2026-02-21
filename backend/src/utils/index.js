/**
 * Utility functions for Barber App Server
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

export const sendMessage = async (env, phone, message, barberEmail, bridgeUrlOverride = null) => {
    let BRIDGE_URL = bridgeUrlOverride;

    if (!BRIDGE_URL && barberEmail && env.DB) {
        try {
            const user = await env.DB.prepare('SELECT wa_bridge_url, owner_id FROM users WHERE email = ?').bind(barberEmail).first();
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
        console.log(`[WhatsApp Bot] Bridge not set. MSG: ${message} (Target: ${phone})`);
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
                barber_email: barberEmail
            })
        });
    } catch (e) {
        console.error('[Bot Send Error]', e.message, 'URL:', BRIDGE_URL);
    }
};

export const notifyWhatsApp = async (env, DB, appointmentId, status, options = {}) => {
    const BRIDGE_KEY = env.WA_BRIDGE_KEY;

    try {
        let appt = null;
        if (appointmentId) {
            appt = await DB.prepare(`
                SELECT a.*, s.name as service_name, u.phone, u.name as user_name, b.name as barber_name, 
                       b.welcome_message, b.business_type, b.bot_name
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                JOIN users u ON a.user_email = u.email
                LEFT JOIN users b ON a.barber_email = b.email
                WHERE a.id = ?
            `).bind(appointmentId).first();
        } else if (options.to) {
            appt = { phone: options.to, barber_email: options.barberEmail };
        }

        if (!appt || !appt.phone) return;

        const barberEmail = appt.barber_email || options.barberEmail || getMasterEmail(env);
        const barberUser = await DB.prepare('SELECT subscription_expires, owner_id, wa_bridge_url FROM users WHERE email = ?').bind(barberEmail).first();

        let expiresStr = barberUser?.subscription_expires;
        let bridgeUrl = barberUser?.wa_bridge_url;

        // INHERITANCE: If staff, use owner's subscription and bridge
        if (barberUser?.owner_id) {
            const owner = await DB.prepare('SELECT subscription_expires, wa_bridge_url FROM users WHERE email = ?').bind(barberUser.owner_id).first();
            expiresStr = owner?.subscription_expires;
            if (!bridgeUrl) bridgeUrl = owner?.wa_bridge_url;
        }

        const now = new Date();
        let expires = expiresStr ? new Date(expiresStr) : null;

        // MASTER PRIVILEGE: Master is always active
        if (barberEmail === getMasterEmail(env)) {
            expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // 1 year fake buffer
        }

        if (!expires || expires < now) {
            console.log(`[WhatsApp] AVISO: Assinatura do barbeiro ${barberEmail} (ou seu dono) vencida.`);
            return;
        }

        let message = "";
        let formattedDate = "";
        if (appt.appointment_date) {
            const dateParts = appt.appointment_date.split('-');
            formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        }

        if (status === 'confirmed') {
            const template = appt.welcome_message || `✅ *Agendamento Confirmado!* \n\nOlá {{user_name}}, seu horário para *{{service_name}}* com {{barber_name}} no dia *{{date}}* às *{{time}}* foi confirmado. \n\nTe esperamos lá! ✂️`;
            message = template
                .replace(/{{user_name}}/g, appt.user_name)
                .replace(/{{service_name}}/g, appt.service_name)
                .replace(/{{barber_name}}/g, appt.barber_name || 'Profissional')
                .replace(/{{date}}/g, formattedDate)
                .replace(/{{time}}/g, appt.appointment_time);
        } else if (status === 'cancelled') {
            message = `❌ *Agendamento Cancelado* \n\nOlá ${appt.user_name}, informamos que o agendamento para *${appt.service_name}* com *${appt.barber_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi cancelado.`;
        } else if (status === 'pending') {
            message = `⏳ *Agendamento Recebido* \n\nOlá ${appt.user_name}, seu agendamento para *${appt.service_name}* com *${appt.barber_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi recebido e está sendo processado.`;
        } else if (status === 'custom') {
            message = options.message;
        }

        if (message) {
            await sendMessage(env, appt.phone, message, barberEmail, bridgeUrl);
        }
    } catch (e) {
        console.error('[WhatsApp Notify Error]', e);
    }
};
