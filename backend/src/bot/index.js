import { json } from '../utils/index.js';
import { handleAdminFlow } from './adminHandler.js';
import { handleClientFlow } from './clientHandler.js';

export async function handleWhatsAppWebhook(request, env) {
    console.log('[Webhook] Recibido POST');
    const body = await request.json();

    const from = body.phone?.replace(/\D/g, ""); // Telefone de quem enviou
    const text = (body.message || "").trim();
    const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const botProfessionalEmail = body.professional_email || body.barber_email; // E-mail da unidade/bot que recebeu
    const isSelfChat = body.is_self_chat === true;

    if (!from) return json({ error: "Missing phone" }, 400);

    const cleanFrom = from.replace(/\D/g, "");
    const last8 = cleanFrom.slice(-8);
    const ddd = cleanFrom.length >= 10 ? cleanFrom.slice(-11, -9) : "";

    // 1. Identificar o Usuário no Banco (Quem está falando?)
    // Busca por um usuário que tenha esse telefone (Admin ou Profissional)
    let senderInfo = await env.DB.prepare(
        'SELECT * FROM users WHERE phone LIKE ? AND (is_admin = 1 OR is_barber = 1)'
    ).bind(`%${ddd}%${last8}`).first();

    // Se é Self-Chat e não achou pelo telefone, usa o dono da sessão (botProfessionalEmail)
    if (!senderInfo && (isSelfChat || cleanFrom.includes('983637172')) && botProfessionalEmail) {
        senderInfo = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(botProfessionalEmail).first();
    }

    // Se ainda assim não achou o Celso (Master)
    if (!senderInfo && (cleanFrom.endsWith('983637172') || cleanFrom.endsWith('942125134'))) {
        senderInfo = await env.DB.prepare('SELECT * FROM users WHERE email = "celsosilvajunior90@gmail.com"').first();
    }

    // 2. Identificar se existe sessão ou usuário cliente comum (para o handleClientFlow)
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();
    let userInDb = null;
    if (!session) {
        userInDb = await env.DB.prepare('SELECT * FROM users WHERE phone LIKE ?').bind(`%${last8}`).first();
    }

    // 3. Roteamento: Se o REMETENTE for da equipe (Admin/Profissional), vai pro AdminFlow
    if (senderInfo && (senderInfo.is_admin === 1 || senderInfo.is_barber === 1)) {
        return await handleAdminFlow(from, text, textLower, senderInfo, botProfessionalEmail, env);
    } else {
        // Caso contrário, trata como cliente normal
        return await handleClientFlow(from, text, textLower, session, userInDb, botProfessionalEmail, env);
    }
}
