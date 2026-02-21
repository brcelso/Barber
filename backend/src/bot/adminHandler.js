import { json, sendMessage } from '../utils/index.js';
import { askAI } from './ai.js';
import { ADMIN_PROMPTS } from './prompts.js';

export async function handleAdminFlow(from, text, textLower, adminInfo, botBarberEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const isMenuCommand = ['menu', 'oi', 'ola', 'opa', 'ok', 'voltar', 'ajuda'].includes(textLower);

    // Get current session or create one
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

    // 1. FORCED MENU: If no session, or explicit menu command
    if (!session || isMenuCommand) {
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, adminInfo.email, adminInfo.email).run();
        await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo.name), botBarberEmail);
        return json({ success: true });
    }

    // 2. MAIN MENU LOGIC (CRUD Centralizado)
    if (session.state === 'main_menu' && isNumericChoice) {
        switch (text) {
            case '1': // Agenda
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_viewing_agenda" WHERE phone = ?').bind(from).run();
                return await showAgenda(from, adminInfo, botBarberEmail, env);

            case '2': // Confirmar (Update)
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_awaiting_confirm" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "✅ *Confirmar Agendamento*\n\nDigite o nome ou horário do cliente para confirmar.\n\nOu digite 'Voltar'.", botBarberEmail);
                break;

            case '3': // Pagar (Update)
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_awaiting_paid" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "💰 *Marcar como Pago*\n\nDigite o nome ou horário do cliente.\n\nOu digite 'Voltar'.", botBarberEmail);
                break;

            case '4': // Cancelar (Update)
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_awaiting_cancel" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "❌ *Cancelar Agendamento*\n\nDigite o nome ou horário que deseja cancelar.\n\nOu digite 'Voltar'.", botBarberEmail);
                break;

            case '5': // Bloquear (Insert)
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_awaiting_block" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, "🛑 *Bloquear Horário*\n\nQual data deseja bloquear? (ex: 'hoje' ou '2026-05-10')\n\nOu digite 'Voltar'.", botBarberEmail);
                break;

            case '6': // Financeiro (Read/Aggregate)
                // Chamamos a função de receita diretamente
                return await showRevenue(from, adminInfo, botBarberEmail, env);

            case '7': // IA Chat
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "admin_ai_chat" WHERE phone = ?').bind(from).run();
                await sendMessage(env, from, ADMIN_PROMPTS.ai_welcome, botBarberEmail);
                break;
        }
        return json({ success: true });
    }

    // 3. AI CHAT STATE
    if (session.state === 'admin_ai_chat') {
        const aiMsg = await askAI(env, env.DB, text, adminInfo.email, true);
        await sendMessage(env, from, aiMsg, botBarberEmail);
        return json({ success: true });
    }

    // 4. NATURAL LANGUAGE / INTENT DETECTION (Onde a mágica do CRUD via IA acontece)
    try {
        let aiContext = "";
        if (session.state === 'admin_awaiting_cancel') aiContext = "O usuário quer cancelar um agendamento.";
        if (session.state === 'admin_awaiting_confirm') aiContext = "O usuário quer confirmar um agendamento.";
        if (session.state === 'admin_awaiting_paid') aiContext = "O usuário quer marcar um agendamento como pago.";
        if (session.state === 'admin_awaiting_block') aiContext = "O usuário quer bloquear horários.";

        const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: ADMIN_PROMPTS.system_instruction(text, aiContext) },
                { role: 'user', content: text }
            ]
        });

        const resultStr = aiRes.response.trim();
        const match = resultStr.match(/\{[\s\S]*?\}/);

        if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.intent !== 'none') {
                // Executa a ação no D1 baseada na intenção detectada
                return await executeAdminIntent(from, parsed, adminInfo, botBarberEmail, env);
            }
        }

        // Resposta padrão caso a IA não detecte intenção mas o chefe esteja conversando
        const aiMsg = await askAI(env, env.DB, text, adminInfo.email, true);
        await sendMessage(env, from, aiMsg, botBarberEmail);
        return json({ success: true });

    } catch (e) {
        console.error('[Admin Flow Error]', e);
        await sendMessage(env, from, "⚠️ Erro ao processar comando. Digite 'Menu'.", botBarberEmail);
        return json({ success: true });
    }
}

async function showAgenda(from, adminInfo, botBarberEmail, env) {
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    const hh = brazilTime.getHours().toString().padStart(2, '0');
    const mm = brazilTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    const appts = await env.DB.prepare(`
        SELECT a.appointment_date, a.appointment_time, s.name as service_name, u.name as client_name
        FROM appointments a 
        JOIN services s ON a.service_id = s.id 
        JOIN users u ON a.user_email = u.email
        WHERE a.barber_email = ? AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?)) AND a.status IN ('pending','confirmed')
        ORDER BY a.appointment_date, a.appointment_time LIMIT 10
    `).bind(adminInfo.email, todayStr, todayStr, timeStr).all();

    if (appts.results.length === 0) {
        await sendMessage(env, from, "Chefe, sua agenda está livre por enquanto. 👍", botBarberEmail);
        return json({ success: true });
    }

    let msg = `📅 *Sua Agenda Próxima*:\n\n`;
    appts.results.forEach(a => {
        const dp = a.appointment_date.split('-');
        msg += `• *${dp[2]}/${dp[1]}* às *${a.appointment_time}*\n  ${a.client_name} - ${a.service_name}\n\n`;
    });
    msg += "\n*Deseja gerenciar algum desses horários?*\n";
    msg += "2️⃣ - Cancelar Agendamento\n";
    msg += "3️⃣ - Confirmar Agendamento\n";
    msg += "4️⃣ - Marcar como Pago\n";
    msg += "\nOu digite 'Menu' para voltar.";
    await sendMessage(env, from, msg, botBarberEmail);
    return json({ success: true });
}

