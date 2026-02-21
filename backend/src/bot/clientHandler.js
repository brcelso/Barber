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

        // Sessão padrão no Menu Principal
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
        const msg = (b.msg_welcome || CLIENT_PROMPTS.main_menu(establishmentName)).replace(/{{establishment_name}}/g, establishmentName);
        await sendMessage(env, from, msg, botBarberEmail);
        return json({ success: true });
    }

    const criticalStates = ['awaiting_barber', 'awaiting_service', 'awaiting_date', 'awaiting_time', 'awaiting_name', 'awaiting_email', 'awaiting_confirmation'];

    // 2. INTERCEPTAÇÃO AGÊNTICA (IA)
    // Se o cliente digitar texto livre ou estiver no estado de chat
    if (session.state === 'ai_chat' || (!isNumericChoice && !criticalStates.includes(session.state))) {
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

            let aiMsg = aiData.text || "Estou aqui para tirar suas dúvidas!";

            // Garante que o menu sempre apareça no final da resposta da IA
            if (!aiMsg.includes("1️⃣")) {
                aiMsg += "\n\n1️⃣ Agendar | 2️⃣ Meus Horários | 3️⃣ Dúvidas";
            }

            await sendMessage(env, from, aiMsg, botBarberEmail);
            return json({ success: true });

        } catch (e) {
            console.error('[Client AI Error]', e);
            await sendMessage(env, from, "Tive um probleminha aqui. Escolha uma opção do menu acima!", botBarberEmail);
            return json({ success: true });
        }
    }

    // 3. FLUXO DE AGENDAMENTO (ESTADOS DE NAVEGAÇÃO)

    if (session.state === 'awaiting_barber' && isNumericChoice) {
        const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
        const b = team.results[parseInt(text) - 1];
        if (b) {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu", selected_barber_email = ? WHERE phone = ?').bind(b.email, from).run();
            await sendMessage(env, from, CLIENT_PROMPTS.main_menu(b.name), botBarberEmail);
        }
        return json({ success: true });
    }

    if (session.state === 'main_menu' && isNumericChoice) {
        if (text === '1') { // Iniciar Agendamento
            const svcs = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();
            let msg = "📅 *Escolha o serviço:* \n";
            svcs.results.forEach((s, i) => { msg += `\n*${i + 1}* - ${s.name} (R$ ${s.price})`; });
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_service" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, msg, botBarberEmail);
        } else if (text === '2') { // Consultar Meus Horários
            return await showClientAppointments(from, userInDb, botBarberEmail, env);
        } else if (text === '3') { // Falar com IA
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, "Pode me perguntar sobre preços ou que horas temos vago hoje!", botBarberEmail);
        }
        return json({ success: true });
    }

    // A partir daqui, seguem os estados do funil de agendamento:
    if (session.state === 'awaiting_service' && isNumericChoice) {
        const svcs = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();
        const s = svcs.results[parseInt(text) - 1];
        if (s) {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_date", service_id = ? WHERE phone = ?').bind(s.id, from).run();
            let msg = `✅ *${s.name}* selecionado.\n\n📅 *Para qual dia?*`;
            for (let i = 0; i < 7; i++) {
                const d = new Date(); d.setDate(d.getDate() + i);
                const ds = d.toISOString().split('T')[0];
                msg += `\n*${i + 1}* - ${ds}`;
            }
            await sendMessage(env, from, msg, botBarberEmail);
        }
        return json({ success: true });
    }

    if (session.state === 'awaiting_date' && isNumericChoice) {
        const d = new Date(); d.setDate(d.getDate() + (parseInt(text) - 1));
        const ds = d.toISOString().split('T')[0];
        // Busca horários ocupados
        const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, ds).all();
        const slots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
        const av = slots.filter(t => !busy.results.map(r => r.appointment_time).includes(t));

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_time", appointment_date = ? WHERE phone = ?').bind(ds, from).run();
        let msg = `⏰ *Horários disponíveis para ${ds}:*\n`;
        av.forEach((t, i) => { msg += `\n*${i + 1}* - ${t}`; });
        await sendMessage(env, from, msg, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_time' && isNumericChoice) {
        // (Simplificado: Assume o horário baseado no índice)
        const tm = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"][parseInt(text) - 1];
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ? WHERE phone = ?').bind(tm, from).run();
        await sendMessage(env, from, `📝 *Confirma seu agendamento para ${session.appointment_date} às ${tm}?*\n\n1️⃣ Sim, confirmar\n2️⃣ Não, cancelar`, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_confirmation' && text === '1') {
        const aid = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`).bind(aid, session.user_email || 'guest', session.selected_barber_email, session.service_id, session.appointment_date, session.appointment_time).run();
        await sendMessage(env, from, "✅ *Agendado com sucesso!* Te esperamos lá.", botBarberEmail);
        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
        return json({ success: true });
    }

    return json({ success: true });
}

async function showClientAppointments(from, userInDb, botBarberEmail, env) {
    const email = userInDb?.email || 'non-existent';
    const appts = await env.DB.prepare("SELECT a.*, s.name as service_name FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.user_email = ? AND a.status != 'cancelled'").bind(email).all();
    let msg = appts.results.length ? "🗓️ *Seus Agendamentos:*\n\n" : "Você não tem horários marcados.";
    appts.results.forEach(a => { msg += `• ${a.appointment_date} às ${a.appointment_time} - ${a.service_name}\n`; });
    await sendMessage(env, from, msg, botBarberEmail);
    return json({ success: true });
}