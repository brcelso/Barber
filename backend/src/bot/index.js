import { json } from '../utils/index.js';
import { handleAdminFlow } from './adminHandler.js';
import { handleClientFlow } from './clientHandler.js';
import { handleRegistrationFlow } from './registrationHandler.js';

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

    // 2. Identificar se existe sessão
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

    // 3. Roteamento de Registro (Novos Profissionais)
    const registrationTriggers = ['quero ser parceiro', 'quero usar o sistema', 'cadastro profissional', 'criar conta', 'registrar'];
    const isRegistrationTrigger = registrationTriggers.some(t => textLower.includes(t));
    const isRegistrationSession = session?.state?.startsWith('reg_');

    if ((isRegistrationTrigger || isRegistrationSession) && !senderInfo) {
        return await handleRegistrationFlow(from, text, textLower, session, env);
    }

    // 4. Fluxo de Usuários Existentes (Admin/Profissional)
    if (senderInfo && (senderInfo.is_admin === 1 || senderInfo.is_barber === 1)) {
        return await handleAdminFlow(from, text, textLower, senderInfo, botProfessionalEmail, env);
    } else {
        // Caso contrário, trata como cliente normal
        let userInDb = await env.DB.prepare('SELECT * FROM users WHERE phone LIKE ?').bind(`%${last8}`).first();

        // Se o cliente não existe, criar perfil básico para evitar erro de FK
        if (!userInDb) {
            const guestEmail = `guest_${from}@whatsapp.com`;
            await env.DB.prepare('INSERT OR IGNORE INTO users (email, name, phone, is_admin, is_barber) VALUES (?, ?, ?, 0, 0)')
                .bind(guestEmail, `Cliente ${from}`, from).run();
            userInDb = { email: guestEmail, phone: from, name: `Cliente ${from}` };
        }

        return await handleClientFlow(from, text, textLower, session, userInDb, botProfessionalEmail, env);
    }
}
