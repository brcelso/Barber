/**
 * Agentic AI Logic for Barber Bot - Atualizado para Schema D1
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Consulta horários ocupados para um barbeiro.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro' }
            },
            required: ['appointment_date', 'barber_email']
        }
    },
    {
        name: 'criar_agendamento',
        description: 'Cria um novo agendamento no sistema.',
        parameters: {
            type: 'object',
            properties: {
                user_email: { type: 'string', description: 'E-mail do cliente' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro' },
                service_id: { type: 'string', description: 'O ID textual do serviço' },
                appointment_date: { type: 'string', description: 'Data YYYY-MM-DD' },
                appointment_time: { type: 'string', description: 'Hora HH:mm' }
            },
            required: ['user_email', 'service_id', 'appointment_date', 'appointment_time']
        }
    },
    {
        name: 'get_faturamento_hoje',
        description: 'Calcula o total de ganhos confirmados hoje (apenas para admins).',
        parameters: {
            type: 'object',
            properties: {
                barber_email: { type: 'string', description: 'E-mail do barbeiro para filtrar' }
            },
            required: ['barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext, userEmail }) {
    const { DB, AI } = env;

    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    const aiResponse = await AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS
    });

    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        const call = aiResponse.tool_calls[0];
        let toolData = "";

        // --- 1. CONSULTA DE AGENDA (Ajustado para appointment_date) ---
        if (call.name === 'consultar_agenda') {
            const { appointment_date, barber_email } = call.arguments;
            const res = await DB.prepare(
                'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"'
            ).bind(appointment_date, barber_email).all();
            
            toolData = res.results.length > 0 
                ? `Horários ocupados em ${appointment_date}: ${res.results.map(r => r.appointment_time).join(', ')}`
                : `A agenda para o dia ${appointment_date} está totalmente livre.`;
        }

        // --- 2. CRIAR AGENDAMENTO (Ajustado para o seu Schema D1) ---
        if (call.name === 'criar_agendamento') {
            const id = crypto.randomUUID(); // Gera o ID TEXT necessário
            const { user_email, barber_email, service_id, appointment_date, appointment_time } = call.arguments;
            
            await DB.prepare(`
                INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
            `).bind(id, user_email, barber_email || null, service_id, appointment_date, appointment_time).run();
            
            toolData = "Agendamento realizado com sucesso no sistema.";
        }

        // --- 3. FATURAMENTO (Ajustado com JOIN pois appointments não tem preço direto) ---
        if (call.name === 'get_faturamento_hoje' && isAdmin) {
            const stats = await DB.prepare(`
                SELECT SUM(s.price) as total 
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                WHERE a.payment_status = 'paid' 
                AND a.appointment_date = DATE('now')
                AND a.barber_email = ?
            `).bind(call.arguments.barber_email).first();
            
            toolData = `Total faturado hoje: R$ ${stats?.total || 0}`;
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