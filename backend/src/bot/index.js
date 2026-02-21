import { json } from '../utils/index.js';
import { handleAdminFlow } from './adminHandler.js';
import { handleClientFlow } from './clientHandler.js';

export async function handleWhatsAppWebhook(request, env) {
    const body = await request.json();
    const from = body.phone?.replace(/\D/g, ""); // Clean phone
    const text = (body.message || "").trim();
    const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const botBarberEmail = body.barber_email;

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
    const isSelfChat = body.is_self_chat === true;

    const cleanFrom = from.replace(/\D/g, "");

    // Stricter phone comparison for Brazil (DDD + Number)
    const isSamePhone = (p1, p2) => {
        if (!p1 || !p2) return false;
        const s1 = p1.replace(/\D/g, "");
        const s2 = p2.replace(/\D/g, "");
        if (s1 === s2) return true;
        // Compare last 10 digits (DDD + 8 digits) or 11 (DDD + 9 digits)
        if (s1.length >= 10 && s2.length >= 10) {
            return s1.slice(-10) === s2.slice(-10);
        }
        return false;
    };

    if (botBarberEmail) {
        const barberRow = await env.DB.prepare(
            'SELECT email, name, phone, is_barber, is_admin, shop_name, bot_name, bot_tone FROM users WHERE email = ?'
        ).bind(botBarberEmail).first();

        // Check if the sender is the barber/owner of this bot
        const isActuallyTheOwner = barberRow && (barberRow.is_barber === 1 || barberRow.is_admin === 1) && isSamePhone(barberRow.phone, cleanFrom);

        if (isActuallyTheOwner || isSelfChat) {
            isOwner = true;
            adminInfo = barberRow;
        }
    }

    // 3. Routing
    if (isOwner && adminInfo) {
        return await handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env);
    } else {
        return await handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env);
    }
}
