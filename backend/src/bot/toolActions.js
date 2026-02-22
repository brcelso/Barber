/**
 * Tool Actions - Business Agnostic Version
 * Encapsula a lógica de banco de dados e integrações das ferramentas de forma genérica.
 */

export const TOOL_ACTIONS = {
    async consultar_agenda({ args, DB, emailReal }) {
        const { appointment_date, professional_email } = args;
        const targetEmail = professional_email || emailReal;
        try {
            const res = await DB.prepare(
                "SELECT a.*, u.name as client_name, s.name as service_name FROM appointments a JOIN users u ON a.user_email = u.email JOIN services s ON a.service_id = s.id WHERE a.appointment_date = ? AND a.barber_email = ? AND a.status != 'cancelled'"
            ).bind(appointment_date, targetEmail).all();
            return { status: "sucesso", agendamentos: res.results };
        } catch (e) { return { status: "erro", msg: e.message }; }
    },

    async agendar_cliente({ args, DB, emailReal }) {
        const { user_email, service_id, date, time, professional_email } = args;
        const targetEmail = professional_email || emailReal;
        const id = `appt_${Date.now()}`;
        try {
            await DB.prepare(
                "INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')"
            ).bind(id, user_email, targetEmail, service_id, date, time).run();
            return { status: "sucesso", mensagem: "Agendamento criado com sucesso!", id };
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

    async gerenciar_robos({ args, DB, emailReal }) {
        const { action, email } = args;
        try {
            const admin = await DB.prepare("SELECT wa_bridge_url FROM users WHERE email = ?").bind(emailReal).first();
            const bridgeUrl = admin?.wa_bridge_url;
            if (!bridgeUrl) throw new Error("URL da Bridge não configurada para este estabelecimento.");
            const endpoint = action === 'stop' ? '/api/stop' : '/api/init';
            const res = await fetch(`${bridgeUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'universal-secret-key', email: email })
            });
            return { status: "sucesso", bridge_response: await res.json() };
        } catch (e) { return { status: "erro", msg: e.message }; }
    }
};
