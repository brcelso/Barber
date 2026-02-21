/**
 * Barber App Server - Cloudflare Worker
 * Agentic AI Version
 */

import { corsHeaders, json, getMasterEmail } from './utils/index.js';
import { handleWhatsAppWebhook } from './bot/index.js';
import { handleAdminRoutes } from './api/admin.js';
import { handleMasterRoutes } from './api/master.js';
import { handleAppointmentRoutes } from './api/appointments.js';
import { handleUserRoutes } from './api/user.js';
import { handlePaymentRoutes } from './api/payments.js';
import { handleTeamRoutes } from './api/team.js';
import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './bot/prompts.js';

// --- FERRAMENTAS DO AGENTE (TOOLS) ---
const BARBER_TOOLS = [
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

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const { DB } = env;
        const MASTER_EMAIL = getMasterEmail(env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Schema Migration Check ---
            try {
                const colCheck = await DB.prepare('PRAGMA table_info(users)').all();
                const cols = colCheck.results.map(r => r.name);
                const newCols = ['msg_welcome', 'msg_choose_barber', 'msg_choose_service', 'msg_confirm_booking'];
                for (const col of newCols) {
                    if (!cols.includes(col)) {
                        await DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT`).run();
                    }
                }
            } catch (e) {
                console.error('[Schema Migration] Failed:', e.message);
            }

            // --- ROTA DE INTELIGÊNCIA CENTRAL (AGENTE) ---
            if (url.pathname === '/api/agent/chat' && request.method === 'POST') {
                const { prompt, isAdmin, barberContext } = await request.json();

                // 1. O Modelo decide se precisa de ferramenta
                const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                    messages: [
                        { role: 'system', content: isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext) },
                        { role: 'user', content: prompt }
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
                    const final = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                        messages: [
                            { role: 'system', content: isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext) },
                            { role: 'user', content: prompt },
                            { role: 'assistant', tool_calls: [call] },
                            { role: 'tool', name: call.name, content: toolData }
                        ]
                    });
                    return json({ text: final.response });
                }
                return json({ text: aiResponse.response });
            }

            // --- Health Check ---
            if (url.pathname === '/') {
                return json({ status: 'API Online', app_name: env.GLOBAL_APP_NAME || 'Barber API', time: new Date().toISOString() });
            }

            // --- Modular Routes ---
            if (url.pathname === '/api/whatsapp/webhook' && request.method === 'POST') {
                return await handleWhatsAppWebhook(request, env);
            }

            // Delegar para outros módulos
            const adminRes = await handleAdminRoutes(url, request, env); if (adminRes) return adminRes;
            const masterRes = await handleMasterRoutes(url, request, env); if (masterRes) return masterRes;
            const apptRes = await handleAppointmentRoutes(url, request, env); if (apptRes) return apptRes;
            const userRes = await handleUserRoutes(url, request, env); if (userRes) return userRes;
            const payRes = await handlePaymentRoutes(url, request, env); if (payRes) return payRes;
            const teamRes = await handleTeamRoutes(request, env, url); if (teamRes) return teamRes;

            // ... (Resto do código de Login e Status Webhook mantidos igual) ...
            // [Cortei aqui por espaço, mas você mantém o que já tinha abaixo no seu arquivo original]

            return json({ error: 'Not Found' }, 404);

        } catch (e) {
            console.error('[Global Error]', e);
            return json({ error: 'Internal Server Error', message: e.message }, 500);
        }
    }
};