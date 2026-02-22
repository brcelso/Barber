import { json, sendMessage } from '../utils/index.js';
import { CLIENT_PROMPTS } from './prompts.js';
import { runAgentChat } from './agent.js';

export async function handleClientFlow(from, text, textLower, session, userInDb, botProfessionalEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const isMenuCommand = ['menu', 'oi', 'ola', 'voltar', 'inicio', 'ajuda'].includes(textLower);

    // 1. Fluxo de Boas-vindas e Reset de Sessão
    if (!session || isMenuCommand) {
        const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);
        const b = await env.DB.prepare('SELECT email, name, shop_name, business_type, msg_welcome, msg_choose_professional FROM users WHERE email = ?').bind(botProfessionalEmail).first();

        if (!b) return json({ error: "Profissional não encontrado" }, 404);
        const establishmentName = b.shop_name || b.name;

        // Se houver equipe, pede para selecionar o profissional primeiro
        if (b.business_type === 'barbearia' || b.business_type === 'default') {
            const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botProfessionalEmail, botProfessionalEmail).all();
            if (team.results.length > 1) {
                await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_professional", ?)').bind(from, userEmail).run();
                let msg = b.msg_choose_professional || CLIENT_PROMPTS.choose_professional(b);
                team.results.forEach((m, i) => { msg += `*${i + 1}* - ${m.name}\n`; });
                await sendMessage(env, from, msg, botProfessionalEmail);
                return json({ success: true });
            }
        }

        // Sessão padrão no Agente IA (Direto)
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "ai_chat", ?, ?)').bind(from, userEmail, b.email).run();
        const msg = (b.msg_welcome || CLIENT_PROMPTS.ai_welcome(b)).replace(/{{establishment_name}}/g, establishmentName);
        await sendMessage(env, from, msg, botProfessionalEmail);
        return json({ success: true });
    }

    // 2. Seleção de Profissional (Caso de Equipe)
    if (session.state === 'awaiting_professional' && isNumericChoice) {
        const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botProfessionalEmail, botProfessionalEmail).all();
        const b = team.results[parseInt(text) - 1];
        if (b) {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat", selected_barber_email = ? WHERE phone = ?').bind(b.email, from).run();
            await sendMessage(env, from, `✅ Você está falando com o assistente de *${b.name}*.\nComo posso te ajudar hoje?`, botProfessionalEmail);
        }
        return json({ success: true });
    }

    // 3. INTERCEPTAÇÃO AGÊNTICA (IA) - TODO FLUXO PASSA POR AQUI
    try {
        const professionalEmail = session.selected_barber_email || botProfessionalEmail;
        const professional = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(professionalEmail).first();

        // 🛡️ Verificar se o bot está ativo
        if (professional?.bot_active === 0) {
            console.log(`[Bot] IA Desativada para ${professionalEmail}. Ignorando resposta automática.`);
            return json({ success: true, bot_active: false });
        }

        const services = await env.DB.prepare('SELECT id, name, price FROM services WHERE barber_email = ? AND id != "block"').bind(professionalEmail).all();

        const professionalContext = {
            establishmentName: professional?.shop_name || professional?.name || 'Estabelecimento',
            professionalEmail: professionalEmail,
            business_type: professional?.business_type || 'default',
            bName: professional?.bot_name || 'Leo',
            bTone: professional?.bot_tone || 'amigável',
            servicesList: services.results.map(s => `📍 [ID: ${s.id}] ${s.name}: R$ ${s.price.toFixed(2)}`).join('\n')
        };

        const aiData = await runAgentChat(env, {
            prompt: text,
            userEmail: userInDb?.email || session?.user_email || 'guest',
            isAdmin: false,
            professionalContext: professionalContext
        });

        const aiMsg = aiData.text || "Ops, tive um probleminha aqui. Pode perguntar de novo?";
        await sendMessage(env, from, aiMsg, botProfessionalEmail);
        return json({ success: true });

    } catch (e) {
        console.error('[Client AI Error]', e);
        await sendMessage(env, from, "Tive um probleminha em processar sua mensagem. Como posso ajudar?", botProfessionalEmail);
        return json({ success: true });
    }
}