/**
 * Barber App Server - Cloudflare Worker
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Email',
        };

        const json = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

        const MASTER_EMAIL = env.SUPER_ADMIN_EMAIL || 'celsosilvajunior90@gmail.com';

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Schema Migration Check ---
            try {
                // Ensure columns exist in users table for bot templates
                const colCheck = await env.DB.prepare('PRAGMA table_info(users)').all();
                const cols = colCheck.results.map(r => r.name);
                const newCols = ['msg_welcome', 'msg_choose_barber', 'msg_choose_service', 'msg_confirm_booking'];
                for (const col of newCols) {
                    if (!cols.includes(col)) {
                        await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT`).run();
                    }
                }
            } catch (e) {
                console.error('[Schema Migration] Failed:', e.message);
            }

            // --- Helper: Notify WhatsApp (Custom Bridge Script) ---
            // --- Helper: Notify WhatsApp (Custom Bridge Script) ---
            const notifyWhatsApp = async (appointmentId, status) => {
                const BRIDGE_URL = env.WA_BRIDGE_URL;
                const BRIDGE_KEY = env.WA_BRIDGE_KEY;

                try {
                    const appt = await env.DB.prepare(`
                        SELECT a.*, s.name as service_name, u.phone, u.name as user_name, b.name as barber_name, 
                               b.welcome_message, b.business_type, b.bot_name
                        FROM appointments a
                        JOIN services s ON a.service_id = s.id
                        JOIN users u ON a.user_email = u.email
                        LEFT JOIN users b ON a.barber_email = b.email
                        WHERE a.id = ?
                    `).bind(appointmentId).first();

                    if (!appt || !appt.phone) return;

                    const barberEmail = appt.barber_email || MASTER_EMAIL;
                    const barberUser = await env.DB.prepare('SELECT subscription_expires, owner_id FROM users WHERE email = ?').bind(barberEmail).first();

                    let expiresStr = barberUser?.subscription_expires;

                    // INHERITANCE: If staff, use owner's subscription
                    if (barberUser?.owner_id) {
                        const owner = await env.DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(barberUser.owner_id).first();
                        expiresStr = owner?.subscription_expires;
                    }

                    const now = new Date();
                    let expires = expiresStr ? new Date(expiresStr) : null;

                    // MASTER PRIVILEGE: Master is always active
                    if (barberEmail === MASTER_EMAIL) {
                        expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // 1 year fake buffer
                    }

                    if (!expires || expires < now) {
                        console.log(`[WhatsApp] AVISO: Assinatura do barbeiro ${barberEmail} (ou seu dono) vencida.`);
                        return;
                    }

                    let message = "";
                    const dateParts = appt.appointment_date.split('-');
                    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                    if (status === 'confirmed') {
                        // Use template from DB or default
                        const template = appt.welcome_message || `✅ *Agendamento Confirmado!* \n\nOlá {{user_name}}, seu horário para *{{service_name}}* com {{barber_name}} no dia *{{date}}* às *{{time}}* foi confirmado. \n\nTe esperamos lá! ✂️`;
                        message = template
                            .replace(/{{user_name}}/g, appt.user_name)
                            .replace(/{{service_name}}/g, appt.service_name)
                            .replace(/{{barber_name}}/g, appt.barber_name || 'Profissional')
                            .replace(/{{date}}/g, formattedDate)
                            .replace(/{{time}}/g, appt.appointment_time);
                    } else if (status === 'cancelled') {
                        message = `❌ *Agendamento Cancelado* \n\nOlá ${appt.user_name}, informamos que o agendamento para *${appt.service_name}* com *${appt.barber_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi cancelado.`;
                    } else if (status === 'pending') {
                        message = `⏳ *Agendamento Recebido* \n\nOlá ${appt.user_name}, seu agendamento para *${appt.service_name}* com *${appt.barber_name || 'Profissional'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi recebido e está sendo processado.`;
                    }

                    if (message) {
                        const cleanPhone = appt.phone.replace(/\D/g, "");
                        const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
                        if (BRIDGE_URL && BRIDGE_KEY) {
                            await fetch(`${BRIDGE_URL}/send-message`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    key: BRIDGE_KEY,
                                    number: finalPhone,
                                    message: message,
                                    barber_email: barberEmail
                                })
                            });
                        }
                    }
                } catch (e) {
                    console.error('[WhatsApp Notify Error]', e);
                }
            };

            // --- Routes ---

            // Health check
            if (url.pathname === '/') {
                return json({
                    status: 'API Online',
                    app_name: env.GLOBAL_APP_NAME || 'Barber API',
                    time: new Date().toISOString()
                });
            }

            // Test AI Response
            if (url.pathname === '/api/test/ai' && request.method === 'GET') {
                const message = url.searchParams.get('message');
                const botBarberEmail = url.searchParams.get('email') || MASTER_EMAIL;

                const barber = await env.DB.prepare('SELECT name, bot_name, business_type, bot_tone FROM users WHERE email = ?').bind(botBarberEmail).first();
                const bName = barber?.bot_name || 'Leo';
                const bType = barber?.business_type || 'barbearia';
                const bTone = barber?.bot_tone || 'prestativo e amigável';
                const barberName = barber ? barber.name : 'Central';

                const services = await env.DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(botBarberEmail).all();
                const servicesList = services.results.length > 0
                    ? services.results.map((s, i) => `✂️ ${s.name}: R$ ${s.price}`).join('\n')
                    : "Consulte nossos serviços no agendamento.";

                const systemPrompt = `Você é o ${bName}, o assistente virtual do(a) ${bType} ${barberName}. 
Seu objetivo é ser extremamente ${bTone}, eficiente e focado em converter conversas em agendamentos.
INSTRUÇÕES DE FLUXO:
- Se o cliente quiser agendar, diga para ele digitar "1".
- Se ele quiser ver ou cancelar agendamentos existentes, diga para digitar "2".
- Se ele tiver dúvidas sobre preços, horários ou serviços, responda de forma curta e induza ele a digitar "1" para reservar.
SERVIÇOS E PREÇOS:
${servicesList}
REGRAS DE RESPOSTA:
1. Seja amigável mas direto. Use no máximo 3 frases.
2. Use emojis moderadamente condizentes com o negócio (${bType}).
3. SEMPRE termine sua resposta chamando para uma ação numérica, por exemplo: 
   "Digite *1* para garantir seu horário ou *2* para ver seus agendamentos."
4. NUNCA invente serviços ou preços que não estão na lista acima.
5. Se não souber algo, peça para o cliente digitar "Menu" para falar com um humano ou ver as opções básicas.`;

                const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ]
                });
                return json({
                    prompt: systemPrompt,
                    response: aiResponse.response
                });
            }

            // Subscription Status
            if (url.pathname === '/api/admin/subscription' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await env.DB.prepare('SELECT is_admin, is_barber, subscription_expires, trial_used, plan, owner_id FROM users WHERE email = ?').bind(email).first();
                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) return json({ error: 'Permission Denied' }, 403);

                let expiresStr = user.subscription_expires;
                let activePlan = user.plan;
                let isStaff = !!user.owner_id;

                // INHERITANCE LOGIC
                if (isStaff) {
                    const owner = await env.DB.prepare('SELECT subscription_expires, plan FROM users WHERE email = ?').bind(user.owner_id).first();
                    expiresStr = owner?.subscription_expires;
                    activePlan = 'Barber Shop (Staff)';
                }

                const now = new Date();
                let expires = expiresStr ? new Date(expiresStr) : new Date();

                // MASTER UI REPAIR
                if (email === MASTER_EMAIL) {
                    expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3650); // 10 years
                    expiresStr = expires.toISOString();
                    activePlan = 'Lifetime (Master)';
                }

                const diffTime = expires - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return json({
                    daysLeft: Math.max(0, diffDays),
                    expires: expiresStr,
                    isActive: diffTime > 0,
                    trialUsed: !!user.trial_used,
                    isMaster: email === MASTER_EMAIL,
                    plan: activePlan,
                    isBarber: user.is_barber === 1,
                    isStaff: isStaff
                });
            }

            // WhatsApp Bridge Status Update
            if (url.pathname === '/api/whatsapp/status' && request.method === 'POST') {
                const { email, status, qr } = await request.json();
                const now = new Date().toISOString();
                if (status === 'qr') {
                    await env.DB.prepare('UPDATE users SET wa_status = "awaiting_qr", wa_qr = ?, wa_last_seen = ? WHERE email = ?').bind(qr, now, email).run();
                } else if (status === 'connected') {
                    await env.DB.prepare('UPDATE users SET wa_status = "connected", wa_qr = NULL, wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                } else if (status === 'heartbeat') {
                    await env.DB.prepare('UPDATE users SET wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                } else {
                    await env.DB.prepare('UPDATE users SET wa_status = "disconnected", wa_qr = NULL, wa_last_seen = ? WHERE email = ?').bind(now, email).run();
                }

                // AUTO-REPAIR MASTER SUBSCRIPTION: Ensure Celso is always active
                if (email === MASTER_EMAIL) {
                    const check = await env.DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(MASTER_EMAIL).first();
                    const exp = check?.subscription_expires ? new Date(check.subscription_expires) : null;
                    const future = new Date();
                    future.setFullYear(future.getFullYear() + 10); // 10 years

                    if (!exp || exp < new Date()) {
                        console.log('[Auto-Repair] Renewing Master Subscription...');
                        await env.DB.prepare('UPDATE users SET subscription_expires = ?, plan = "Barber Shop", business_type = "barbearia" WHERE email = ?')
                            .bind(future.toISOString(), MASTER_EMAIL).run();
                    }
                }

                return json({ success: true });
            }

            // MASTER: Global Stats
            if (url.pathname === '/api/master/stats' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const stats = {
                    totalUsers: await env.DB.prepare('SELECT COUNT(*) as count FROM users').first(),
                    totalBarbers: await env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_barber = 1').first(),
                    activeAdmins: await env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').first(),
                    totalAppointments: await env.DB.prepare('SELECT COUNT(*) as count FROM appointments').first(),
                    connectedBots: await env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE wa_status = "connected"').first(),
                    planCounts: await env.DB.prepare('SELECT plan, COUNT(*) as count FROM users WHERE plan IS NOT NULL GROUP BY plan').all()
                };
                return json(stats);
            }

            // MASTER: List All Barbers/Admins
            if (url.pathname === '/api/master/users' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const usersListing = await env.DB.prepare("SELECT email, name, phone, is_admin, is_barber, wa_status, wa_last_seen, subscription_expires, trial_used, plan, business_type, owner_id, shop_name FROM users WHERE email != 'sistema@leoai.br' ORDER BY created_at DESC").all();

                const now = new Date();
                const results = usersListing.results.map(u => {
                    let finalStatus = u.wa_status;
                    if (u.wa_status === 'connected' && u.wa_last_seen) {
                        const lastSeen = new Date(u.wa_last_seen);
                        if ((now - lastSeen) > 120000) { // 2 minutes
                            finalStatus = 'disconnected';
                        }
                    }
                    return { ...u, wa_status: finalStatus };
                });

                return json(results);
            }

            // MASTER: Update User Role/Subscription/Phone/Name/Email
            if (url.pathname === '/api/master/user/update' && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const { targetEmail, is_admin, is_barber, expires, plan, phone, newName, newEmail, newShopName } = await request.json();

                await env.DB.prepare(`
                    UPDATE users 
                    SET is_admin = ?, is_barber = ?, subscription_expires = ?, plan = ?, phone = ?, name = ?, email = ?, shop_name = ?
                    WHERE email = ?
                `).bind(
                    is_admin ? 1 : 0,
                    is_barber ? 1 : 0,
                    expires || null,
                    plan || null,
                    phone || null,
                    newName || null,
                    newEmail || targetEmail,
                    newShopName || null,
                    targetEmail
                ).run();

                return json({ success: true });
            }

            // MASTER: Delete User
            if (url.pathname === '/api/master/user/delete' && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const { targetEmail } = await request.json();
                if (targetEmail === MASTER_EMAIL) return json({ error: 'Cannot delete master user' }, 400);

                // Delete dependencies first if any (e.g., appointments, whatsapp_sessions)
                await env.DB.prepare('DELETE FROM appointments WHERE user_email = ? OR barber_email = ?').bind(targetEmail, targetEmail).run();
                await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE user_email = ?').bind(targetEmail).run();
                await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(targetEmail).run();

                return json({ success: true });
            }

            // Get WhatsApp Bridge Status (for Frontend)
            if (url.pathname === '/api/whatsapp/status' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');

                // Aproveitar a chamada do admin para limpar dados velhos (> 60 dias)
                // Isso mantém o banco leve e dentro do plano gratuito da Cloudflare
                try {
                    const sixtyDaysAgo = new Date();
                    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                    const dateStr = sixtyDaysAgo.toISOString().split('T')[0];

                    await env.DB.prepare('DELETE FROM appointments WHERE appointment_date < ?').bind(dateStr).run();
                } catch (e) {
                    console.error('[Cleanup Error]', e.message);
                }

                const user = await env.DB.prepare('SELECT wa_status, wa_qr, wa_last_seen FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);

                // Heartbeat Check: Se não houve sinal de vida em 2 minutos, considera desconectado
                let status = user.wa_status || 'disconnected';
                if (status === 'connected' && user.wa_last_seen) {
                    const lastSeen = new Date(user.wa_last_seen);
                    const now = new Date();
                    // Reduzido para 45s (Heartbeat é 30s)
                    if ((now - lastSeen) > 45000) {
                        status = 'disconnected';
                        // Persist disconnected status to avoid flickering
                        try {
                            await env.DB.prepare('UPDATE users SET wa_status = "disconnected" WHERE email = ?').bind(email).run();
                        } catch (e) { }
                    }
                }

                return json({ status, qr: user.wa_qr });
            }

            // Mock Payment (3-day trial)
            if (url.pathname === '/api/admin/subscription/pay' && request.method === 'POST') {
                const { email } = await request.json();
                const user = await env.DB.prepare('SELECT is_admin, subscription_expires, trial_used FROM users WHERE email = ?').bind(email).first();
                if (!user || user.is_admin !== 1) return json({ error: 'Permission Denied' }, 403);

                if (user.trial_used) {
                    return json({ error: 'Trial already used' }, 400);
                }

                // Add 3 days to existing or now
                const currentExpires = user.subscription_expires ? new Date(user.subscription_expires) : new Date();
                const base = currentExpires > new Date() ? currentExpires : new Date();
                base.setDate(base.getDate() + 3);
                const newExpires = base.toISOString();

                await env.DB.prepare('UPDATE users SET subscription_expires = ?, trial_used = 1 WHERE email = ?').bind(newExpires, email).run();
                return json({ success: true, newExpires, daysLeft: 3 });
            }

            // Create Subscription Payment Link
            if (url.pathname === '/api/admin/subscription/payment' && request.method === 'POST') {
                const { email, planId } = await request.json();
                const user = await env.DB.prepare('SELECT is_admin, subscription_expires FROM users WHERE email = ?').bind(email).first();
                if (!user || user.is_admin !== 1) return json({ error: 'Permission Denied' }, 403);

                const plans = {
                    starter: { name: 'Plano Starter', price: 59.90 },
                    pro: { name: 'Plano Pro AI', price: 119.90 },
                    business: { name: 'Plano Barber Shop', price: 189.90 }
                };

                const plan = plans[planId] || plans.pro;

                const mpPreference = {
                    items: [{
                        title: `Assinatura Barber App - ${plan.name} (30 Dias)`,
                        quantity: 1,
                        unit_price: plan.price,
                        currency_id: 'BRL'
                    }],
                    external_reference: `sub_${email}_${planId || 'pro'}`,
                    back_urls: {
                        success: `${env.FRONTEND_URL}/?subscription=success`,
                        failure: `${env.FRONTEND_URL}/?subscription=failure`,
                        pending: `${env.FRONTEND_URL}/?subscription=pending`
                    },
                    auto_return: 'approved'
                };

                console.log(`[Subscription] Creating payment link for ${email} - Plan: ${plan.name}`);

                const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(mpPreference)
                });

                const mpData = await mpResponse.json();

                if (!mpResponse.ok) {
                    console.error('[Mercado Pago Error]', mpData);
                    return json({ error: 'Mercado Pago API error', details: mpData }, mpResponse.status);
                }

                console.log(`[Subscription] Link created: ${mpData.init_point}`);
                return json({ paymentUrl: mpData.init_point });
            }

            // Authentication / Login
            if (url.pathname === '/api/login' && request.method === 'POST') {
                const userData = await request.json();

                await env.DB.prepare(`
                    INSERT INTO users (email, name, picture, phone, last_login)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name,
                    picture = excluded.picture,
                    phone = COALESCE(excluded.phone, users.phone),
                    last_login = CURRENT_TIMESTAMP
                `).bind(userData.email, userData.name, userData.picture, userData.phone || null).run();

                const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(userData.email).first();
                return json({
                    user: {
                        ...user,
                        isAdmin: user.is_admin === 1,
                        isMaster: user.email === MASTER_EMAIL,
                        isBarber: user.is_barber === 1
                    }
                });
            }

            // Get Styles/Services (exclude internal 'block' service)
            if (url.pathname === '/api/services' && request.method === 'GET') {
                const barberEmail = url.searchParams.get('barber_email');

                if (barberEmail) {
                    // First, try to get services specific to this barber
                    let services = await env.DB.prepare('SELECT * FROM services WHERE id != ? AND barber_email = ?').bind('block', barberEmail).all();

                    // FALLBACK: If no services found for this barber, check if they're staff and use owner's services
                    if (services.results.length === 0) {
                        const barber = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(barberEmail).first();
                        if (barber && barber.owner_id) {
                            services = await env.DB.prepare('SELECT * FROM services WHERE id != ? AND barber_email = ?').bind('block', barber.owner_id).all();
                        }
                    }

                    return json(services.results);
                } else {
                    // No barber specified, return all services (excluding blocks)
                    const services = await env.DB.prepare('SELECT * FROM services WHERE id != ?').bind('block').all();
                    return json(services.results);
                }
            }

            // Get All Barbers
            if (url.pathname === '/api/barbers' && request.method === 'GET') {
                const barbers = await env.DB.prepare('SELECT email, name, picture, business_type, owner_id, shop_name FROM users WHERE is_barber = 1').all();
                const final = barbers.results.map(b => ({
                    ...b,
                    ownerId: b.owner_id // Map snake_case to camelCase
                }));
                return json(final);
            }

            // Create Team Member (Shop Owner adds staff)
            if (url.pathname === '/api/team/add' && request.method === 'POST') {
                const { name, email, ownerEmail } = await request.json();

                // Verify if requester is really the owner AND has a Barber Shop plan
                const requester = await env.DB.prepare('SELECT is_barber, plan, subscription_expires FROM users WHERE email = ?').bind(ownerEmail).first();
                if (!requester || requester.is_barber !== 1) return json({ error: 'Unauthorized' }, 401);

                const now = new Date();
                const expires = requester.subscription_expires ? new Date(requester.subscription_expires) : null;
                const hasBarberShopPlan = requester.plan?.includes('Barber Shop') || ownerEmail === MASTER_EMAIL;

                if (!hasBarberShopPlan) {
                    return json({ error: 'Você precisa do plano "Barber Shop" para gerenciar uma equipe.' }, 403);
                }

                if (!expires || expires < now) {
                    return json({ error: 'Sua assinatura expirou. Renove para adicionar membros.' }, 403);
                }

                // Insert new staff member linked to owner
                try {
                    await env.DB.prepare(`
                        INSERT INTO users (email, name, is_admin, is_barber, owner_id, business_type, picture, created_at)
                        VALUES (?, ?, 1, 1, ?, 'staff', ?, CURRENT_TIMESTAMP)
                    `).bind(
                        email,
                        name,
                        ownerEmail,
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
                    ).run();
                    return json({ success: true });
                } catch (e) {
                    if (e.message.includes('UNIQUE')) {
                        return json({ error: 'Email já cadastrado' }, 409);
                    }
                    return json({ error: e.message }, 500);
                }
            }

            // Recruit Existing Barber (Shop Owner recruits independent barber)
            if (url.pathname === '/api/team/recruit' && request.method === 'POST') {
                const { email, ownerEmail } = await request.json();

                // 1. Verify Owner and Plan
                const owner = await env.DB.prepare('SELECT is_barber, plan, subscription_expires FROM users WHERE email = ?').bind(ownerEmail).first();
                if (!owner || owner.is_barber !== 1) return json({ error: 'Apenas barbeiros/donos podem recrutar' }, 403);

                const now = new Date();
                const expires = owner.subscription_expires ? new Date(owner.subscription_expires) : null;
                const hasBarberShopPlan = owner.plan?.includes('Barber Shop') || ownerEmail === MASTER_EMAIL;

                if (!hasBarberShopPlan) {
                    return json({ error: 'Você precisa do plano "Barber Shop" para recrutar barbeiros para sua equipe.' }, 403);
                }

                if (!expires || expires < now) {
                    return json({ error: 'Sua assinatura expirou. Renove para recrutar membros.' }, 403);
                }

                // 2. Verify Target (Must be barber and independent)
                const target = await env.DB.prepare('SELECT is_barber, owner_id FROM users WHERE email = ?').bind(email).first();
                if (!target) return json({ error: 'Usuário não encontrado' }, 404);
                if (target.is_barber !== 1) return json({ error: 'Apenas barbeiros podem ser recrutados. Promova o usuário primeiro.' }, 400);
                if (target.owner_id) return json({ error: 'Este barbeiro já pertence a uma equipe.' }, 409);

                // 3. Execute Recruitment
                await env.DB.prepare(`
                    UPDATE users 
                    SET owner_id = ?, business_type = 'staff' 
                    WHERE email = ?
                `).bind(ownerEmail, email).run();

                return json({ success: true, message: 'Barbeiro recrutado com sucesso!' });
            }

            // Remove Team Member (Shop Owner removes staff)
            if (url.pathname === '/api/team/remove' && request.method === 'POST') {
                const { memberEmail, ownerEmail } = await request.json();

                // 1. Verify Owner (requester)
                const owner = await env.DB.prepare('SELECT is_barber FROM users WHERE email = ?').bind(ownerEmail).first();
                if (!owner || owner.is_barber !== 1) return json({ error: 'Unauthorized' }, 401);

                // 2. Execute Removal (Set owner_id to NULL, business_type back to 'individual' and CLEAR PLAN)
                await env.DB.prepare(`
                    UPDATE users 
                    SET owner_id = NULL, business_type = 'individual', subscription_expires = NULL, plan = NULL 
                    WHERE email = ? AND owner_id = ?
                `).bind(memberEmail, ownerEmail).run();

                return json({ success: true, message: 'Barbeiro removido da equipe.' });
            }

            // Promote to Barber (3-day trial)
            if (url.pathname === '/api/user/promote' && request.method === 'POST') {
                const { email } = await request.json();
                const now = new Date();
                const expires = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString();

                await env.DB.prepare(`
                    UPDATE users 
                    SET is_barber = 1, is_admin = 1, subscription_expires = ?, trial_used = 1, plan = 'Individual PRO (Trial)'
                    WHERE email = ?
                `).bind(expires, email).run();

                return json({ success: true, expires });
            }

            // Admin: Get ALL Appointments
            if (url.pathname === '/api/admin/appointments' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await env.DB.prepare('SELECT is_admin, is_barber, owner_id FROM users WHERE email = ?').bind(email).first();

                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) {
                    return json({ error: 'Permission Denied' }, 403);
                }

                let allAppointments;

                // If user is a shop owner (no owner_id), get appointments for entire team
                if (!user.owner_id) {
                    // Get all team members (owner + staff)
                    const teamEmails = await env.DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(email, email).all();
                    const emails = teamEmails.results.map(t => t.email);

                    // Build query with IN clause for all team members
                    const placeholders = emails.map(() => '?').join(',');
                    allAppointments = await env.DB.prepare(`
                        SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture, u.phone as user_phone, b.name as barber_name
                        FROM appointments a
                        LEFT JOIN services s ON a.service_id = s.id
                        LEFT JOIN users u ON a.user_email = u.email
                        LEFT JOIN users b ON a.barber_email = b.email
                        WHERE a.barber_email IN (${placeholders})
                        ORDER BY a.appointment_date DESC, a.appointment_time DESC
                    `).bind(...emails).all();
                } else {
                    // Staff member: only their own appointments
                    allAppointments = await env.DB.prepare(`
                        SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture, u.phone as user_phone, b.name as barber_name
                        FROM appointments a
                        LEFT JOIN services s ON a.service_id = s.id
                        LEFT JOIN users u ON a.user_email = u.email
                        LEFT JOIN users b ON a.barber_email = b.email
                        WHERE a.barber_email = ?
                        ORDER BY a.appointment_date DESC, a.appointment_time DESC
                    `).bind(email).all();
                }

                return json(allAppointments.results);
            }

            // Get Appointments for a user (unified history: personal + professional)
            if (url.pathname === '/api/appointments' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                if (!email) return json({ error: 'Unauthorized' }, 401);

                const appointments = await env.DB.prepare(`
                    SELECT 
                        a.*, 
                        s.name as service_name, 
                        s.price, 
                        u.name as client_name, 
                        u.picture as client_picture,
                        b.name as barber_name,
                        b.picture as barber_picture
                    FROM appointments a
                    LEFT JOIN services s ON a.service_id = s.id
                    LEFT JOIN users u ON a.user_email = u.email
                    LEFT JOIN users b ON a.barber_email = b.email
                    WHERE (a.user_email = ? OR a.barber_email = ?) AND a.status != 'blocked'
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                `).bind(email, email).all();

                return json(appointments.results);
            }

            // Book an Appointment
            if (url.pathname === '/api/appointments/book' && request.method === 'POST') {
                const { email, barberEmail, serviceId, date, time, skipPayment } = await request.json();
                if (!email || !barberEmail || !serviceId || !date || !time) {
                    return json({ error: 'Missing fields' }, 400);
                }

                const id = crypto.randomUUID();
                const service = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

                if (!service) return json({ error: 'Service not found' }, 404);

                // Check for existing appointment at same time for THIS barber
                const conflict = await env.DB.prepare('SELECT id FROM appointments WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? AND status != "cancelled"').bind(barberEmail, date, time).first();
                if (conflict) {
                    return json({ error: 'Horário já ocupado com este barbeiro' }, 409);
                }

                // Create appointment record
                await env.DB.prepare(`
                    INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending')
                `).bind(id, email, barberEmail, serviceId, date, time).run();

                if (skipPayment) {
                    return json({ appointmentId: id, status: 'pending' });
                }

                // Fallback / Legacy auto-payment logic
                return json({ appointmentId: id, status: 'pending' });
            }

            // Create Payment Link (New Route)
            if (url.pathname === '/api/payments/create' && request.method === 'POST') {
                const { appointmentId, email } = await request.json();

                const appointment = await env.DB.prepare(`
                    SELECT a.*, s.name as service_name, s.price 
                    FROM appointments a 
                    JOIN services s ON a.service_id = s.id 
                    WHERE a.id = ? AND (a.user_email = ? OR a.barber_email = ?)
                `).bind(appointmentId, email, email).first();

                if (!appointment) {
                    return json({ error: 'Agendamento não encontrado' }, 404);
                }

                const mpPreference = {
                    items: [{
                        title: `Barbearia - ${appointment.service_name}`,
                        quantity: 1,
                        unit_price: appointment.price,
                        currency_id: 'BRL'
                    }],
                    external_reference: appointmentId,
                    back_urls: {
                        success: `${env.FRONTEND_URL}/success?id=${appointmentId}`,
                        failure: `${env.FRONTEND_URL}/cancel?id=${appointmentId}`,
                        pending: `${env.FRONTEND_URL}/pending?id=${appointmentId}`
                    },
                    auto_return: 'approved'
                };

                const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(mpPreference)
                });

                const mpData = await mpResponse.json();
                console.log('[MP] Preference Created:', { id: mpData.id, url: mpData.init_point });
                return json({ paymentUrl: mpData.init_point });
            }

            // Mock Appointment Payment / Local Payment
            if (url.pathname === '/api/payments/mock' && request.method === 'POST') {
                const { appointmentId, email, method } = await request.json();
                const payMethod = method || 'Simulado/Local';

                await env.DB.prepare(`
                    UPDATE appointments 
                    SET payment_status = 'confirmed', payment_id = ?
                    WHERE id = ? AND (user_email = ? OR barber_email = ?)
                `).bind(payMethod, appointmentId, email, email).run();

                await notifyWhatsApp(appointmentId, 'confirmed');

                return json({ success: true, message: 'Pagamento confirmado localmente!' });
            }

            // Admin: Update Payment Manually (Fix mistakes)
            if (url.pathname === '/api/admin/appointments/update-payment' && request.method === 'POST') {
                const { appointmentId, adminEmail, status, paymentId } = await request.json();
                const admin = await env.DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || (admin.is_admin !== 1 && admin.is_barber !== 1)) return json({ error: 'Forbidden' }, 403);

                await env.DB.prepare(`
                    UPDATE appointments 
                    SET payment_status = ?, payment_id = ?
                    WHERE id = ?
                `).bind(status, paymentId || null, appointmentId).run();

                return json({ success: true });
            }

            // Admin: Confirm Appointment (Manual)
            if (url.pathname === '/api/admin/appointments/confirm' && request.method === 'POST') {
                const { appointmentId, adminEmail } = await request.json();
                const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

                await env.DB.prepare('UPDATE appointments SET status = "confirmed" WHERE id = ?').bind(appointmentId).run();
                await notifyWhatsApp(appointmentId, 'confirmed');

                return json({ success: true });
            }

            // Cancel Appointment (Admin or Owner)
            if (url.pathname === '/api/appointments/cancel' && request.method === 'POST') {
                const { appointmentId, userEmail } = await request.json();

                const appointment = await env.DB.prepare('SELECT user_email FROM appointments WHERE id = ?').bind(appointmentId).first();
                const user = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(userEmail).first();

                if (!appointment) return json({ error: 'Not found' }, 404);
                if (appointment.user_email !== userEmail && (!user || user.is_admin !== 1)) {
                    return json({ error: 'Unauthorized' }, 401);
                }

                await env.DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(appointmentId).run();
                await notifyWhatsApp(appointmentId, 'cancelled');
                return json({ success: true });
            }

            // Delete Appointment
            if (url.pathname === '/api/appointments/delete' && request.method === 'POST') {
                const { appointmentId, userEmail } = await request.json();
                const appointment = await env.DB.prepare('SELECT user_email FROM appointments WHERE id = ?').bind(appointmentId).first();
                const user = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(userEmail).first();

                if (!appointment) return json({ error: 'Not found' }, 404);
                if (appointment.user_email !== userEmail && (!user || user.is_admin !== 1)) {
                    return json({ error: 'Unauthorized' }, 401);
                }

                await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(appointmentId).run();
                return json({ success: true });
            }

            // Update Appointment Status (General)
            if (url.pathname === '/api/appointments/update-status' && request.method === 'POST') {
                const { appointmentId, status, userEmail } = await request.json();
                const user = await env.DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(userEmail).first();

                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) {
                    return json({ error: 'Admin or Barber only' }, 403);
                }

                await env.DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind(status, appointmentId).run();
                await notifyWhatsApp(appointmentId, status);
                return json({ success: true });
            }

            // Update User Profile (Phone)
            if (url.pathname === '/api/user/update-profile' && request.method === 'POST') {
                const { email, phone } = await request.json();
                if (!email || !phone) return json({ error: 'Missing email or phone' }, 400);

                await env.DB.prepare('UPDATE users SET phone = ? WHERE email = ?').bind(phone, email).run();
                return json({ success: true });
            }

            // Client: Edit/Update Appointment
            if (url.pathname === '/api/appointments/update' && request.method === 'POST') {
                const { appointmentId, serviceId, date, time, userEmail } = await request.json();

                const appointment = await env.DB.prepare('SELECT user_email FROM appointments WHERE id = ?').bind(appointmentId).first();
                if (!appointment || appointment.user_email !== userEmail) {
                    return json({ error: 'Unauthorized' }, 401);
                }

                // Check conflict
                const conflict = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status != "cancelled"').bind(date, time, appointmentId).first();
                if (conflict) return json({ error: 'Horário indisponível' }, 409);

                // Ensure the requested service exists to avoid FK constraint failures
                const service = await env.DB.prepare('SELECT id FROM services WHERE id = ?').bind(serviceId).first();
                if (!service) return json({ error: 'Service not found' }, 404);

                await env.DB.prepare(`
                    UPDATE appointments 
                    SET service_id = ?, appointment_date = ?, appointment_time = ?, status = 'pending'
                    WHERE id = ?
                `).bind(serviceId, date, time, appointmentId).run();

                await notifyWhatsApp(appointmentId, 'pending');
                return json({ success: true });
            }

            // Admin: Toggle Block Slot
            if (url.pathname === '/api/admin/toggle-block' && request.method === 'POST') {
                const { date, time, adminEmail } = await request.json();
                const admin = await env.DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || (admin.is_admin !== 1 && admin.is_barber !== 1)) return json({ error: 'Forbidden' }, 403);

                // Check if already blocked for THIS barber
                const existing = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND barber_email = ? AND status = "blocked"').bind(date, time, adminEmail).first();

                if (existing) {
                    await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(existing.id).run();
                    return json({ status: 'unblocked' });
                } else {
                    // Check for conflicts before blocking
                    const conflict = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND barber_email = ? AND status != "cancelled"').bind(date, time, adminEmail).first();
                    if (conflict) return json({ error: 'Já existe um agendamento neste horário' }, 409);

                    const id = `block-${crypto.randomUUID()}`;
                    try {
                        const { scope } = await request.json().catch(() => ({})); // Get scope if provided
                        const me = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(adminEmail).first();
                        const isOwner = me && !me.owner_id;

                        if (isOwner && scope === 'shop') {
                            const team = await env.DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all();
                            const statements = team.results.map(member => {
                                const bid = `block-${crypto.randomUUID()}`;
                                return env.DB.prepare(`
                                    INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                                    VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                                `).bind(bid, member.email, date, time);
                            });
                            if (statements.length > 0) await env.DB.batch(statements);
                        } else {
                            // STAFF or INDIVIDUAL scope: Block only for ME
                            await env.DB.prepare(`
                                INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                                VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                            `).bind(id, adminEmail, date, time).run();
                        }
                        return json({ status: 'blocked' });
                    } catch (e) {
                        console.error('[toggle-block] failed to insert block', e && e.message, e && e.stack);
                        // Gather diagnostic info to help identify which FK is failing
                        let userRow = null;
                        let serviceRow = null;
                        let fkCheck = null;
                        let fkList = null;
                        try {
                            userRow = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind('system').first();
                        } catch (err2) {
                            userRow = { error: err2.message };
                        }
                        try {
                            serviceRow = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind('block').first();
                        } catch (err3) {
                            serviceRow = { error: err3.message };
                        }
                        try {
                            fkCheck = await env.DB.prepare('PRAGMA foreign_key_check').all();
                        } catch (err4) {
                            fkCheck = { error: err4.message };
                        }
                        try {
                            fkList = await env.DB.prepare("PRAGMA foreign_key_list('appointments')").all();
                        } catch (err5) {
                            fkList = { error: err5.message };
                        }

                        return json({
                            error: e && e.message,
                            userRow: userRow && userRow.results ? userRow.results[0] : userRow,
                            serviceRow: serviceRow && serviceRow.results ? serviceRow.results[0] : serviceRow,
                            fkCheck: fkCheck && fkCheck.results ? fkCheck.results : fkCheck,
                            fkList: fkList && fkList.results ? fkList.results : fkList
                        }, 500);
                    }
                }
            }

            // Admin: Bulk Toggle Block Day
            if (url.pathname === '/api/admin/bulk-toggle-block' && request.method === 'POST') {
                const { date, action, adminEmail, times } = await request.json();
                const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

                if (action === 'block') {
                    const { scope } = await request.json().catch(() => ({}));
                    const me = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(adminEmail).first();
                    const isOwner = me && !me.owner_id;

                    const targetBarbers = (isOwner && scope === 'shop')
                        ? (await env.DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all()).results.map(r => r.email)
                        : [adminEmail];

                    const statements = [];
                    for (const bEmail of targetBarbers) {
                        const existingTimes = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"').bind(date, bEmail).all();
                        const busySet = new Set(existingTimes.results.map(r => r.appointment_time));

                        for (const time of times) {
                            if (!busySet.has(time)) {
                                const id = `block-${crypto.randomUUID()}`;
                                statements.push(env.DB.prepare(`
                                    INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                                    VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                                `).bind(id, bEmail, date, time));
                            }
                        }
                    }
                    if (statements.length > 0) await env.DB.batch(statements);
                    return json({ status: 'blocked' });
                } else {
                    const { scope } = await request.json().catch(() => ({}));
                    const me = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(adminEmail).first();
                    const isOwner = me && !me.owner_id;

                    if (isOwner && scope === 'shop') {
                        const team = await env.DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all();
                        const teamEmails = team.results.map(r => r.email);
                        const placeholders = teamEmails.map(() => '?').join(',');
                        await env.DB.prepare(`DELETE FROM appointments WHERE appointment_date = ? AND status = "blocked" AND barber_email IN (${placeholders})`).bind(date, ...teamEmails).run();
                    } else {
                        await env.DB.prepare('DELETE FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status = "blocked"').bind(date, adminEmail).run();
                    }
                    return json({ status: 'unblocked' });
                }
            }

            // Public: Get Busy Slots for a Date
            if (url.pathname === '/api/appointments/busy-slots' && request.method === 'GET') {
                const date = url.searchParams.get('date');
                const barberEmail = url.searchParams.get('barber_email');
                if (!date) return json({ error: 'Missing date' }, 400);

                let query = 'SELECT appointment_time as time, status FROM appointments WHERE appointment_date = ? AND status != "cancelled"';
                let params = [date];

                if (barberEmail) {
                    // We fetch slots that are busy for THIS barber specifically
                    query += ' AND barber_email = ?';
                    params.push(barberEmail);
                }

                const busy = await env.DB.prepare(query).bind(...params).all();
                return json(busy.results);
            }

            // Webhook for WhatsAppBot
            if (url.pathname === '/api/whatsapp/webhook' && request.method === 'POST') {
                const body = await request.json();
                const from = body.phone?.replace(/\D/g, ""); // Clean phone
                const text = (body.message || "").trim();
                const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const botBarberEmail = body.barber_email;

                if (!from) return json({ error: "Missing phone" }, 400);

                const sendMessage = async (phone, message) => {
                    const BRIDGE_URL = env.WA_BRIDGE_URL;
                    const BRIDGE_KEY = env.WA_BRIDGE_KEY;
                    if (!BRIDGE_URL || !BRIDGE_KEY) {
                        console.log(`[WhatsApp Bot] Bridge not set. MSG: ${message}`);
                        return;
                    }
                    const cleanPhone = phone.replace(/\D/g, "");
                    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
                    try {
                        await fetch(`${BRIDGE_URL}/send-message`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                key: BRIDGE_KEY,
                                number: finalPhone,
                                message: message,
                                barber_email: botBarberEmail
                            })
                        });
                    } catch (e) {
                        console.error('[Bot Send Error]', e.message);
                    }
                };

                let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

                let userInDb = null;
                if (!session || !session.user_email) {
                    const allUsers = await env.DB.prepare('SELECT email, phone FROM users WHERE phone IS NOT NULL').all();
                    const cleanFrom = from.replace(/\D/g, "");
                    userInDb = allUsers.results.find(u => {
                        const cleanU = (u.phone || "").replace(/\D/g, "");
                        return cleanU && (cleanU.endsWith(cleanFrom) || cleanFrom.endsWith(cleanU));
                    });
                }

                // AI Agent Helper with refined personality
                const askAI = async (userMessage, _sessionState = 'main_menu') => {
                    try {
                        const barber = await env.DB.prepare('SELECT name, shop_name, bot_name, business_type, bot_tone FROM users WHERE email = ?').bind(botBarberEmail).first();
                        const bName = barber?.bot_name || 'Leo';
                        const bType = (barber?.business_type === 'barbearia') ? 'a barbearia' : 'o profissional';
                        const bTone = barber?.bot_tone || 'prestativo e amigável';
                        const establishmentName = barber?.shop_name || barber?.name || 'Barber Shop';

                        const servicesData = await env.DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(botBarberEmail).all();
                        const servicesList = servicesData.results.map(s => `✂️ ${s.name}: R$ ${s.price}`).join('\n');

                        let teamContext = "";
                        if (barber?.business_type === 'barbearia') {
                            const team = await env.DB.prepare('SELECT name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
                            if (team.results.length > 0) {
                                teamContext = `\nNOSSA EQUIPE DE PROFISSIONAIS:\n${team.results.map(t => `- ${t.name}`).join('\n')}`;
                            }
                        }

                        const systemPrompt = `Você é o ${bName}, o assistente virtual de ${establishmentName}. 💈
Seu tom é ${bTone}, direto e profissional.

OBJETIVO:
Tirar dúvidas sobre serviços/preços e SEMPRE guiar o cliente para uma das opções do menu numerado abaixo.

IMPORTANTE:
Você DEVE SEMPRE incluir as seguintes opções ao final de sua resposta:
1️⃣ - Para AGENDAR um novo atendimento.
2️⃣ - Para CONSULTAR ou CANCELAR agendamentos existentes.
3️⃣ - Para tirar dúvidas com você (${bName}).

SEUS SERVIÇOS E PREÇOS ATUAIS:
${servicesList}
${teamContext}

DIRETRIZES DE COMPORTAMENTO:
1. SEJA ÚTIL: Responda perguntas antes de mostrar o menu.
2. SEJA CONVERSADOR: Use emojis condizentes com barbearia e linguagem natural.
3. SEMPRE MOSTRE O MENU: Não deixe o cliente sem saber o próximo passo.
4. NÃO INVENTE: Não invente horários ou serviços que não estão na lista.`;

                        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userMessage }
                            ]
                        });
                        return response.response || `Estou aqui para ajudar! Digite '1' para agendar, '2' para ver seus horários ou '3' para falar comigo.`;
                    } catch (_e) {
                        return "Olá! Como posso te ajudar? Digite '1' para agendar ou 'Menu' para o início.";
                    }
                };

                const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;

                // Fluxo Inicial / Reset Universal
                if (!session || textLower === 'oi' || textLower === 'ola' || textLower === 'menu' || textLower === 'sair' || textLower === 'ajuda' || (session.state === 'main_menu' && !session.selected_barber_email)) {
                    const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);

                    if (botBarberEmail) {
                        const b = await env.DB.prepare('SELECT email, name, business_type, shop_name, msg_welcome, msg_choose_barber FROM users WHERE email = ?').bind(botBarberEmail).first();

                        if (b) {
                            const establishmentName = b.shop_name || b.name;

                            // Se for uma Barbearia, listar a equipe (Dono + Staff)
                            if (b.business_type === 'barbearia') {
                                const team = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();

                                if (team.results.length > 1) {
                                    await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();

                                    let msg = b.msg_choose_barber || `✨ *Bem-vindo(a) à {{establishment_name}}!* \n\nPara começar, selecione o *Profissional* desejado:\n\n`;
                                    msg = msg.replace(/{{establishment_name}}/g, establishmentName);
                                    // Ordenar para o dono (b.email) aparecer primeiro
                                    const sortedTeam = team.results.sort((x, y) => x.email === botBarberEmail ? -1 : 1);
                                    sortedTeam.forEach((member, i) => { msg += `*${i + 1}* - ${member.name}\n`; });
                                    msg += "\nDigite o número correspondente!";
                                    await sendMessage(from, msg);
                                    return json({ success: true });
                                }
                                // Se só tiver 1 pessoa (o dono), cai no fluxo direto abaixo
                            }

                            // Fluxo Direto (Individual ou Loja com 1 pessoa)
                            await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
                            let msgTemplate = b.msg_welcome || `✨ *Bem-vindo(a)!* \n\nVocê está sendo atendido(a) por *{{establishment_name}}*. 📍\n\nO que deseja fazer?\n\n`;
                            let msg = msgTemplate.replace(/{{establishment_name}}/g, establishmentName);
                            msg += "1️⃣ - Agendar novo horário\n";
                            msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                            msg += "3️⃣ - Dúvidas (Falar com Assistente IA)\n";
                            msg += "\nDigite 'Menu' a qualquer momento para voltar.";
                            await sendMessage(from, msg);
                            return json({ success: true });
                        }
                    }

                    // MODO GLOBAL (Caso o bot barbearia email não esteja setado via Webhook params)
                    const barbers = await env.DB.prepare('SELECT email, name, business_type FROM users WHERE is_barber = 1').all();

                    if (barbers.results.length === 1) {
                        const b = barbers.results[0];
                        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
                        let msg = `✨ *Bem-vindo(a)!* \n\nVocê está sendo atendido(a) por *${b.name}*. 📍\n\nO que deseja fazer?\n\n`;
                        msg += "1️⃣ - Agendar novo horário\n";
                        msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                        msg += "3️⃣ - Dúvidas (Chat IA)\n";
                        msg += "\nDigite 'Menu' a qualquer momento para voltar.";
                        await sendMessage(from, msg);
                    } else if (barbers.results.length > 1) {
                        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();
                        let msg = "✨ *Bem-vindo(a)!* \n\nPara começar, selecione o *Profissional* desejado:\n\n";
                        barbers.results.forEach((b, i) => { msg += `*${i + 1}* - ${b.name}\n`; });
                        msg += "\nDigite o número correspondente!";
                        await sendMessage(from, msg);
                    } else {
                        await sendMessage(from, "⚠️ Desculpe, não encontramos profissionais ativos no momento. Tente novamente mais tarde.");
                    }
                    return json({ success: true });
                }

                // AI Intercept: Se não for um número de escolha e não for um fluxo de dados crítico
                // Lista de estados onde a IA NÃO deve interferir se o usuário digitar texto (blindagem de fluxo)
                const criticalStates = ['awaiting_barber', 'awaiting_service', 'awaiting_date', 'awaiting_time', 'awaiting_name', 'awaiting_email', 'awaiting_confirmation'];

                // Se o usuário está num fluxo crítico e digita algo que não é "Menu", o handlers específicos leem.
                // Se não for fluxo crítico, ou se for algo genérico fora do contexto, a IA assume.
                if (!isNumericChoice && !criticalStates.includes(session.state)) {
                    let aiMsg = await askAI(text, session.state);
                    if (!aiMsg.includes("1️⃣") && !aiMsg.includes("Agendar")) {
                        aiMsg += "\n\nComo posso te ajudar agora? Escolha uma opção:\n1️⃣ - Agendar\n2️⃣ - Meus Agendamentos\n3️⃣ - Dúvidas";
                    }
                    await sendMessage(from, aiMsg);
                    return json({ success: true });
                }

                // Handler Genérico para "Voltar" ou Reinício forçado dentro de fluxos
                if (textLower === 'voltar' || textLower === 'cancelar') {
                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
                    await sendMessage(from, "🔙 *Menu Principal*\n\n1️⃣ - Agendar\n2️⃣ - Meus Agendamentos\n3️⃣ - Falar com Leo");
                    return json({ success: true });
                }

                // 1. AWAITING BARBER -> MAIN MENU
                if (session.state === 'awaiting_barber') {
                    let team;
                    if (botBarberEmail) {
                        // Resgata a mesma lista mostrada no Início
                        const res = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)').bind(botBarberEmail, botBarberEmail).all();
                        team = res.results.sort((x, y) => x.email === botBarberEmail ? -1 : 1);
                    } else {
                        const res = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();
                        team = res.results;
                    }

                    const idx = parseInt(text) - 1;
                    const b = team[idx];
                    if (!b) {
                        await sendMessage(from, "❌ Opção inválida. Escolha um profissional da lista acima.");
                        return json({ success: true });
                    }

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu", selected_barber_email = ? WHERE phone = ?').bind(b.email, from).run();

                    let msg = `Você selecionou *${b.name}*. 💈\n\nO que deseja fazer?\n\n`;
                    msg += "1️⃣ - Agendar novo horário\n";
                    msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                    msg += "3️⃣ - Falar com o Leo (Dúvidas/Chat)\n";
                    msg += "\nDigite 'Menu' a qualquer momento para voltar.";

                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // 2. MAIN MENU -> BRANCHES
                if (session.state === 'main_menu') {
                    if (text === '1') {
                        if (!session.selected_barber_email) {
                            await sendMessage(from, "⚠️ Erro: Barbeiro não selecionado. Digite 'Menu' para escolher um barbeiro.");
                            return json({ success: true });
                        }
                        let services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();

                        // FALLBACK: If no services for this barber, try to get from the owner
                        if (services.results.length === 0) {
                            const barber = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(session.selected_barber_email).first();
                            if (barber && barber.owner_id) {
                                services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(barber.owner_id).all();
                            }
                        }

                        if (services.results.length === 0) {
                            await sendMessage(from, "❌ Este barbeiro ainda não cadastrou serviços. Escolha outro ou digite 'Menu'.");
                            return json({ success: true });
                        }
                        const b = await env.DB.prepare('SELECT msg_choose_service FROM users WHERE email = ?').bind(session.selected_barber_email).first();
                        let msg = b?.msg_choose_service || "📅 *Escolha o serviço:* \n";
                        services.results.forEach((s, i) => { msg += `\n*${i + 1}* - ${s.name} (R$ ${s.price})`; });
                        msg += "\n\nOu digite 'Menu' para voltar.";

                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_service" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, msg);
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
                            await sendMessage(from, "Você não possui agendamentos ativos. Digite 'Menu' para agendar um!");
                        } else {
                            let msg = "🗓️ *Seus Agendamentos:* \n";
                            appts.results.forEach((a, i) => {
                                msg += `\n*${i + 1}* - ${a.service_name} com ${a.barber_name || 'Barbeiro'} dia ${a.appointment_date} às ${a.appointment_time}`;
                            });
                            msg += "\n\nEnvie o número para *CANCELAR* ou 'Menu' para o início.";
                            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "managing_appointments", metadata = ? WHERE phone = ?')
                                .bind(JSON.stringify(appts.results.map(a => a.id)), from).run();
                            await sendMessage(from, msg);
                        }
                    } else if (text === '3') {
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, "Olá! Sou o Leo. Pode tirar suas dúvidas comigo! ✂️\n(Digite 'Menu' para voltar ao menu principal)");
                    } else {
                        await sendMessage(from, "Escolha entre 1, 2 ou 3. Ou mande 'Menu' para recomeçar.");
                    }
                    return json({ success: true });
                }

                // Chat IA Persistente
                if (session.state === 'ai_chat') {
                    if (isNumericChoice && (text === '1' || text === '2' || text === '3')) {
                        session.state = 'main_menu'; // Sai do chat se digitar número
                    } else {
                        const aiMsg = await askAI(text, session.state);
                        await sendMessage(from, aiMsg);
                        return json({ success: true });
                    }
                }

                // 3. MANAGING APPOINTMENTS
                if (session.state === 'managing_appointments') {
                    const ids = JSON.parse(session.metadata || "[]");
                    const target = ids[parseInt(text) - 1];
                    if (target) {
                        await env.DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(target).run();
                        await sendMessage(from, "✅ Agendamento cancelado com sucesso. Digite 'Menu' para voltar ao início.");
                        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                    } else {
                        await sendMessage(from, "Opção inválida. Digite o número ou 'Menu' para voltar.");
                    }
                    return json({ success: true });
                }

                // 4. AWAITING SERVICE
                if (session.state === 'awaiting_service') {
                    let services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();

                    // FALLBACK: If no services for this barber, try to get from the owner
                    if (services.results.length === 0) {
                        const barber = await env.DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(session.selected_barber_email).first();
                        if (barber && barber.owner_id) {
                            services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(barber.owner_id).all();
                        }
                    }

                    if (isNaN(parseInt(text)) || parseInt(text) < 1 || parseInt(text) > services.results.length) {
                        await sendMessage(from, "⚠️ Opção inválida! Digite apenas o NÚMERO do serviço desejado (ex: 1).");
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
                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // 5. AWAITING DATE
                if (session.state === 'awaiting_date') {
                    const idx = parseInt(text) - 1;
                    if (isNaN(idx) || idx < 0 || idx > 6) {
                        await sendMessage(from, "⚠️ Data inválida! Escolha uma opção de 1 a 7.");
                        return json({ success: true });
                    }
                    const d = new Date(); d.setDate(d.getDate() + idx);
                    const ds = d.toISOString().split('T')[0];

                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, ds).all();
                    const bt = busy.results.map(r => r.appointment_time);
                    const slots = [
                        "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                        "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                        "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
                    ];
                    let av = slots.filter(t => !bt.includes(t));

                    // Filter past times if today
                    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                    const brazilDateStr = brazilTime.toLocaleDateString("en-CA");
                    const isToday = ds === brazilDateStr;

                    if (isToday) {
                        // Buffer of 15 minutes
                        const currentTotalMinutes = brazilTime.getHours() * 60 + brazilTime.getMinutes() + 15;
                        av = av.filter(t => {
                            const [h, m] = t.split(':').map(Number);
                            return (h * 60 + m) >= currentTotalMinutes;
                        });
                    }

                    if (av.length === 0) {
                        await sendMessage(from, "❌ Sem horários disponíveis para este dia. Escolha outro dia ou digite 'Menu'.");
                        return json({ success: true });
                    }

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_time", appointment_date = ? WHERE phone = ?').bind(ds, from).run();
                    let msg = `📅 *Data: ${ds}*\n\n⏰ *Escolha o horário:*`;
                    av.forEach((t, i) => { msg += `\n*${i + 1}* - ${t}`; });
                    msg += "\n\nOu 'Menu' para recomeçar.";
                    await sendMessage(from, msg);
                    return json({ success: true });
                }
                // 6. AWAITING TIME
                if (session.state === 'awaiting_time') {
                    const ds = session.appointment_date;
                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, ds).all();
                    const bt = busy.results.map(r => r.appointment_time);
                    const slots = [
                        "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                        "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                        "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
                    ];
                    let av = slots.filter(t => !bt.includes(t));

                    // Filter past times logic again to ensure index is correct
                    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                    const brazilDateStr = brazilTime.toLocaleDateString("en-CA");
                    const isToday = ds === brazilDateStr;

                    if (isToday) {
                        const currentTotalMinutes = brazilTime.getHours() * 60 + brazilTime.getMinutes() + 15;
                        av = av.filter(t => {
                            const [h, m] = t.split(':').map(Number);
                            return (h * 60 + m) >= currentTotalMinutes;
                        });
                    }

                    const tm = av[parseInt(text) - 1];

                    if (!tm) {
                        await sendMessage(from, "⚠️ Horário inválido! Escolha um número da lista de horários disponíveis.");
                        return json({ success: true });
                    }

                    if (session.user_email) {
                        // User exists
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ? WHERE phone = ?').bind(tm, from).run();
                        const s = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
                        const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(session.selected_barber_email).first();

                        await sendMessage(from, `📝 *Confirme os dados:* \n\n💇‍♂️ *Serviço:* ${s.name}\n📅 *Data:* ${ds}\n⏰ *Hora:* ${tm}\n💈 *Barbeiro:* ${barber?.name || 'Barbearia'}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir meus dados`);
                    } else {
                        // New user -> Ask Name first
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_name", appointment_time = ? WHERE phone = ?').bind(tm, from).run();
                        await sendMessage(from, `👋 *É sua primeira vez aqui!*\n\nQual é o seu *Nome*? (Digite abaixo)`);
                    }
                    return json({ success: true });
                }

                // 7. AWAITING NAME
                if (session.state === 'awaiting_name') {
                    const name = text.trim();
                    if (name.length < 2) {
                        await sendMessage(from, "⚠️ Nome muito curto. Por favor, digite seu nome completo.");
                        return json({ success: true });
                    }
                    // Save name temporarily in metadata
                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_email", metadata = ? WHERE phone = ?').bind(JSON.stringify({ temp_name: name }), from).run();
                    await sendMessage(from, `Prazer, *${name}*! 🤝\n\nAgora, digite seu *E-mail* para receber o comprovante:`);
                    return json({ success: true });
                }

                // 8. AWAITING EMAIL
                if (session.state === 'awaiting_email') {
                    const email = text.toLowerCase().trim();
                    if (!email.includes('@') || !email.includes('.')) {
                        await sendMessage(from, "❌ E-mail inválido. Tente novamente (ex: joao@gmail.com).");
                        return json({ success: true });
                    }

                    // Retrieve name from metadata
                    const meta = session.metadata ? JSON.parse(session.metadata) : {};
                    const userName = meta.temp_name || `Cliente ${from}`;

                    // Insert or Update User
                    await env.DB.prepare(`
                        INSERT INTO users (email, name, phone) VALUES (?, ?, ?)
                        ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone
                    `).bind(email, userName, from).run();

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", user_email = ? WHERE phone = ?').bind(email, from).run();

                    const s = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
                    const b = await env.DB.prepare('SELECT name, msg_confirm_booking FROM users WHERE email = ?').bind(session.selected_barber_email).first();

                    let confirmMsg = b?.msg_confirm_booking || `📝 *Tudo pronto! Confirme:* \n\n👤 *Nome:* ${userName}\n📧 *E-mail:* ${email}\n💇‍♂️ *Serviço:* {{service_name}}\n📅 *Data:* {{date}}\n⏰ *Hora:* {{time}}\n💈 *Barbeiro:* {{barber_name}}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir dados`;
                    confirmMsg = confirmMsg
                        .replace(/{{service_name}}/g, s.name)
                        .replace(/{{date}}/g, session.appointment_date)
                        .replace(/{{time}}/g, session.appointment_time)
                        .replace(/{{barber_name}}/g, b?.name || 'Barbearia');

                    await sendMessage(from, confirmMsg);
                    return json({ success: true });
                }

                // 9. FINAL CONFIRMATION & SAVE
                if (session.state === 'awaiting_confirmation') {
                    if (text === '1' || textLower === 'sim' || textLower === 's') {
                        // RE-VALIDAÇÃO FINAL DOS DADOS
                        const userEmail = session.user_email;
                        const barberEmail = session.selected_barber_email || botBarberEmail;
                        const appDate = session.appointment_date;
                        const appTime = session.appointment_time;
                        const serviceId = session.service_id;

                        if (!userEmail || !barberEmail || !appDate || !appTime || !serviceId) {
                            console.error('[Booking Error] Missing Data:', { userEmail, barberEmail, appDate, appTime, serviceId });
                            await sendMessage(from, "❌ Erro técnico: Dados da sessão perdidos. Por favor, digite 'Menu' para recomeçar.");
                            await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                            return json({ success: true });
                        }

                        const aid = crypto.randomUUID();
                        const s = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

                        try {
                            // 1. Criar Agendamento
                            await env.DB.prepare(`
                                INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                                VALUES (?, ?, ?, ?, ?, ?, 'pending')
                            `).bind(aid, userEmail, barberEmail, serviceId, appDate, appTime).run();

                            // 2. Gerar Pagamento (Opcional, não bloqueante)
                            let payMsg = "";
                            try {
                                const mpPref = {
                                    items: [{ title: `Barber - ${s.name}`, quantity: 1, unit_price: s.price, currency_id: 'BRL' }],
                                    external_reference: aid,
                                    back_urls: { success: `${env.FRONTEND_URL}/success?id=${aid}`, failure: `${env.FRONTEND_URL}/cancel?id=${aid}`, pending: `${env.FRONTEND_URL}/pending?id=${aid}` },
                                    auto_return: 'approved'
                                };
                                const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(mpPref)
                                });
                                const mpD = await mpRes.json();
                                if (mpD.init_point) {
                                    payMsg = `\n\n💳 *Pagamento (PIX/Cartão):*\n${mpD.init_point}`;
                                }
                            } catch (mpErr) {
                                console.error('MP Error', mpErr);
                            }

                            // 3. Limpar Sessão e Confirmar
                            await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();

                            const dateParts = appDate.split('-');
                            const fmtDate = `${dateParts[2]}/${dateParts[1]}`;

                            // Fetch ACTUAL Barber Name
                            const finalBarber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(barberEmail).first();

                            let finMsg = `✅ *Agendamento Realizado!* \n\n✂️ *Serviço:* ${s.name}\n📅 *Data:* ${fmtDate}\n⏰ *Horário:* ${appTime}\n💈 *Barbeiro:* ${finalBarber?.name || 'Barbearia'}`;
                            finMsg += payMsg;
                            finMsg += `\n\nO status atual é *Pendente*. Você receberá uma confirmação assim que aprovarmos! 🚀`;

                            await sendMessage(from, finMsg);

                        } catch (dbErr) {
                            console.error('[DB Insert Error]', dbErr);
                            await sendMessage(from, "❌ Falha ao salvar no banco de dados. Tente novamente mais tarde.");
                        }

                    } else if (text === '2' || textLower === 'nao' || textLower === 'não') {
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, "🔄 Agendamento cancelado. Voltamos ao Menu Principal.\n\n1️⃣ - Agendar\n2️⃣ - Meus Agendamentos");
                    } else if (text === '3' || textLower === 'corrigir') {
                        // Edit Data Flow
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_name" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, "✏️ *Vamos corrigir!*\n\nDigite seu *Nome* corretamente:");
                    } else {
                        await sendMessage(from, "⚠️ Opção inválida. Digite *1* para Confirmar, *2* para Cancelar ou *3* para Corrigir.");
                    }
                    return json({ success: true });
                }

                return json({ success: true });
            }

            // Webhook for Mercado Pago
            if (url.pathname === '/api/webhook/mp' && request.method === 'POST') {
                const data = await request.json();
                if (data.type === 'payment' && data.data?.id) {
                    const paymentId = data.data.id;
                    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                        headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` }
                    });
                    const payment = await res.json();

                    if (payment.status === 'approved') {
                        const ref = payment.external_reference;
                        if (ref && ref.startsWith('sub_')) {
                            const email = ref.replace('sub_', '');
                            const user = await env.DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(email).first();

                            const currentExpires = user?.subscription_expires ? new Date(user.subscription_expires) : new Date();
                            const base = currentExpires > new Date() ? currentExpires : new Date();
                            base.setDate(base.getDate() + 30);
                            const newExpires = base.toISOString();

                            await env.DB.prepare('UPDATE users SET subscription_expires = ? WHERE email = ?').bind(newExpires, email).run();
                            console.log(`[Webhook] Subscription renewed for ${email} until ${newExpires}`);
                        } else {
                            const apptId = ref;
                            await env.DB.prepare('UPDATE appointments SET status = "confirmed", payment_status = "paid" WHERE id = ?').bind(apptId).run();
                            await notifyWhatsApp(apptId, 'confirmed');
                        }
                    }
                }
                return json({ received: true });
            }

            // Admin: Get Bot Settings
            if (url.pathname === '/api/admin/bot/settings' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await env.DB.prepare('SELECT bot_name, business_type, bot_tone, welcome_message, msg_welcome, msg_choose_barber, msg_choose_service, msg_confirm_booking FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);
                return json(user);
            }

            // Admin: Update Bot Settings
            if (url.pathname === '/api/admin/bot/settings' && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                const { bot_name, business_type, bot_tone, welcome_message, msg_welcome, msg_choose_barber, msg_choose_service, msg_confirm_booking } = await request.json();

                await env.DB.prepare(`
                    UPDATE users 
                    SET bot_name = ?, business_type = ?, bot_tone = ?, welcome_message = ?, 
                        msg_welcome = ?, msg_choose_barber = ?, msg_choose_service = ?, msg_confirm_booking = ?
                    WHERE email = ?
                `).bind(
                    bot_name || 'Leo',
                    business_type || 'barbearia',
                    bot_tone || 'prestativo e amigável',
                    welcome_message || 'Olá {{user_name}}, seu horário para *{{service_name}}* foi confirmado!',
                    msg_welcome || null,
                    msg_choose_barber || null,
                    msg_choose_service || null,
                    msg_confirm_booking || null,
                    email
                ).run();

                return json({ success: true });
            }

            // Admin: Update Bridge URL (Called by manage.js on startup)
            if (url.pathname === '/api/admin/bridge/update' && request.method === 'POST') {
                const { key, url: bridgeUrl, email } = await request.json();
                if (key !== env.WA_BRIDGE_KEY) return json({ error: 'Invalid Key' }, 401);

                // Ensure column exists (Migration on the fly)
                try {
                    await env.DB.prepare('ALTER TABLE users ADD COLUMN wa_bridge_url TEXT').run();
                } catch (e) { }

                await env.DB.prepare('UPDATE users SET wa_bridge_url = ? WHERE email = ?').bind(bridgeUrl, email).run();
                return json({ success: true });
            }

            // Admin: Remote Start/Stop Bot (Proxy to Bridge)
            if ((url.pathname === '/api/admin/bot/start' || url.pathname === '/api/admin/bot/stop') && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                const user = await env.DB.prepare('SELECT is_admin, is_barber, wa_bridge_url FROM users WHERE email = ?').bind(email).first();
                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) return json({ error: 'Permission Denied' }, 403);

                const { targetEmail } = await request.json();
                // Use URL from DB, fallback to Env
                const BRIDGE_URL = user.wa_bridge_url || env.WA_BRIDGE_URL;
                const BRIDGE_KEY = env.WA_BRIDGE_KEY;
                const endpoint = url.pathname.includes('stop') ? '/api/stop' : '/api/start';

                if (!BRIDGE_URL || !BRIDGE_KEY) return json({ error: 'Bridge not configured' }, 503);

                try {
                    const bridgeRes = await fetch(`${BRIDGE_URL}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: BRIDGE_KEY, email: targetEmail || email })
                    });
                    const data = await bridgeRes.json();
                    return json(data, bridgeRes.status);
                } catch (e) {
                    return json({ error: 'Failed to contact bridge', details: e.message, triedUrl: BRIDGE_URL }, 502);
                }
            }

            return json({ error: 'Not Found' }, 404);
        } catch (err) {
            return json({ error: err.message, stack: err.stack }, 500);
        }
    }
};