async function executeAdminIntent(from, parsed, adminInfo, botBarberEmail, env) {
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    const hh = brazilTime.getHours().toString().padStart(2, '0');
    const mm = brazilTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (parsed.intent === 'show_agenda') {
        return await showAgenda(from, adminInfo, botBarberEmail, env);
    }

    if (parsed.intent === 'cancel_next') {
        const count = parseInt(parsed.count) || 1;
        const reason = parsed.reason || "Imprevisto do profissional";

        const nextAppts = await env.DB.prepare(`
            SELECT a.id, a.appointment_date, a.appointment_time, s.name as service_name, u.phone as client_phone, u.name as client_name
            FROM appointments a JOIN services s ON a.service_id = s.id JOIN users u ON a.user_email = u.email
            WHERE a.barber_email = ? AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?)) AND a.status IN ('pending','confirmed')
            ORDER BY a.appointment_date, a.appointment_time LIMIT ?
        `).bind(adminInfo.email, todayStr, todayStr, timeStr, count).all();

        if (nextAppts.results.length === 0) {
            await sendMessage(env, from, "Chefe, não encontrei nenhum agendamento próximo para cancelar. 👍", botBarberEmail);
            return json({ success: true });
        }
        let cancelledCount = 0;
        for (const appt of nextAppts.results) {
            await env.DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(appt.id).run();
            cancelledCount++;
            if (appt.client_phone) {
                const dp = appt.appointment_date.split('-');
                const fmtDate = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]}` : appt.appointment_date;
                const clientMsg = `❌ *Agendamento Cancelado*\n\nOlá ${appt.client_name}, seu agendamento para *${appt.service_name}* no dia *${fmtDate}* às *${appt.appointment_time}* foi cancelado.\n\n*Motivo:* ${reason}\n\nDigite 'Menu' para reagendar!`;
                await sendMessage(env, appt.client_phone, clientMsg, botBarberEmail);
            }
        }
        await sendMessage(env, from, `Feito, chefe! 👍 Cancelei ${cancelledCount} agendamento(s) e avisei os clientes. Motivo: "${reason}".`, botBarberEmail);
        return json({ success: true });
    }

    if (parsed.intent === 'confirm_appointment' || parsed.intent === 'mark_paid') {
        let query = `
            SELECT a.id, a.appointment_date, a.appointment_time, u.name as client_name, u.phone as client_phone
            FROM appointments a JOIN users u ON a.user_email = u.email
            WHERE a.barber_email = ? AND a.status != 'cancelled'
        `;
        let params = [adminInfo.email];
        if (parsed.time) { query += " AND a.appointment_time LIKE ?"; params.push(`%${parsed.time}%`); }
        if (parsed.client) { query += " AND u.name LIKE ?"; params.push(`%${parsed.client}%`); }
        query += " ORDER BY ABS(julianday(a.appointment_date) - julianday(?)) ASC, a.appointment_time ASC LIMIT 1";
        params.push(todayStr);

        const target = await env.DB.prepare(query).bind(...params).first();
        if (!target) {
            await sendMessage(env, from, `Chefe, não encontrei agendamento para "${parsed.client || ''}" ${parsed.time || ''}.`, botBarberEmail);
            return json({ success: true });
        }

        if (parsed.intent === 'confirm_appointment') {
            await env.DB.prepare('UPDATE appointments SET status = "confirmed" WHERE id = ?').bind(target.id).run();
            const clientMsg = `✅ *Agendamento Confirmado!*\n\nOlá ${target.client_name}, seu horário no dia *${target.appointment_date}* às *${target.appointment_time}* foi confirmado pelo profissional. Te esperamos lá! ✂️`;
            await sendMessage(env, target.client_phone, clientMsg, botBarberEmail);
            await sendMessage(env, from, `Confirmado, chefe! 👍 O agendamento de ${target.client_name} (${target.appointment_time}) foi confirmado.`, botBarberEmail);
        } else {
            await env.DB.prepare('UPDATE appointments SET payment_status = "paid" WHERE id = ?').bind(target.id).run();
            await sendMessage(env, from, `Ok, chefe! 👍 Marquei ${target.client_name} (${target.appointment_time}) como Pago.`, botBarberEmail);
        }
        return json({ success: true });
    }

    if (parsed.intent === 'block_day') {
        const blockDate = parsed.date === 'today' ? todayStr : parsed.date;
        const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
        const existing = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(adminInfo.email, blockDate).all();
        const busySet = new Set(existing.results.map(r => r.appointment_time));

        const statements = [];
        for (const time of slots) {
            if (!busySet.has(time)) {
                statements.push(env.DB.prepare(`INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')`).bind(`block-${crypto.randomUUID()}`, adminInfo.email, blockDate, time));
            }
        }
        if (statements.length > 0) await env.DB.batch(statements);
        await sendMessage(env, from, `Entendido, chefe! 🛑 Bloqueei os horários livres para ${blockDate}.`, botBarberEmail);
        return json({ success: true });
    }

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
    return { success: true };
}
