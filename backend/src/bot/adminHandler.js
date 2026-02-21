import { json, sendMessage } from '../utils/index.js';
import { ADMIN_PROMPTS } from './prompts.js';
import { runAgentChat } from './agent.js';

export async function handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const isMenuCommand = ['menu', 'oi', 'ola', 'opa', 'ok', 'voltar', 'ajuda'].includes(textLower);

    // 1. Gerenciamento de Sessão
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

    if (!session || isMenuCommand) {
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email, metadata) VALUES (?, "admin_ai_chat", ?, ?, "{}")').bind(from, adminInfo.email, adminInfo.email).run();
        await sendMessage(env, from, ADMIN_PROMPTS.ai_welcome(adminInfo.name), botBarberEmail);
        return json({ success: true });
    }

    // 2.1 PAGINAÇÃO DA AGENDA
    if (session.state === 'admin_viewing_agenda' && text === '8') {
        const lastPage = metadata.last_agenda_page || 1;
        return await showAgenda(from, adminInfo, botBarberEmail, env, lastPage + 1);
    }

    // 3. FLUXO AGÊNTICO
    try {
        const barberContext = {
            establishmentName: adminInfo.shop_name || adminInfo.name || 'Barbearia',
            bName: adminInfo.bot_name || 'Leo',
            bTone: adminInfo.bot_tone || 'profissional'
        };

        const aiData = await runAgentChat(env, {
            prompt: text,
            isAdmin: true,
            barberContext: barberContext
        });

        const aiMsg = aiData.text || "Chefe, não consegui processar isso agora. Pode me mandar a dúvida de novo?";
        await sendMessage(env, from, aiMsg, botBarberEmail);
        return json({ success: true });

    } catch (e) {
        console.error('[Agentic Admin Flow Error]', e);
        return await handleIntentsFallback(from, text, adminInfo, botBarberEmail, env);
    }

    return json({ success: true });
}

async function showAgenda(from, adminInfo, botBarberEmail, env, page = 1) {
    const limit = 8;
    const offset = (page - 1) * limit;
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    const timeStr = brazilTime.toTimeString().slice(0, 5);

    const appts = await env.DB.prepare(`
        SELECT a.appointment_date, a.appointment_time, s.name as service_name, u.name as client_name
        FROM appointments a 
        JOIN services s ON a.service_id = s.id 
        JOIN users u ON a.user_email = u.email
        WHERE a.barber_email = ? AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?)) 
        AND a.status IN ('pending','confirmed')
        ORDER BY a.appointment_date, a.appointment_time 
        LIMIT ? OFFSET ?
    `).bind(adminInfo.email, todayStr, todayStr, timeStr, limit + 1, offset).all();

    const metadata = { last_agenda_page: page };
    await env.DB.prepare('UPDATE whatsapp_sessions SET metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();

    if (appts.results.length === 0 && page === 1) {
        await sendMessage(env, from, "Chefe, sua agenda está livre. 👍\n\n" + ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
        return json({ success: true });
    }

    const resultsToShow = appts.results.length > limit ? appts.results.slice(0, limit) : appts.results;

    let msg = `📅 *Sua Agenda (Pág ${page})*:\n\n`;
    resultsToShow.forEach(a => {
        const dp = a.appointment_date.split('-');
        msg += `• *${dp[2]}/${dp[1]}* às *${a.appointment_time}*\n  ${a.client_name} - ${a.service_name}\n\n`;
    });

    if (appts.results.length > limit) msg += "8️⃣ - ➕ Ver mais clientes\n";
    msg += "\n*Comandos Rápidos:* Digite 'Cancele o das 14h' ou 'Confirme João'.";

    await sendMessage(env, from, msg, botBarberEmail);
    return json({ success: true });
}

async function showRevenue(from, adminInfo, botBarberEmail, env) {
    const today = new Date().toLocaleDateString("en-CA");
    const result = await env.DB.prepare(`
        SELECT COUNT(id) as total_count, SUM(price) as total_revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        WHERE a.barber_email = ? AND a.appointment_date = ? AND a.payment_status = 'paid'
    `).bind(adminInfo.email, today).first();

    const revenue = result?.total_revenue || 0;
    const msg = `💰 *RELATÓRIO DE HOJE*\n\n✅ Atendimentos: ${result?.total_count || 0}\n💵 Total: R$ ${revenue.toFixed(2)}`;
    await sendMessage(env, from, msg, botBarberEmail);
}

async function handleIntentsFallback(from, text, adminInfo, botBarberEmail, env) {
    await sendMessage(env, from, "⚠️ Tive um problema ao acessar a inteligência agora. Por favor, tente usar os números do menu ou tente novamente em instantes.", botBarberEmail);
    await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
    return json({ success: true });
}