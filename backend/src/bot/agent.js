/**
 * Agentic AI Logic for Barber Bot
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Consulta horários ocupados para um barbeiro em uma data específica.',
        parameters: {
            type: 'object',
            properties: {
                data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
                barbeiro_email: { type: 'string', description: 'E-mail do barbeiro' }
            },
            required: ['data', 'barbeiro_email']
        }
    },
    {
        name: 'get_faturamento_hoje',
        description: 'Calcula o total de ganhos confirmados no dia de hoje.',
        parameters: {
            type: 'object',
            properties: {
                barbeiro_email: { type: 'string', description: 'E-mail do barbeiro ou dono' }
            },
            required: ['barbeiro_email']
        }
    }
];

/**
 * Runs the Agent Chat logic. 
 * Can be called from the API or directly from the bot handlers.
 */
export async function runAgentChat(env, { prompt, isAdmin, barberContext }) {
    const { DB, AI } = env;

    // 1. O Modelo decide se precisa de ferramenta
    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    const aiResponse = await AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS
    });

    // 2. Execução da "Agência" (Se a IA chamar uma ferramenta)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        const call = aiResponse.tool_calls[0];
        let toolData = "";

        if (call.name === 'consultar_agenda') {
            const res = await DB.prepare(
                'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"'
            ).bind(call.arguments.data, call.arguments.barbeiro_email).all();
            toolData = `Horários ocupados: ${res.results.map(r => r.appointment_time).join(', ') || 'Nenhum'}`;
        }

        if (call.name === 'get_faturamento_hoje' && isAdmin) {
            const stats = await DB.prepare(
                "SELECT SUM(price) as total FROM appointments WHERE payment_status = 'paid' AND appointment_date = CURRENT_DATE AND (barber_email = ? OR owner_id = ?)"
            ).bind(call.arguments.barbeiro_email, call.arguments.barbeiro_email).first();
            toolData = `Total faturado hoje: R$ ${stats.total || 0}`;
        }

        // 3. Resposta Final baseada nos dados reais
        const final = await AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: String(systemPrompt) },
                { role: 'user', content: String(prompt) },
                { role: 'assistant', content: '', tool_calls: [call] },
                { role: 'tool', name: call.name, tool_call_id: call.id, content: String(toolData) }
            ]
        });
        return { text: final.response };
    }

    return { text: aiResponse.response };
}
