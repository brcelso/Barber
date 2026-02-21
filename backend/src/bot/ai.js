import { CLIENT_PROMPTS, ADMIN_PROMPTS } from './prompts.js';

export const askAI = async (env, DB, userMessage, barberEmail, isAdmin = false) => {
    try {
        const barber = await DB.prepare('SELECT name, shop_name, bot_name, business_type, bot_tone FROM users WHERE email = ?').bind(barberEmail).first();
        const bName = barber?.bot_name || 'Leo';
        const bTone = barber?.bot_tone || 'prestativo e amigável';
        const establishmentName = barber?.shop_name || barber?.name || 'Barber Shop';

        let systemPrompt;

        if (isAdmin) {
            systemPrompt = ADMIN_PROMPTS.system_admin({ establishmentName });
        } else {
            const servicesData = await DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(barberEmail).all();
            const servicesList = servicesData.results.map(s => `✂️ ${s.name}: R$ ${s.price}`).join('\n');

            let teamContext = "";
            if (barber?.business_type === 'barbearia') {
                const team = await env.DB.prepare('SELECT name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(barberEmail, barberEmail).all();
                if (team.results.length > 0) {
                    teamContext = `\nNOSSA EQUIPE DE PROFISSIONAIS:\n${team.results.map(t => `- ${t.name}`).join('\n')}`;
                }
            }

            systemPrompt = CLIENT_PROMPTS.system_ai({
                bName,
                bTone,
                establishmentName,
                servicesList,
                teamContext
            });
        }

        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ]
        });

        if (isAdmin) {
            return response.response || `Olá, Chefe! Como posso ajudar na gestão hoje?`;
        }
        return response.response || `Estou aqui para ajudar! Digite '1' para agendar, '2' para ver seus horários ou '3' para falar comigo.`;
    } catch (_e) {
        return isAdmin ? "Olá, Chefe! O que deseja fazer?" : "Olá! Como posso te ajudar? Digite '1' para agendar ou 'Menu' para o início.";
    }
};
