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

    const cleanFrom = from.replace(/\D/g, "");

    // Function to compare phone numbers by matching their last 9 digits (common in BR mobile) or exact match
    const isSamePhone = (p1, p2) => {
        if (!p1 || !p2) return false;
        const s1 = p1.replace(/\D/g, "");
        const s2 = p2.replace(/\D/g, "");
        if (s1 === s2) return true;
        const tail = Math.min(s1.length, s2.length, 9);
        return s1.slice(-tail) === s2.slice(-tail);
    };

    if (botBarberEmail) {
        const barberRow = await env.DB.prepare(
            'SELECT email, name, phone, is_barber, is_admin, shop_name, bot_name, bot_tone FROM users WHERE email = ?'
        ).bind(botBarberEmail).first();

        if (barberRow && (barberRow.is_barber === 1 || barberRow.is_admin === 1) && isSamePhone(barberRow.phone, cleanFrom)) {
            isOwner = true;
            adminInfo = barberRow;
        }
    }

    if (!isOwner) {
        const adminCheck = await env.DB.prepare(
            'SELECT email, name, phone, is_barber, is_admin, shop_name, bot_name, bot_tone FROM users WHERE (is_admin = 1 OR is_barber = 1) AND phone IS NOT NULL'
        ).all();

        const matched = adminCheck.results.find(u => isSamePhone(u.phone, cleanFrom));
        if (matched) {
            isOwner = true;
            adminInfo = matched;
        }
    }

    console.log(`[WhatsApp Webhook] From: ${from} | isOwner: ${isOwner} | Admin: ${adminInfo?.email || 'none'}`);

    // 3. Routing
    if (isOwner && adminInfo) {
        return await handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env);
    } else {
        return await handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env);
    }
}
