import { json, sendMessage } from '../utils/index.js';
import { askAI } from './ai.js';
import { CLIENT_PROMPTS } from './prompts.js';

export async function handleClientFlow(from, text, textLower, session, userInDb, botBarberEmail, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;

    // Fluxo Inicial / Reset Universal
    if (!session || textLower === 'oi' || textLower === 'ola' || textLower === 'menu' || textLower === 'sair' || textLower === 'ajuda' || (session.state === 'main_menu' && !session.selected_barber_email)) {
        const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);

        if (botBarberEmail) {
            const b = await env.DB.prepare('SELECT email, name, business_type, shop_name, msg_welcome, msg_choose_barber FROM users WHERE email = ?').bind(botBarberEmail).first();

            if (b) {
                const establishmentName = b.shop_name || b.name;

                if (b.business_type === 'barbearia') {
                    const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();

                    if (team.results.length > 1) {
                        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();

                        let msg = b.msg_choose_barber || CLIENT_PROMPTS.choose_barber(establishmentName);
                        msg = msg.replace(/{{establishment_name}}/g, establishmentName);
                        const sortedTeam = team.results.sort((x, y) => x.email === botBarberEmail ? -1 : 1);
                        sortedTeam.forEach((member, i) => { msg += `*${i + 1}* - ${member.name}\n`; });
                        msg += "\nDigite o número correspondente!";
                        await sendMessage(env, from, msg, botBarberEmail);
                        return json({ success: true });
                    }
                }

                await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
                let msgTemplate = b.msg_welcome || CLIENT_PROMPTS.main_menu(establishmentName);
                let msg = msgTemplate.replace(/{{establishment_name}}/g, establishmentName);
                await sendMessage(env, from, msg, botBarberEmail);
                return json({ success: true });
            }
        }

        const barbers = await env.DB.prepare('SELECT email, name, business_type FROM users WHERE is_barber = 1').all();

        if (barbers.results.length === 1) {
            const b = barbers.results[0];
            await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
            await sendMessage(env, from, CLIENT_PROMPTS.main_menu(b.name), b.email);
        } else if (barbers.results.length > 1) {
            await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();
            let msg = CLIENT_PROMPTS.choose_barber("Barbearia");
            barbers.results.forEach((b, i) => { msg += `*${i + 1}* - ${b.name}\n`; });
            msg += "\nDigite o número correspondente!";
            await sendMessage(env, from, msg, null);
        } else {
            await sendMessage(env, from, "⚠️ Desculpe, não encontramos profissionais ativos no momento. Tente novamente mais tarde.", null);
        }
        return json({ success: true });
    }

    const criticalStates = ['awaiting_barber', 'awaiting_service', 'awaiting_date', 'awaiting_time', 'awaiting_name', 'awaiting_email', 'awaiting_confirmation'];

    if (!isNumericChoice && !criticalStates.includes(session.state)) {
        let aiMsg = await askAI(env, env.DB, text, session.selected_barber_email || botBarberEmail);
        if (!aiMsg.includes("1️⃣") && !aiMsg.includes("Agendar")) {
            aiMsg += "\n\nComo posso te ajudar agora? Escolha uma opção:\n1️⃣ - Agendar\n2️⃣ - Meus Agendamentos\n3️⃣ - Dúvidas";
        }
        await sendMessage(env, from, aiMsg, botBarberEmail);
        return json({ success: true });
    }

    if (textLower === 'voltar' || textLower === 'cancelar') {
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
        const b = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(session.selected_barber_email).first();
        await sendMessage(env, from, CLIENT_PROMPTS.main_menu(b?.name || "Barbearia"), botBarberEmail);
        return json({ success: true });
    }

    // Logic for each state (could be further modularized into separate functions)
    if (session.state === 'awaiting_barber') {
        let team;
        if (botBarberEmail) {
            const res = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
            team = res.results.sort((x, y) => x.email === botBarberEmail ? -1 : 1);
        } else {
            const res = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();
            team = res.results;
        }

        const idx = parseInt(text) - 1;
        const b = team[idx];
        if (!b) {
            await sendMessage(env, from, "❌ Opção inválida. Escolha um profissional da lista acima.", botBarberEmail);
            return json({ success: true });
        }

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu", selected_barber_email = ? WHERE phone = ?').bind(b.email, from).run();
        await sendMessage(env, from, CLIENT_PROMPTS.main_menu(b.name), botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'main_menu') {
        if (text === '1') {
            if (!session.selected_barber_email) {
                await sendMessage(env, from, "⚠️ Erro: Barbeiro não selecionado. Digite 'Menu' para escolher um barbeiro.", botBarberEmail);
                return json({ success: true });
            }
            let services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();

            if (services.results.length === 0) {
                const barber = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(session.selected_barber_email).first();
                if (barber && barber.owner_id) {
                    services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(barber.owner_id).all();
                }
            }

            if (services.results.length === 0) {
                await sendMessage(env, from, "❌ Este barbeiro ainda não cadastrou serviços. Escolha outro ou digite 'Menu'.", botBarberEmail);
                return json({ success: true });
            }
            const b = await env.DB.prepare('SELECT msg_choose_service FROM users WHERE email = ?').bind(session.selected_barber_email).first();
            let msg = b?.msg_choose_service || "📅 *Escolha o serviço:* \n";
            services.results.forEach((s, i) => { msg += `\n*${i + 1}* - ${s.name} (R$ ${s.price})`; });
            msg += "\n\nOu digite 'Menu' para voltar.";

            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_service" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, msg, botBarberEmail);
        } else if (text === '2') {
            const appts = await env.DB.prepare(`
                            SELECT a.*, s.name as service_name, b.name as barber_name
                            FROM appointments a
                            JOIN services s ON a.service_id = s.id
                            JOIN users u ON a.user_email = u.email
                            LEFT JOIN users b ON a.barber_email = b.email
                            WHERE (u.phone LIKE ? OR u.phone = ?) AND a.status != 'cancelled'
                            ORDER BY a.appointment_date LIMIT 5
                        `).bind(`%${from.slice(-8)}`, from).all();

            if (appts.results.length === 0) {
                await sendMessage(env, from, CLIENT_PROMPTS.no_appointments, botBarberEmail);
            } else {
                let msg = CLIENT_PROMPTS.appointment_list_header;
                appts.results.forEach((a, i) => {
                    msg += `\n*${i + 1}* - ${a.service_name} com ${a.barber_name || 'Barbeiro'} dia ${a.appointment_date} às ${a.appointment_time}`;
                });
                msg += "\n\nEnvie o número para *CANCELAR* ou 'Menu' para o início.";
                await env.DB.prepare('UPDATE whatsapp_sessions SET state = "managing_appointments", metadata = ? WHERE phone = ?')
                    .bind(JSON.stringify(appts.results.map(a => a.id)), from).run();
                await sendMessage(env, from, msg, botBarberEmail);
            }
        } else if (text === '3') {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, CLIENT_PROMPTS.ai_welcome, botBarberEmail);
        } else {
            await sendMessage(env, from, "Escolha entre 1, 2 ou 3. Ou mande 'Menu' para recomeçar.", botBarberEmail);
        }
        return json({ success: true });
    }

    if (session.state === 'ai_chat') {
        if (isNumericChoice && (text === '1' || text === '2' || text === '3')) {
            session.state = 'main_menu';
            // Recursive call or just let it fall through? Better to update session and return
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
            // Just simulate a menu call
            return await handleClientFlow(from, "menu", "menu", { ...session, state: 'main_menu' }, userInDb, botBarberEmail, env);
        } else {
            const aiMsg = await askAI(env, env.DB, text, session.selected_barber_email || botBarberEmail);
            await sendMessage(env, from, aiMsg, botBarberEmail);
            return json({ success: true });
        }
    }

    if (session.state === 'managing_appointments') {
        const ids = JSON.parse(session.metadata || "[]");
        const target = ids[parseInt(text) - 1];
        if (target) {
            await env.DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(target).run();
            await sendMessage(env, from, "✅ Agendamento cancelado com sucesso. Digite 'Menu' para voltar ao início.", botBarberEmail);
            await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
        } else {
            await sendMessage(env, from, "Opção inválida. Digite o número ou 'Menu' para voltar.", botBarberEmail);
        }
        return json({ success: true });
    }

    if (session.state === 'awaiting_service') {
        let services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();
        if (services.results.length === 0) {
            const barber = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(session.selected_barber_email).first();
            if (barber && barber.owner_id) {
                services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(barber.owner_id).all();
            }
        }
        if (isNaN(parseInt(text)) || parseInt(text) < 1 || parseInt(text) > services.results.length) {
            await sendMessage(env, from, "⚠️ Opção inválida! Digite apenas o NÚMERO do serviço desejado (ex: 1).", botBarberEmail);
            return json({ success: true });
        }
        const s = services.results[parseInt(text) - 1];
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_date", service_id = ? WHERE phone = ?').bind(s.id, from).run();
        let msg = `✅ *${s.name}* selecionado.\n\n📅 *Escolha a data:*`;
        for (let i = 0; i < 7; i++) {
            const d = new Date(); d.setDate(d.getDate() + i);
            const str = d.toISOString().split('T')[0];
            msg += `\n*${i + 1}* - ${str}`;
        }
        msg += "\n\nOu digite 'Menu' para voltar.";
        await sendMessage(env, from, msg, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_date') {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx > 6) {
            await sendMessage(env, from, "⚠️ Data inválida! Escolha uma opção de 1 a 7.", botBarberEmail);
            return json({ success: true });
        }
        const d = new Date(); d.setDate(d.getDate() + idx);
        const ds = d.toISOString().split('T')[0];
        const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, ds).all();
        const bt = busy.results.map(r => r.appointment_time);
        const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
        let av = slots.filter(t => !bt.includes(t));
        const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        if (ds === brazilTime.toLocaleDateString("en-CA")) {
            const currentTotalMinutes = brazilTime.getHours() * 60 + brazilTime.getMinutes() + 15;
            av = av.filter(t => { const [h, m] = t.split(':').map(Number); return (h * 60 + m) >= currentTotalMinutes; });
        }
        if (av.length === 0) {
            await sendMessage(env, from, "❌ Sem horários disponíveis para este dia. Escolha outro dia ou digite 'Menu'.", botBarberEmail);
            return json({ success: true });
        }
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_time", appointment_date = ? WHERE phone = ?').bind(ds, from).run();
        let msg = `📅 *Data: ${ds}*\n\n⏰ *Escolha o horário:*`;
        av.forEach((t, i) => { msg += `\n*${i + 1}* - ${t}`; });
        msg += "\n\nOu 'Menu' para recomeçar.";
        await sendMessage(env, from, msg, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_time') {
        const ds = session.appointment_date;
        const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, ds).all();
        const bt = busy.results.map(r => r.appointment_time);
        const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
        let av = slots.filter(t => !bt.includes(t));
        const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        if (ds === brazilTime.toLocaleDateString("en-CA")) {
            const currentTotalMinutes = brazilTime.getHours() * 60 + brazilTime.getMinutes() + 15;
            av = av.filter(t => { const [h, m] = t.split(':').map(Number); return (h * 60 + m) >= currentTotalMinutes; });
        }
        const tm = av[parseInt(text) - 1];
        if (!tm) {
            await sendMessage(env, from, "⚠️ Horário inválido! Escolha um número da lista.", botBarberEmail);
            return json({ success: true });
        }
        if (session.user_email) {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ? WHERE phone = ?').bind(tm, from).run();
            const s = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
            const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(session.selected_barber_email).first();
            await sendMessage(env, from, `📝 *Confirme os dados:* \n\n💇‍♂️ *Serviço:* ${s.name}\n📅 *Data:* ${ds}\n⏰ *Hora:* ${tm}\n💈 *Barbeiro:* ${barber?.name || 'Barbearia'}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir meus dados`, botBarberEmail);
        } else {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_name", appointment_time = ? WHERE phone = ?').bind(tm, from).run();
            await sendMessage(env, from, `👋 *É sua primeira vez aqui!*\n\nQual é o seu *Nome*? (Digite abaixo)`, botBarberEmail);
        }
        return json({ success: true });
    }

    if (session.state === 'awaiting_name') {
        const name = text.trim();
        if (name.length < 2) {
            await sendMessage(env, from, "⚠️ Nome muito curto. Por favor, digite seu nome completo.", botBarberEmail);
            return json({ success: true });
        }
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_email", metadata = ? WHERE phone = ?').bind(JSON.stringify({ temp_name: name }), from).run();
        await sendMessage(env, from, `Prazer, *${name}*! 🤝\n\nAgora, digite seu *E-mail* para receber o comprovante:`, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_email') {
        const email = text.toLowerCase().trim();
        if (!email.includes('@') || !email.includes('.')) {
            await sendMessage(env, from, "❌ E-mail inválido. Tente novamente.", botBarberEmail);
            return json({ success: true });
        }
        const meta = session.metadata ? JSON.parse(session.metadata) : {};
        const userName = meta.temp_name || `Cliente ${from}`;
        await env.DB.prepare(`INSERT INTO users (email, name, phone) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone`).bind(email, userName, from).run();
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", user_email = ? WHERE phone = ?').bind(email, from).run();
        const s = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
        const b = await env.DB.prepare('SELECT name, msg_confirm_booking FROM users WHERE email = ?').bind(session.selected_barber_email).first();
        let confirmMsg = b?.msg_confirm_booking || `📝 *Tudo pronto! Confirme:* \n\n👤 *Nome:* ${userName}\n📧 *E-mail:* ${email}\n💇‍♂️ *Serviço:* {{service_name}}\n📅 *Data:* {{date}}\n⏰ *Hora:* {{time}}\n💈 *Barbeiro:* {{barber_name}}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir dados`;
        confirmMsg = confirmMsg.replace(/{{service_name}}/g, s.name).replace(/{{date}}/g, session.appointment_date).replace(/{{time}}/g, session.appointment_time).replace(/{{barber_name}}/g, b?.name || 'Barbearia');
        await sendMessage(env, from, confirmMsg, botBarberEmail);
        return json({ success: true });
    }

    if (session.state === 'awaiting_confirmation') {
        if (text === '1' || textLower === 'sim' || textLower === 's') {
            const userEmail = session.user_email;
            const barberEmail = session.selected_barber_email || botBarberEmail;
            const appDate = session.appointment_date;
            const appTime = session.appointment_time;
            const serviceId = session.service_id;
            if (!userEmail || !barberEmail || !appDate || !appTime || !serviceId) {
                await sendMessage(env, from, "❌ Erro técnico: Dados perdidos. Digite 'Menu'.", botBarberEmail);
                await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                return json({ success: true });
            }
            const aid = crypto.randomUUID();
            const s = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();
            try {
                await env.DB.prepare(`INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`).bind(aid, userEmail, barberEmail, serviceId, appDate, appTime).run();
                let payMsg = "";
                try {
                    const mpPref = { items: [{ title: `Barber - ${s.name}`, quantity: 1, unit_price: s.price, currency_id: 'BRL' }], external_reference: aid, back_urls: { success: `${env.FRONTEND_URL}/success?id=${aid}`, failure: `${env.FRONTEND_URL}/cancel?id=${aid}`, pending: `${env.FRONTEND_URL}/pending?id=${aid}` }, auto_return: 'approved' };
                    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(mpPref) });
                    const mpD = await mpRes.json();
                    if (mpD.init_point) payMsg = `\n\n💳 *Pagamento (PIX/Cartão):*\n${mpD.init_point}`;
                } catch (e) { }
                await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                const dP = appDate.split('-');
                const b = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(barberEmail).first();
                let finMsg = `✅ *Agendamento Realizado!* \n\n✂️ *Serviço:* ${s.name}\n📅 *Data:* ${dP[2]}/${dP[1]}\n⏰ *Horário:* ${appTime}\n💈 *Barbeiro:* ${b?.name || 'Barbearia'}${payMsg}\n\nO status é *Pendente*.`;
                await sendMessage(env, from, finMsg, botBarberEmail);
            } catch (e) { await sendMessage(env, from, "❌ Falha ao salvar.", botBarberEmail); }
        } else if (text === '2' || textLower === 'nao') {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, "🔄 Cancelado. Menu Principal.", botBarberEmail);
        } else if (text === '3') {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_name" WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, "✏️ Digite seu *Nome* corretamente:", botBarberEmail);
        }
        return json({ success: true });
    }

    return json({ success: true });
}
