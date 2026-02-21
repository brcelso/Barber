import { notifyWhatsApp } from '../utils/index.js';

/**
 * Identify customers who haven't banked in a while and suggest a specific time.
 */
export async function handleProactiveScheduling(env) {
    const { DB, AI } = env;

    // 1. Find customers who haven't come in 15-25 days
    // We look for their LAST completed appointment.
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const fifteenDaysAgo = new Date(brazilTime);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoStr = fifteenDaysAgo.toLocaleDateString("en-CA");

    const usersToNudge = await DB.prepare(`
        SELECT u.email, u.name, u.phone, 
               MAX(a.appointment_date) as last_date, 
               a.barber_email, a.service_id, s.name as service_name
        FROM users u
        JOIN appointments a ON u.email = a.user_email
        JOIN services s ON a.service_id = s.id
        WHERE a.status = 'completed'
        GROUP BY u.email
        HAVING last_date <= ? AND last_date >= date(?, '-30 days')
    `).bind(fifteenDaysAgoStr, fifteenDaysAgoStr).all();

    for (const user of usersToNudge.results) {
        if (!user.phone) continue;

        // 2. Check barber availability for a "smart suggestion" (e.g., tomorrow or day after)
        const targetDay = new Date(brazilTime);
        targetDay.setDate(targetDay.getDate() + 1); // Suggest for tomorrow
        const targetDateStr = targetDay.toLocaleDateString("en-CA");

        // Check occupied slots
        const occupied = await DB.prepare(
            'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"'
        ).bind(targetDateStr, user.barber_email).all();

        const occupiedTimes = occupied.results.map(r => r.appointment_time);

        // Simple heuristic: suggest 10:00, 14:00, or 16:00 if free
        const possibleTimes = ['10:00', '14:00', '16:00', '09:00', '17:00'];
        const suggestedTime = possibleTimes.find(t => !occupiedTimes.includes(t)) || '09:00';

        // 3. Draft Personalized Message with LLM
        const barberInfo = await DB.prepare('SELECT name, shop_name, bot_name FROM users WHERE email = ?').bind(user.barber_email).first();

        const prompt = `Você é o ${barberInfo.bot_name || 'Leo'}, assistente da ${barberInfo.shop_name || 'Barbearia'}.
        Cliente: ${user.name}
        Último serviço: ${user.service_name} em ${user.last_date}.
        Sugestão: Amanhã às ${suggestedTime}.
        
        OBJETIVO: Escreva uma mensagem de WhatsApp amigável e PROATIVA.
        Não pergunte "se ele quer". Diga que notou que já faz um tempo e que você reservou (ou separou) esse horário para ele.
        Peça apenas um "sim" para confirmar. Seja breve e use emojis.`;

        try {
            const aiRes = await AI.run('@cf/meta/llama-3.1-8b-instruct', {
                prompt: prompt
            });

            const message = aiRes.response;

            // 4. Send
            await notifyWhatsApp(env, DB, null, 'custom', {
                to: user.phone,
                message,
                barberEmail: user.barber_email
            });

            console.log(`[Proactive] Message sent to ${user.name} (${user.email})`);

        } catch (e) {
            console.error(`[Proactive] Error nudge user ${user.email}:`, e);
        }
    }
}
