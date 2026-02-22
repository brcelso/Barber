import { json } from '../utils/index.js';
import { handleAdminFlow } from './adminHandler.js';
import { handleClientFlow } from './clientHandler.js';

export async function handleWhatsAppWebhook(request, env) {
    const body = await request.json();
    const from = body.phone?.replace(/\D/g, ""); // Clean phone
    const text = (body.message || "").trim();
    const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const botBarberEmail = body.barber_email;
    const isSelfChat = body.is_self_chat === true;

    if (!from) return json({ error: "Missing phone" }, 400);

    // 1. Identify User and Session
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();
    let userInDb = null;

    if (!session || !session.user_email) {
        const allUsers = await env.DB.prepare('SELECT email, phone FROM users WHERE phone IS NOT NULL').all();
        const cleanFrom = from.replace(/\D/g, "");
        userInDb = allUsers.results.find(u => {
            const cleanU = (u.phone || "").replace(/\D/g, "");
            return cleanU && (cleanU.endsWith(cleanFrom) || cleanFrom.endsWith(cleanU));
        });
    }

    // 2. Privilege Check (Admin/Barber)
    let isOwner = false;
    let adminInfo = null;
    const cleanFrom = from.replace(/\D/g, "");

    // Stricter phone comparison for Brazil (DDD + Number)
    const isSamePhone = (p1, p2) => {
        if (!p1 || !p2) return false;
        const s1 = p1.replace(/\D/g, "");
        const s2 = p2.replace(/\D/g, "");
        if (s1 === s2) return true;
        if (s1.length >= 10 && s2.length >= 10) {
            return s1.slice(-10) === s2.slice(-10);
        }
        return false;
    };

    if (botBarberEmail) {
        adminInfo = await env.DB.prepare(
            'SELECT email, name, phone, is_barber, is_admin, shop_name, bot_name, bot_tone FROM users WHERE email = ?'
        ).bind(botBarberEmail).first();
    }

    // If it's a self chat or the phone matches the botBarberEmail's phone, it's the owner
    if (isSelfChat || (adminInfo && isSamePhone(adminInfo.phone, cleanFrom))) {
        isOwner = true;
        // If we don't have adminInfo yet (self-chat without barber_email), try to find it by phone
        if (!adminInfo) {
            adminInfo = await env.DB.prepare(
                'SELECT email, name, phone, is_barber, is_admin, shop_name, bot_name, bot_tone FROM users WHERE phone LIKE ? AND (is_barber = 1 OR is_admin = 1)'
            ).bind(`%${cleanFrom.slice(-10)}`).first();

            // Fallback Admin Fixo (Celso)
            if (!adminInfo && (cleanFrom.endsWith('983637172') || cleanFrom.endsWith('942125134'))) {
                adminInfo = await env.DB.prepare('SELECT * FROM users WHERE email = "celsosilvajunior90@gmail.com"').first();
            }
        }
    }

    // Se identificou como dono mas não achou adminInfo, tenta pegar o admin padrão pelo e-mail
    if (isOwner && !adminInfo && botBarberEmail) {
        adminInfo = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(botBarberEmail).first();
    }

    // 3. Routing
    if (isOwner && adminInfo) {
        return await handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env);
    } else {
        return await handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env);
    }
}
