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

    if (botBarberEmail) {
        const barberRow = await env.DB.prepare(
            'SELECT email, name, phone, is_barber, is_admin FROM users WHERE email = ?'
        ).bind(botBarberEmail).first();

        if (barberRow && (barberRow.is_barber === 1 || barberRow.is_admin === 1) && barberRow.phone) {
            const barberPhone = (barberRow.phone || '').replace(/\D/g, '');
            const tail = Math.min(barberPhone.length, 9);
            const barberTail = barberPhone.slice(-tail);
            const fromTail = from.slice(-tail);
            if (barberTail === fromTail) {
                isOwner = true;
                adminInfo = barberRow;
            }
        }
    }

    if (!isOwner) {
        const adminCheck = await env.DB.prepare(
            'SELECT email, name, is_barber, is_admin FROM users WHERE phone LIKE ? OR phone = ?'
        ).bind(`%${from.slice(-8)}`, from).first();
        if (adminCheck && (adminCheck.is_barber === 1 || adminCheck.is_admin === 1)) {
            isOwner = true;
            adminInfo = adminCheck;
        }
    }

    // 3. Routing
    if (isOwner && adminInfo) {
        return await handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env);
    } else {
        return await handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env);
    }
}
