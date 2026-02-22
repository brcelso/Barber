/**
 * Tool Actions - Business Agnostic Version
 * Encapsula a lógica de banco de dados e integrações das ferramentas de forma genérica.
 */

export const TOOL_ACTIONS = {
    async consultar_agenda({ args, DB, emailReal }) {
        const { appointment_date, professional_email } = args;
        const targetEmail = professional_email || emailReal;
        try {
            // 1. Buscar agendamentos existentes
            const res = await DB.prepare(
                "SELECT a.appointment_time as time, a.status, u.name as client_name, s.name as service_name FROM appointments a LEFT JOIN users u ON a.user_email = u.email LEFT JOIN services s ON a.service_id = s.id WHERE a.appointment_date = ? AND a.barber_email = ? AND a.status != 'cancelled'"
            ).bind(appointment_date, targetEmail).all();

            // 2. Buscar horário de funcionamento para o dia da semana
            const dateObj = new Date(appointment_date + 'T12:00:00'); // Meio dia para evitar bugs de timezone
            const dayOfWeek = dateObj.getDay();
            const avail = await DB.prepare("SELECT start_time, end_time FROM availability WHERE barber_email = ? AND day_of_week = ?").bind(targetEmail, dayOfWeek).first();

            return {
                status: "sucesso",
                data: appointment_date,
                horario_funcionamento: avail ? `${avail.start_time} às ${avail.end_time}` : "Fechado neste dia",
                agendamentos_ocupados: res.results
            };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async agendar_cliente({ args, DB, env, emailReal }) {
        const { user_email, service_id, date, time, professional_email } = args;
        const targetEmail = professional_email || emailReal;
        const id = `appt_${Date.now()}`;
        try {
            await DB.prepare(
                "INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')"
            ).bind(id, user_email, targetEmail, service_id, date, time).run();

            // Gerar link de pagamento se houver API Key do MP
            let payMsg = "";
            if (env.MP_ACCESS_TOKEN) {
                const payUrl = `${env.FRONTEND_URL || 'https://universal-scheduler.pages.dev'}/pay/${id}`;
                payMsg = `\n\nLink para pagamento: ${payUrl}`;
            }

            return {
                status: "sucesso",
                mensagem: "Agendamento criado com sucesso!",
                id,
                complemento: payMsg
            };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async alterar_status_agendamento({ args, DB }) {
        const { appointment_id, status } = args;
        try {
            await DB.prepare("UPDATE appointments SET status = ? WHERE id = ?").bind(status, appointment_id).run();
            return { status: "sucesso", mensagem: `Status atualizado para ${status}` };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async consultar_faturamento({ args, DB, emailReal }) {
        const { start_date, end_date, professional_email } = args;
        const targetEmail = professional_email || emailReal;
        try {
            const res = await DB.prepare(
                "SELECT SUM(s.price) as total, COUNT(*) as qtd FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.barber_email = ? AND a.appointment_date BETWEEN ? AND ? AND a.status != 'cancelled'"
            ).bind(targetEmail, start_date, end_date).first();
            return { status: "sucesso", faturamento: res.total || 0, total_atendimentos: res.qtd };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_bloqueios({ args, DB, emailReal }) {
        const { action, type, date, time } = args;
        try {
            if (action === 'block') {
                const id = type === 'slot' ? `block_${Date.now()}` : `block_day_${Date.now()}`;
                const finalTime = type === 'slot' ? time : '00:00';
                await DB.prepare("INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, 'system', ?, 'block', ?, ?, 'confirmed')").bind(id, emailReal, date, finalTime).run();
                return { status: "sucesso", mensagem: type === 'slot' ? `Horário ${time} bloqueado.` : `Dia ${date} bloqueado.` };
            } else {
                if (type === 'slot') {
                    await DB.prepare("DELETE FROM appointments WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? AND service_id = 'block'").bind(emailReal, date, time).run();
                } else {
                    await DB.prepare("DELETE FROM appointments WHERE barber_email = ? AND appointment_date = ? AND service_id = 'block'").bind(emailReal, date).run();
                }
                return { status: "sucesso", mensagem: "Horário liberado com sucesso." };
            }
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_servicos({ args, DB, emailReal }) {
        const { action, id, name, price, duration, description } = args;
        try {
            if (action === 'create') {
                const newId = name.toLowerCase().replace(/ /g, '-');
                await DB.prepare("INSERT INTO services (id, name, price, duration_minutes, description, barber_email) VALUES (?, ?, ?, ?, ?, ?)").bind(newId, name, price, duration, description, emailReal).run();
                return { status: "sucesso", mensagem: "Serviço criado com sucesso.", id: newId };
            } else if (action === 'update') {
                await DB.prepare("UPDATE services SET name = ?, price = ?, duration_minutes = ?, description = ? WHERE id = ? AND barber_email = ?").bind(name, price, duration, description, id, emailReal).run();
                return { status: "sucesso", mensagem: "Serviço atualizado com sucesso." };
            } else {
                await DB.prepare("DELETE FROM services WHERE id = ? AND barber_email = ?").bind(id, emailReal).run();
                return { status: "sucesso", mensagem: "Serviço removido com sucesso." };
            }
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_equipe({ args, DB, emailReal, professionalContext }) {
        const { action, email, name, is_admin, is_professional } = args;
        const bizType = professionalContext?.business_type || 'default';
        try {
            if (action === 'add') {
                await DB.prepare("INSERT INTO users (email, name, owner_id, is_admin, is_barber, business_type) VALUES (?, ?, ?, ?, 1, ?)").bind(email, name, emailReal, is_admin ? 1 : 0, bizType).run();
            } else if (action === 'recruit') {
                await DB.prepare("UPDATE users SET owner_id = ?, business_type = ? WHERE email = ? AND owner_id IS NULL").bind(emailReal, bizType, email).run();
            } else if (action === 'remove') {
                await DB.prepare("UPDATE users SET owner_id = NULL WHERE email = ? AND owner_id = ?").bind(email, emailReal).run();
            } else if (action === 'update_role') {
                await DB.prepare("UPDATE users SET is_admin = ?, is_barber = ? WHERE email = ? AND owner_id = ?").bind(is_admin ? 1 : 0, is_professional ? 1 : 0, email, emailReal).run();
            }
            return { status: "sucesso", mensagem: "Gestão de equipe atualizada." };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_assinatura({ args, DB }) {
        const { email, plan, add_days } = args;
        try {
            const user = await DB.prepare("SELECT subscription_expires FROM users WHERE email = ?").bind(email).first();
            let currentLimit = user?.subscription_expires ? new Date(user.subscription_expires) : new Date();
            if (currentLimit < new Date()) currentLimit = new Date();
            currentLimit.setDate(currentLimit.getDate() + add_days);
            const newExpiry = currentLimit.toISOString();
            await DB.prepare("UPDATE users SET plan = ?, subscription_expires = ? WHERE email = ?").bind(plan, newExpiry, email).run();
            return { status: "sucesso", nova_validade: newExpiry, plano: plan };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_robos({ args, DB, emailReal, professionalContext }) {
        let { action, email } = args;
        const targetEmail = email || emailReal;

        // Safety Override: Se o agente detectou potencial erro de parada de hardware
        if (professionalContext?.force_ia_only && (action === 'stop_bridge' || action === 'restart_bridge')) {
            console.log('[Safe Guard] Forçando deactivate_ia em vez de parada de hardware.');
            action = 'deactivate_ia';
        }

        console.log(`[Tool: gerenciar_robos] Action: ${action} Target: ${targetEmail}`);

        try {
            if (action === 'activate_ia' || action === 'deactivate_ia') {
                const active = action === 'activate_ia' ? 1 : 0;
                await DB.prepare("UPDATE users SET bot_active = ? WHERE email = ?").bind(active, targetEmail).run();
                return { status: "sucesso", mensagem: `Inteligência Artificial (IA) foi ${action === 'activate_ia' ? 'ativada' : 'desativada'}.` };
            }

            const admin = await DB.prepare("SELECT wa_bridge_url FROM users WHERE email = ?").bind(emailReal).first();
            const bridgeUrl = admin?.wa_bridge_url;
            if (!bridgeUrl) throw new Error("URL da Bridge não configurada para este estabelecimento.");

            // Mapear stop_bridge -> stop, start_bridge -> init
            const endpoint = (action === 'stop_bridge') ? '/api/stop' : '/api/init';

            const res = await fetch(`${bridgeUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'universal-secret-key', email: targetEmail })
            });
            return { status: "sucesso", bridge_response: await res.json() };
        } catch (e) {
            console.error('[Tool Error: gerenciar_robos]', e.message);
            return { status: "erro", msg: e.message };
        }
    },

    async ver_status_whatsapp({ args, DB }) {
        const { email } = args;
        try {
            const user = await DB.prepare("SELECT wa_status, wa_qr FROM users WHERE email = ?").bind(email).first();
            if (!user) throw new Error("Usuário não encontrado.");
            return {
                status: "sucesso",
                wa_status: user.wa_status || 'disconnected',
                has_qr: !!user.wa_qr,
                qr_preview: user.wa_qr ? "QR Code disponível. Informe ao usuário que ele pode escanear no painel ou peça para ele digitar 'gerar qr' se precisar reinicializar." : "Sem QR Code no momento."
            };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async gerenciar_configuracoes({ args, DB }) {
        const { email, shop_name, business_type, bot_name, bot_tone, mp_access_token } = args;
        try {
            const updates = [];
            const values = [];

            if (shop_name) { updates.push("shop_name = ?"); values.push(shop_name); }
            if (business_type) { updates.push("business_type = ?"); values.push(business_type); }
            if (bot_name) { updates.push("bot_name = ?"); values.push(bot_name); }
            if (bot_tone) { updates.push("bot_tone = ?"); values.push(bot_tone); }
            if (mp_access_token) { updates.push("mp_access_token = ?"); values.push(mp_access_token); }

            if (updates.length === 0) return { status: "erro", msg: "Nenhum campo informado para atualização." };

            values.push(email);
            await DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE email = ?`).bind(...values).run();

            return { status: "sucesso", msg: "Configurações atualizadas com sucesso!" };
        } catch (e) {
            console.error('[Tool Error: gerenciar_configuracoes]', e.message);
            return { status: "erro", msg: e.message };
        }
    }
};
