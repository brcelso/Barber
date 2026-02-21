import { json, sendMessage } from '../utils/index.js';
import { ADMIN_PROMPTS } from './prompts.js';

// Helper para extrair JSON da resposta da IA (caso necessário no fallback)
function safeParseJSON(str) {
    try {
        const match = str.match(/\{[\s\S]*?\}/);
        if (match) return JSON.parse(match[0]);
    } catch (e) {
        console.error('[JSON Parse Error]', e, str);
    }
    return null;
}

export async function handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const isMenuCommand = ['menu', 'oi', 'ola', 'opa', 'ok', 'voltar', 'ajuda'].includes(textLower);

    // 1. Gerenciamento de Sessão
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

    if (!session || isMenuCommand) {
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email, metadata) VALUES (?, "main_menu", ?, ?, "{}")').bind(from, adminInfo.email, adminInfo.email).run();
        await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
        return json({ success: true });
    }

    const metadata = JSON.parse(session.metadata || '{}');

    // 2. Lógica de Menu Numérico (CRUD e Ações Diretas)
    const isGlobalMenuChoice = isNumericChoice && parseInt(text) >= 1 && parseInt(text) <= 7;
    if ((session.state === 'main_menu' || isGlobalMenuChoice) && isNumericChoice) {
        switch (text) {
            case '1': // Ver Agenda
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_viewing_agenda" WHERE phone = ?').bind(from).run();
                return await showAgenda(from, adminInfo, botBarberEmail, env, 1);

            case '2': // Confirmar
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "✅ *Confirmar Agendamento*\n\nMe diga o nome do cliente ou horário para eu confirmar agora.", botBarberEmail);
                break;

            case '3': // Pagar
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "💰 *Marcar como Pago*\n\nQuem pagou? Pode mandar o nome ou horário.", botBarberEmail);
                break;

            case '4': // Cancelar
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "❌ *Cancelar Agendamento*\n\nQual horário deseja cancelar?", botBarberEmail);
                break;

            case '5': // Bloquear
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "🛑 *Bloqueio*\n\nQual data ou hora deseja bloquear/desbloquear?", botBarberEmail);
                break;

            case '6': // Financeiro Direto
                await showRevenue(from, adminInfo, botBarberEmail, env);
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
                break;

            case '7': // Chat IA Livre
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, ADMIN_PROMPTS.ai_welcome, botBarberEmail);
                break;
        }
        return json({ success: true });
    }

    // 2.1 PAGINAÇÃO DA AGENDA
    if (session.state === 'admin_viewing_agenda' && text === '8') {
        const lastPage = metadata.last_agenda_page || 1;
        return await showAgenda(from, adminInfo, botBarberEmail, env, lastPage + 1);
    }

    // 3. FLUXO AGÊNTICO (Onde a IA decide e executa)
    // Se estiver em estado de chat OU se mandar um texto livre (Linguagem Natural)
    if (session.state === 'admin_ai_chat' || !isNumericChoice) {
        try {
            const barberContext = {
                establishmentName: adminInfo.shop_name || adminInfo.name || 'Barbearia',
                bName: adminInfo.bot_name || 'Leo',
                bTone: adminInfo.bot_tone || 'profissional'
            };

            // Chamada para a Rota Agêntica Central no index.js
            const workerUrl = env.SERVICE_URL || 'https://barber-server.celsosilvajunior90.workers.dev';
            const aiRequest = await fetch(`${workerUrl}/api/agent/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    email: adminInfo.email,
                    isAdmin: true,
                    barberContext: barberContext
                })
            });

            const aiData = await aiRequest.json();
            const aiMsg = aiData.text || "Chefe, não consegui processar isso agora. Pode usar o menu?";

            await sendMessage(env, from, aiMsg, botBarberEmail);

            // Mantemos o fluxo limpo voltando ao menu
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
            
            return json({ success: true });

        } catch (e) {
            console.error('[Agentic Admin Flow Error]', e);
            // Fallback para intenções fixas caso a IA central falhe
            return await handleIntentsFallback(from, text, adminInfo, botBarberEmail, env);
        }
    }

    return json({ success: true });
}

// --- FUNÇÕES DE APOIO (CÓDIGO ORIGINAL MANTIDO) ---

async function showAgenda(from, adminInfo, botBarberEmail, env, page = 1) {
    const limit = 8;
    const offset = (page - 1) * limit;
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    const timeStr = brazilTime.toTimeString().slice(0,5);

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

    const hasMore = appts.results.length > limit;
    const resultsToShow = hasMore ? appts.results.slice(0, limit) : appts.results;

    let msg = `📅 *Sua Agenda (Pág ${page})*:\n\n`;
    resultsToShow.forEach(a => {
        const dp = a.appointment_date.split('-');
        msg += `• *${dp[2]}/${dp[1]}* às *${a.appointment_time}*\n  ${a.client_name} - ${a.service_name}\n\n`;
    });

    if (hasMore) msg += "8️⃣ - ➕ Ver mais clientes\n";
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

// Fallback de segurança para manter o CRUD funcionando se a IA central falhar
async function handleIntentsFallback(from, text, adminInfo, botBarberEmail, env) {
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    
    // Aqui você pode manter sua lógica original de env.AI.run com ADMIN_PROMPTS.system_instruction 
    // ou apenas enviar uma mensagem de erro pedindo para usar o menu.
    await sendMessage(env, from, "⚠️ Tive um problema ao entender sua frase. Por favor, tente usar os números do menu ou seja mais específico.", botBarberEmail);
    await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
    return json({ success: true });
}