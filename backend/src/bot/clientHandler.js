import { json, sendMessage } from '../utils/index.js';
import { CLIENT_PROMPTS } from './prompts.js';
import { runAgentChat } from './agent.js';

export async function handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const isMenuCommand = ['menu', 'oi', 'ola', 'voltar', 'inicio', 'ajuda'].includes(textLower);

    // 1. Fluxo de Boas-vindas e Reset de Sessão
    if (!session || isMenuCommand) {
        const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);
        const b = await env.DB.prepare('SELECT email, name, shop_name, business_type, msg_welcome, msg_choose_barber FROM users WHERE email = ?').bind(botBarberEmail).first();

        if (!b) return json({ error: "Barbeiro não encontrado" }, 404);
        const establishmentName = b.shop_name || b.name;

        // Se houver equipe, pede para selecionar o barbeiro primeiro
        if (b.business_type === 'barbearia') {
            const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
            if (team.results.length > 1) {
                await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();
                let msg = b.msg_choose_barber || CLIENT_PROMPTS.choose_barber(establishmentName);
                team.results.forEach((m, i) => { msg += `*${i + 1}* - ${m.name}\n`; });
                await sendMessage(env, from, msg, botBarberEmail);
                return json({ success: true });
            }
        }

        // Sessão padrão no Agente IA (Direto)
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "ai_chat", ?, ?)').bind(from, userEmail, b.email).run();
        const msg = (b.msg_welcome || CLIENT_PROMPTS.ai_welcome).replace(/{{establishment_name}}/g, establishmentName);
        await sendMessage(env, from, msg, botBarberEmail);
        return json({ success: true });
    }

    // 2. Seleção de Barbeiro (Caso de Equipe)
    if (session.state === 'awaiting_barber' && isNumericChoice) {
        const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
        const b = team.results[parseInt(text) - 1];
        if (b) {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat", selected_barber_email = ? WHERE phone = ?').bind(b.email, from).run();
            await sendMessage(env, from, `✅ Você está falando com o assistente de *${b.name}*.\nComo posso te ajudar hoje?`, botBarberEmail);
        }
        return json({ success: true });
    }

    // 3. INTERCEPTAÇÃO AGÊNTICA (IA) - TODO FLUXO PASSA POR AQUI
    try {
        const barberEmail = session.selected_barber_email || botBarberEmail;
        const barber = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(barberEmail).first();
        const services = await env.DB.prepare('SELECT name, price FROM services WHERE barber_email = ? AND id != "block"').bind(barberEmail).all();

        const barberContext = {
            establishmentName: barber?.shop_name || barber?.name || 'Barbearia',
            bName: barber?.bot_name || 'Leo',
            bTone: barber?.bot_tone || 'amigável',
            servicesList: services.results.map(s => `✂️ ${s.name}: R$ ${s.price}`).join('\n')
        };

        const aiData = await runAgentChat(env, {
            prompt: text,
            email: userInDb?.email || 'guest',
            isAdmin: false,
            barberContext: barberContext
        });

        const aiMsg = aiData.text || "Ops, tive um probleminha aqui. Pode perguntar de novo?";
        await sendMessage(env, from, aiMsg, botBarberEmail);
        return json({ success: true });

    } catch (e) {
        console.error('[Client AI Error]', e);
        await sendMessage(env, from, "Tive um probleminha em processar sua mensagem. Como posso ajudar?", botBarberEmail);
        return json({ success: true });
    }
}