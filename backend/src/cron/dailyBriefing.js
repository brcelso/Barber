import { notifyWhatsApp } from '../utils/index.js';

export async function handleDailyBriefing(env) {
    const { DB } = env;

    // 1. Find all barbers who have appointments today
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");

    const barbers = await DB.prepare('SELECT email, name, phone FROM users WHERE is_barber = 1 AND phone IS NOT NULL').all();

    for (const barber of barbers.results) {
        // 2. Get appointments for today
        const appts = await DB.prepare(`
            SELECT a.appointment_time, s.name as service_name, u.name as client_name, s.price
            FROM appointments a 
            JOIN services s ON a.service_id = s.id 
            JOIN users u ON a.user_email = u.email
            WHERE a.barber_email = ? AND a.appointment_date = ? AND a.status IN ('pending','confirmed')
            ORDER BY a.appointment_time
        `).bind(barber.email, todayStr).all();

        if (appts.results.length === 0) continue;

        const totalRevenue = appts.results.reduce((sum, a) => sum + (a.price || 0), 0);
        const count = appts.results.length;
        const firstTime = appts.results[0].appointment_time;

        // 3. Format message with Llama
        const prompt = `Bom dia! Hoje é um novo dia de trabalho.
        Barbeiro: ${barber.name}
        Agendamentos: ${count}
        Receita Projetada: R$ ${totalRevenue}
        Primeiro Cliente: ${firstTime}
        Resumo da Agenda: ${appts.results.map(a => `${a.appointment_time} - ${a.client_name} (${a.service_name})`).join(', ')}
        
        Crie uma mensagem curta, motivadora e profissional no WhatsApp para o barbeiro, resumindo o dia dele. Use emojis.`;

        try {
            const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                prompt: prompt
            });

            const message = aiRes.response || `Bom dia ${barber.name}! ✂️ Você tem ${count} agendamentos hoje (R$ ${totalRevenue}). O primeiro é às ${firstTime}. Bom trabalho!`;

            // 4. Send via bridge
            await notifyWhatsApp(env, DB, null, 'custom', {
                to: barber.phone,
                message,
                barberEmail: barber.email
            });

        } catch (e) {
            console.error(`Error sending briefing to ${barber.email}:`, e);
        }
    }
}
