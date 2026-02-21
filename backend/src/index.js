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
         const tableInfo = await DB.prepare('PRAGMA table_info(users)').all();
         const columns = tableInfo.results.map(r => r.name);
    
         // Lista de todas as colunas novas que seu app precisa
         const requiredCols = [
            'msg_welcome', 
            'msg_choose_barber', 
            'msg_choose_service', 
            'msg_confirm_booking',
            'wa_bridge_url', 
            'wa_status', 
            'wa_qr', 
            'wa_last_seen'
        ];
    
        for (const col of requiredCols) {
            if (!columns.includes(col)) {
                // Usamos um .catch() interno para que, se der erro em uma coluna, as outras continuem
                await DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT`)
                    .run()
                    .catch(() => console.log(`Aviso: Coluna ${col} já existe ou não pôde ser criada.`));
                }
            }
            } catch {
                console.error('[Migration] Erro ao verificar esquema:', e.message);
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

            // --- WHATSAPP BRIDGE STATUS UPDATES (RECUPERADO) ---
                if ((url.pathname === '/api/whatsapp/status' || url.pathname === '/api/admin/bridge/update') && request.method === 'POST') {
                const { email, status, qr } = await request.json();
                const now = new Date().toISOString();
                
                if (status === 'qr') {
                    await DB.prepare('UPDATE users SET wa_status = "awaiting_qr", wa_qr = ?, wa_last_seen = ? WHERE email = ?').bind(qr, now, email).run();
                } else if (status === 'connected') {
                    await DB.prepare('UPDATE users SET wa_status = "connected", wa_qr = NULL, wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                } else if (status === 'heartbeat') {
                    await DB.prepare('UPDATE users SET wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                } else {
                    await DB.prepare('UPDATE users SET wa_status = "disconnected", wa_qr = NULL, wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                }

                // Autoconfiguração para o Master Email
                if (email === MASTER_EMAIL) {
                    const check = await DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(MASTER_EMAIL).first();
                    if (!check?.subscription_expires || new Date(check.subscription_expires) < new Date()) {
                        const future = new Date(); future.setFullYear(future.getFullYear() + 10);
                        await DB.prepare('UPDATE users SET subscription_expires = ?, plan = "Barber Shop", business_type = "barbearia" WHERE email = ?').bind(future.toISOString(), MASTER_EMAIL).run();
                    }
                }
                return json({ success: true });
            }

            // Rota GET para o Dashboard consultar o status
            if (url.pathname === '/api/whatsapp/status' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await DB.prepare('SELECT wa_status, wa_qr, wa_last_seen FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);
                
                let status = user.wa_status || 'disconnected';
                // Checagem de timeout (se a bridge sumir por mais de 45s)
                if (status === 'connected' && user.wa_last_seen) {
                    if ((new Date() - new Date(user.wa_last_seen)) > 45000) {
                        status = 'disconnected';
                        await DB.prepare('UPDATE users SET wa_status = "disconnected" WHERE email = ?').bind(email).run();
                    }
                }
                return json({ status, qr: user.wa_qr });
            }

            // --- ROTA DE LOGIN (PARA O FRONTEND) ---
            if (url.pathname === '/api/login' && request.method === 'POST') {
                const userData = await request.json();
                await DB.prepare(`
                    INSERT INTO users (email, name, picture, phone, last_login)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name,
                    picture = excluded.picture,
                    phone = COALESCE(excluded.phone, users.phone),
                    last_login = CURRENT_TIMESTAMP
                `).bind(userData.email, userData.name, userData.picture, userData.phone || null).run();

                const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(userData.email).first();
                return json({
                    user: {
                        ...user,
                        isAdmin: user.is_admin === 1,
                        isMaster: user.email === MASTER_EMAIL,
                        isBarber: user.is_barber === 1
                    }
                });
            }

            return json({ error: 'Not Found' }, 404);

        } catch (e) {
            console.error('[Global Error]', e);
            return json({ error: 'Internal Server Error', message: e.message }, 500);
        }
    }
};