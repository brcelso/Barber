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
            // --- Helper: Notify WhatsApp (Custom Bridge Script) ---
            const notifyWhatsApp = async (appointmentId, status) => {
                const BRIDGE_URL = env.WA_BRIDGE_URL; // e.g., https://seu-tunnel-ngrok.com
                const BRIDGE_KEY = env.WA_BRIDGE_KEY;

                if (!BRIDGE_URL || !BRIDGE_KEY) {
                    console.log('[WhatsApp] Bridge credentials not set. Message logged instead.');
                }

                try {
                    // Check Subscription of the BARBER
                    const apptData = await env.DB.prepare('SELECT barber_email FROM appointments WHERE id = ?').bind(appointmentId).first();
                    const barberEmail = apptData?.barber_email || 'celsosilvajunior90@gmail.com';

                    const barberUser = await env.DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(barberEmail).first();
                    const now = new Date();
                    const expires = barberUser?.subscription_expires ? new Date(barberUser.subscription_expires) : null;

                    if (!expires || expires < now) {
                        console.log(`[WhatsApp] AVISO: Assinatura do barbeiro ${barberEmail} vencida. Mensagem não enviada.`);
                        return;
                    }

                    const appt = await env.DB.prepare(`
                        SELECT a.*, s.name as service_name, u.phone, u.name as user_name
                        FROM appointments a
                        JOIN services s ON a.service_id = s.id
                        JOIN users u ON a.user_email = u.email
                        WHERE a.id = ?
                    `).bind(appointmentId).first();

                    if (!appt || !appt.phone) return;

                    let message = "";
                    const dateParts = appt.appointment_date.split('-');
                    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                    if (status === 'confirmed') {
                        message = `✅ *Agendamento Confirmado!* \n\nOlá ${appt.user_name}, seu horário para *${appt.service_name}* no dia *${formattedDate}* às *${appt.appointment_time}* foi confirmado. \n\nTe esperamos lá! ✂️`;
                    } else if (status === 'cancelled') {
                        message = `❌ *Agendamento Cancelado* \n\nOlá ${appt.user_name}, informamos que o agendamento para *${appt.service_name}* no dia *${formattedDate}* às *${appt.appointment_time}* foi cancelado.`;
                    } else if (status === 'pending') {
                        message = `⏳ *Agendamento Recebido* \n\nOlá ${appt.user_name}, seu agendamento para *${appt.service_name}* no dia *${formattedDate}* às *${appt.appointment_time}* foi recebido e está sendo processado.`;
                    }

                    if (message) {
                        const cleanPhone = appt.phone.replace(/\D/g, "");
                        const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

                        console.log(`[WhatsApp Auto-Notify] TO: ${finalPhone} MSG: ${message}`);

                        if (BRIDGE_URL && BRIDGE_KEY) {
                            try {
                                const waRes = await fetch(`${BRIDGE_URL}/send-message`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        key: BRIDGE_KEY,
                                        number: finalPhone,
                                        message: message
                                    })
                                });
                                const waData = await waRes.json();
                                if (!waRes.ok) console.error('[Bridge Error Response]', waData);
                                else console.log('[Bridge Success Response]', waData);
                            } catch (fetchErr) {
                                console.error('[Bridge Connection Failed]', fetchErr.message);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[WhatsApp Notify Error]', e);
                }
            };

            // --- Routes ---

            // Health check
            if (url.pathname === '/') {
                return json({ status: 'Barber API Online', time: new Date().toISOString() });
            }

            // Test AI Response
            if (url.pathname === '/api/test/ai' && request.method === 'GET') {
                const message = url.searchParams.get('message');
                const botBarberEmail = url.searchParams.get('email') || MASTER_EMAIL;

                // --- Repetir lógica de busca de contexto aqui para o teste ---
                const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(botBarberEmail).first();
                const barberName = barber ? barber.name : 'Barber Central';
                const services = await env.DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(botBarberEmail).all();
                const servicesList = services.results.length > 0
                    ? services.results.map((s, i) => `✂️ ${s.name}: R$ ${s.price}`).join('\n')
                    : "Consulte nossos serviços no agendamento.";

                const systemPrompt = `Você é o Leo, o assistente virtual da barbearia ${barberName}. 
Seu objetivo é ser extremamente educado, eficiente e focado em converter conversas em agendamentos.
INSTRUÇÕES DE FLUXO:
- Se o cliente quiser agendar, diga para ele digitar "1".
- Se ele quiser ver ou cancelar agendamentos existentes, diga para digitar "2".
- Se ele tiver dúvidas sobre preços, horários ou serviços, responda de forma curta e induza ele a digitar "1" para reservar.
SERVIÇOS E PREÇOS:
${servicesList}
REGRAS DE RESPOSTA:
1. Seja amigável mas direto. Use no máximo 3 frases.
2. Use emojis moderadamente: ✂️, 💈, ✅.
3. SEMPRE termine sua resposta chamando para uma ação numérica, por exemplo: 
   "Digite *1* para garantir seu horário ou *2* para gerenciar sua agenda."
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
                const user = await env.DB.prepare('SELECT is_admin, subscription_expires, trial_used, plan FROM users WHERE email = ?').bind(email).first();
                if (!user || user.is_admin !== 1) return json({ error: 'Permission Denied' }, 403);

                const now = new Date();
                const expires = user.subscription_expires ? new Date(user.subscription_expires) : new Date();
                const diffTime = expires - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return json({
                    daysLeft: Math.max(0, diffDays),
                    expires: user.subscription_expires,
                    isActive: diffTime > 0,
                    trialUsed: !!user.trial_used,
                    isMaster: email === MASTER_EMAIL,
                    plan: user.plan
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

                const usersListing = await env.DB.prepare("SELECT email, name, phone, is_admin, is_barber, wa_status, wa_last_seen, subscription_expires, trial_used, plan FROM users WHERE email != 'sistema@leoai.br' ORDER BY created_at DESC").all();

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

            // MASTER: Update User Role/Subscription/Phone
            if (url.pathname === '/api/master/user/update' && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const { targetEmail, is_admin, is_barber, expires, plan, phone } = await request.json();

                await env.DB.prepare(`
                    UPDATE users 
                    SET is_admin = ?, is_barber = ?, subscription_expires = ?, plan = ?, phone = ?
                    WHERE email = ?
                `).bind(is_admin ? 1 : 0, is_barber ? 1 : 0, expires || null, plan || null, phone || null, targetEmail).run();

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

                const user = await env.DB.prepare('SELECT wa_status, wa_qr FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);
                return json({ status: user.wa_status || 'disconnected', qr: user.wa_qr });
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
                return json({ user: { ...user, isAdmin: user.is_admin === 1, isMaster: user.email === MASTER_EMAIL } });
            }

            // Get Styles/Services (exclude internal 'block' service)
            if (url.pathname === '/api/services' && request.method === 'GET') {
                const barberEmail = url.searchParams.get('barber_email');
                let query = 'SELECT * FROM services WHERE id != ?';
                let params = ['block'];

                if (barberEmail) {
                    query += ' AND (barber_email = ? OR barber_email IS NULL)';
                    params.push(barberEmail);
                }

                const services = await env.DB.prepare(query).bind(...params).all();
                return json(services.results);
            }

            // Get All Barbers
            if (url.pathname === '/api/barbers' && request.method === 'GET') {
                const barbers = await env.DB.prepare('SELECT email, name, picture FROM users WHERE is_barber = 1').all();
                return json(barbers.results);
            }

            // Promote to Barber (3-day trial)
            if (url.pathname === '/api/user/promote' && request.method === 'POST') {
                const { email } = await request.json();
                const now = new Date();
                const expires = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString();

                await env.DB.prepare(`
                    UPDATE users 
                    SET is_barber = 1, is_admin = 1, subscription_expires = ?, trial_used = 1
                    WHERE email = ?
                `).bind(expires, email).run();

                return json({ success: true, expires });
            }

            // Admin: Get ALL Appointments
            if (url.pathname === '/api/admin/appointments' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(email).first();

                if (!user || user.is_admin !== 1) {
                    return json({ error: 'Permission Denied' }, 403);
                }

                const allAppointments = await env.DB.prepare(`
                    SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture, u.phone as user_phone
                    FROM appointments a
                    LEFT JOIN services s ON a.service_id = s.id
                    LEFT JOIN users u ON a.user_email = u.email
                    WHERE a.barber_email = ?
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                `).bind(email).all();

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

            // Mock Appointment Payment
            if (url.pathname === '/api/payments/mock' && request.method === 'POST') {
                const { appointmentId, email } = await request.json();

                await env.DB.prepare(`
                    UPDATE appointments 
                    SET payment_status = 'confirmed', status = 'confirmed', payment_id = 'mock_' || ?
                    WHERE id = ? AND (user_email = ? OR barber_email = ?)
                `).bind(appointmentId, appointmentId, email, email).run();

                return json({ success: true, message: 'Pagamento simulado com sucesso!' });
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
                const user = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(userEmail).first();

                if (!user || user.is_admin !== 1) {
                    return json({ error: 'Admin only' }, 403);
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
                const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

                // Check if already blocked
                const existing = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status = "blocked"').bind(date, time).first();

                if (existing) {
                    await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(existing.id).run();
                    return json({ status: 'unblocked' });
                } else {
                    // Check for conflicts before blocking (don't block if there's a real appointment)
                    const conflict = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != "cancelled"').bind(date, time).first();
                    if (conflict) return json({ error: 'Já existe um agendamento neste horário' }, 409);

                    const id = `block-${crypto.randomUUID()}`;
                    try {
                        // Ensure 'system' user and 'block' service exist to satisfy FK constraints
                        await env.DB.prepare(`
                            INSERT OR IGNORE INTO users (email, name, is_admin, created_at)
                            VALUES ('system', 'System', 0, CURRENT_TIMESTAMP)
                        `).run();
                        await env.DB.prepare(`
                            INSERT OR IGNORE INTO services (id, name, price, duration_minutes, description)
                            VALUES ('block', 'Blocked Slot', 0.0, 0, 'Reserved by admin')
                        `).run();

                        // Verify seeds were created
                        const sysUser = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind('system').first();
                        const blockService = await env.DB.prepare('SELECT id FROM services WHERE id = ?').bind('block').first();

                        console.log('[toggle-block] seed check', { sysUser, blockService });

                        if (!sysUser || !blockService) {
                            return json({ error: 'Seed creation failed', userExists: !!sysUser, serviceExists: !!blockService }, 500);
                        }

                        // Debug logging to help diagnose FK issues
                        console.log('[toggle-block] inserting block', { id, date, time });

                        await env.DB.prepare(`
                            INSERT INTO appointments (id, user_email, service_id, appointment_date, appointment_time, status)
                            VALUES (?, 'system', 'block', ?, ?, 'blocked')
                        `).bind(id, date, time).run();
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
                    // Block all available times that don't have an appointment
                    const existingTimes = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != "cancelled"').bind(date).all();
                    const busySet = new Set(existingTimes.results.map(r => r.appointment_time));

                    const statements = [];
                    for (const time of times) {
                        if (!busySet.has(time)) {
                            const id = `block-${crypto.randomUUID()}`;
                            statements.push(env.DB.prepare(`
                                INSERT INTO appointments (id, user_email, service_id, appointment_date, appointment_time, status)
                                VALUES (?, 'system', 'block', ?, ?, 'blocked')
                            `).bind(id, date, time));
                        }
                    }
                    if (statements.length > 0) await env.DB.batch(statements);
                    return json({ status: 'blocked' });
                } else {
                    // Unblock all previously blocked slots
                    await env.DB.prepare('DELETE FROM appointments WHERE appointment_date = ? AND status = "blocked"').bind(date).run();
                    return json({ status: 'unblocked' });
                }
            }

            // Public: Get Busy Slots for a Date
            if (url.pathname === '/api/appointments/busy-slots' && request.method === 'GET') {
                const date = url.searchParams.get('date');
                if (!date) return json({ error: 'Missing date' }, 400);

                const busy = await env.DB.prepare('SELECT appointment_time as time, status FROM appointments WHERE appointment_date = ? AND status != "cancelled"').bind(date).all();
                return json(busy.results);
            }

            // Webhook for WhatsAppBot
            if (url.pathname === '/api/whatsapp/webhook' && request.method === 'POST') {
                const body = await request.json();
                const from = body.phone?.replace(/\D/g, ""); // Clean phone
                const text = (body.message || "").trim();
                const textLower = text.toLowerCase();
                const botBarberEmail = body.barber_email; // O barbeiro dono do robô que recebeu a msg

                if (!from) return json({ error: "Missing phone" }, 400);

                // Helper to send message back via Bridge
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
                                barber_email: botBarberEmail // Devolve para o robô correto
                            })
                        });
                    } catch (e) {
                        console.error('[Bot Send Error]', e.message);
                    }
                };

                let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

                // Identifica se o usuário já existe para pular o e-mail depois
                let userInDb = null;
                if (!session || !session.user_email) {
                    const allUsers = await env.DB.prepare('SELECT email, phone FROM users WHERE phone IS NOT NULL').all();
                    const cleanFrom = from.replace(/\D/g, "");
                    userInDb = allUsers.results.find(u => {
                        const cleanU = u.phone.replace(/\D/g, "");
                        return cleanU.endsWith(cleanFrom) || cleanFrom.endsWith(cleanU);
                    });
                }

                // AI Agent Helper with refined personality
                const askAI = async (userMessage, sessionState = 'main_menu') => {
                    try {
                        // Buscar barbeiro para personificar
                        const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(botBarberEmail).first();
                        const barberName = barber ? barber.name : 'Barber Central';

                        // Buscar serviços apenas deste barbeiro
                        const services = await env.DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(botBarberEmail).all();
                        const servicesList = services.results.length > 0
                            ? services.results.map((s, i) => `✂️ ${s.name}: R$ ${s.price}`).join('\n')
                            : "Consulte nossos serviços no agendamento.";

                        const systemPrompt = `Você é o Leo, o assistente virtual da barbearia ${barberName}. 
Seu objetivo é ser extremamente educado, eficiente e focado em converter conversas em agendamentos.

INSTRUÇÕES DE FLUXO:
- Se o cliente quiser agendar, diga para ele digitar "1".
- Se ele quiser ver ou cancelar agendamentos existentes, diga para digitar "2".
- Se ele tiver dúvidas sobre preços, horários ou serviços, responda de forma curta e induza ele a digitar "1" para reservar.

SERVIÇOS E PREÇOS:
${servicesList}

REGRAS DE RESPOSTA:
1. Seja amigável mas direto. Use no máximo 3 frases.
2. Use emojis moderadamente: ✂️, 💈, ✅.
3. SEMPRE termine sua resposta chamando para uma ação numérica, por exemplo: 
   "Digite *1* para garantir seu horário ou *2* para gerenciar sua agenda."
4. NUNCA invente serviços ou preços que não estão na lista acima.
5. Se não souber algo, peça para o cliente digitar "Menu" para falar com um humano ou ver as opções básicas.`;

                        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userMessage }
                            ]
                        });

                        const aiText = response.response || "Manda um '1' logo para a gente garantir sua vaga. A agenda está voando! ✂️🔥";
                        return aiText;
                    } catch (e) {
                        return "Olá! ✂️ Estou com uma instabilidade rápida, mas você pode agendar digitando '1' ou ver o 'Menu' principal!";
                    }
                };

                const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;

                // Fluxo Inicial / Menu
                if (!session || textLower === 'oi' || textLower === 'ola' || textLower === 'menu' || textLower === 'sair') {
                    const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);

                    await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "main_menu", ?)').bind(from, userEmail).run();

                    let msg = "✂️ *Bem-vindo à Barber!* \n\nSua barbearia moderna com agendamento inteligente. 💈\n\nComo posso ajudar você hoje?\n\n";
                    msg += "1️⃣ - Agendar novo horário\n";
                    msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                    msg += "3️⃣ - Falar com o Leo (Dúvidas/Chat IA)\n";
                    msg += "\nEnvie sua dúvida ou escolha um número acima!";

                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // IA ONIPRESENTE: Se não for um número (escolha) e não for um comando de sistema, a IA responde
                const systemCommands = ['oi', 'ola', 'menu', 'sair', 'ajuda'];
                if (!isNumericChoice && !systemCommands.includes(textLower)) {
                    const aiMsg = await askAI(text, session.state);
                    await sendMessage(from, aiMsg);
                    return json({ success: true });
                }

                // AI Interception: Opção 3 ou chat iniciado
                if (session.state === 'ai_chat' || text === '3') {
                    // Se o usuário digitar um número enquanto está no chat da IA, e esse número for 1 ou 2, volta pro menu
                    if (session.state === 'ai_chat' && (text === '1' || text === '2')) {
                        session.state = 'main_menu';
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "main_menu" WHERE phone = ?').bind(from).run();
                    } else {
                        const aiMsg = await askAI(text, session.state);
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, aiMsg);
                        return json({ success: true });
                    }
                }

                // MAIN MENU FLOW
                if (session.state === 'main_menu') {
                    if (text === '1') {
                        const barbers = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();
                        let msg = "💈 *Escolha o Barbeiro:* \n";
                        barbers.results.forEach((b, i) => { msg += `\n*${i + 1}* - ${b.name}`; });

                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_barber" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, msg);
                        return json({ success: true });
                    } else if (text === '2') {
                        const appts = await env.DB.prepare(`
                            SELECT a.*, s.name as service_name
                            FROM appointments a
                            JOIN services s ON a.service_id = s.id
                            JOIN users u ON a.user_email = u.email
                            WHERE (u.phone LIKE ? OR u.phone = ?) AND a.status != 'cancelled'
                            ORDER BY a.appointment_date LIMIT 5
                        `).bind(`%${from.slice(-8)}`, from).all();

                        if (appts.results.length === 0) {
                            await sendMessage(from, "Você não possui agendamentos ativos. Digite 'Menu' para agendar um!");
                            return json({ success: true });
                        }

                        let msg = "🗓️ *Seus Agendamentos:* \n";
                        appts.results.forEach((a, i) => {
                            msg += `\n*${i + 1}* - ${a.service_name} dia ${a.appointment_date} às ${a.appointment_time}`;
                        });
                        msg += "\n\nEnvie o número para *CANCELAR* ou 'Menu' para voltar.";

                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "managing_appointments", metadata = ? WHERE phone = ?')
                            .bind(JSON.stringify(appts.results.map(a => a.id)), from).run();
                        await sendMessage(from, msg);
                        return json({ success: true });
                    } else if (text === '3') {
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "ai_chat" WHERE phone = ?').bind(from).run();
                        await sendMessage(from, "Olá! Sou a IA da Barber. Pode me perguntar qualquer coisa sobre nossos serviços! 😎");
                        return json({ success: true });
                    }
                }

                // FLOW: Choose Barber
                if (session.state === 'awaiting_barber') {
                    const barbers = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();
                    const index = parseInt(text) - 1;
                    const barber = barbers.results[index];

                    if (!barber) {
                        await sendMessage(from, "❌ Barbeiro inválido. Escolha um da lista.");
                        return json({ success: true });
                    }

                    const services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ?').bind(barber.email).all();
                    let msg = `Você escolheu *${barber.name}*.\n\n📅 *Agora escolha o serviço:* \n`;
                    services.results.forEach((s, i) => { msg += `\n*${i + 1}* - ${s.name} (R$ ${s.price})`; });

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_service", selected_barber_email = ? WHERE phone = ?').bind(barber.email, from).run();
                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // FLOW: Choose Service
                if (session.state === 'awaiting_service') {
                    const index = parseInt(text) - 1;
                    const services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ?').bind(session.selected_barber_email).all();
                    const service = services.results[index];

                    if (!service) {
                        await sendMessage(from, "❌ Opção inválida. Escolha um serviço da lista.");
                        return json({ success: true });
                    }

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_date", service_id = ? WHERE phone = ?').bind(service.id, from).run();

                    let msg = `✅ *${service.name}* selecionado.\n\n📅 *Escolha a data:*`;
                    for (let i = 0; i < 7; i++) {
                        const d = new Date(); d.setDate(d.getDate() + i);
                        const str = d.toISOString().split('T')[0];
                        msg += `\n*${i + 1}* - ${str}`;
                    }
                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // FLOW: Choose Date
                if (session.state === 'awaiting_date') {
                    const index = parseInt(text) - 1;
                    if (index < 0 || index > 6) {
                        await sendMessage(from, "❌ Data inválida. Escolha de 1 a 7.");
                        return json({ success: true });
                    }

                    const d = new Date(); d.setDate(d.getDate() + index);
                    const dateStr = d.toISOString().split('T')[0];

                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, dateStr).all();
                    const busyTimes = busy.results.map(r => r.appointment_time);
                    const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
                    const available = timeSlots.filter(t => !busyTimes.includes(t));

                    if (available.length === 0) {
                        await sendMessage(from, "❌ Infelizmente não há horários para este dia. Escolha outro dia.");
                        return json({ success: true });
                    }

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_time", appointment_date = ? WHERE phone = ?').bind(dateStr, from).run();

                    let msg = `📅 *Data: ${dateStr}*\n\n⏰ *Escolha o horário:*`;
                    available.forEach((t, i) => { msg += `\n*${i + 1}* - ${t}`; });
                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // FLOW: Choose Time
                if (session.state === 'awaiting_time') {
                    const dateStr = session.appointment_date;
                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE barber_email = ? AND appointment_date = ? AND status != "cancelled"').bind(session.selected_barber_email, dateStr).all();
                    const busyTimes = busy.results.map(r => r.appointment_time);
                    const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
                    const available = timeSlots.filter(t => !busyTimes.includes(t));

                    const index = parseInt(text) - 1;
                    const time = available[index];

                    if (!time) {
                        await sendMessage(from, "❌ Horário inválido ou já ocupado.");
                        return json({ success: true });
                    }

                    if (session.user_email) {
                        const service = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ? WHERE phone = ?')
                            .bind(time, from).run();

                        await sendMessage(from, `📍 *Quase lá!* \n\n*Serviço:* ${service?.name || 'Corte'}\n*Data:* ${dateStr}\n*Hora:* ${time}\n\nConfirma o agendamento? \n*1* - Sim ✅\n*2* - Não/Cancelar ❌`);
                        return json({ success: true });
                    } else {
                        // Tenta buscar novamente caso não tenha vindo no início
                        const allUsers = await env.DB.prepare('SELECT email, phone FROM users WHERE phone IS NOT NULL').all();
                        const cleanFrom = from.replace(/\D/g, "");
                        const userFound = allUsers.results.find(u => {
                            const cleanU = u.phone.replace(/\D/g, "");
                            return cleanU.endsWith(cleanFrom) || cleanFrom.endsWith(cleanU);
                        });

                        if (userFound && userFound.email) {
                            const service = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
                            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ?, user_email = ? WHERE phone = ?')
                                .bind(time, userFound.email, from).run();

                            await sendMessage(from, `📍 *Quase lá!* \n\n*Serviço:* ${service?.name || 'Corte'}\n*Data:* ${dateStr}\n*Hora:* ${time}\n\nConfirma o agendamento? \n*1* - Sim ✅\n*2* - Não/Cancelar ❌`);
                            return json({ success: true });
                        } else {
                            // Se REALMENTE não temos o e-mail
                            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_email", appointment_time = ? WHERE phone = ?')
                                .bind(time, from).run();

                            await sendMessage(from, `⏰ *Horário ${time} reservado!* \n\nComo é sua primeira vez por aqui, por favor digite seu *E-mail* para completar o agendamento:`);
                            return json({ success: true });
                        }
                    }
                }

                // FLOW: Awaiting Email (New users)
                if (session.state === 'awaiting_email') {
                    const email = text.toLowerCase();
                    if (!email.includes('@')) {
                        await sendMessage(from, "❌ E-mail inválido. Digite um e-mail correto:");
                        return json({ success: true });
                    }

                    // Upsert user
                    await env.DB.prepare('INSERT OR IGNORE INTO users (email, name, phone) VALUES (?, ?, ?)').bind(email, `Cliente ${from}`, from).run();

                    const service = await env.DB.prepare('SELECT name FROM services WHERE id = ?').bind(session.service_id).first();
                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", user_email = ? WHERE phone = ?').bind(email, from).run();
                    await sendMessage(from, `📍 *E-mail confirmado!* \n\n*Serviço:* ${service?.name || 'Corte'}\n*Data:* ${session.appointment_date}\n*Hora:* ${session.appointment_time}\n\nConfirma o agendamento? \n*1* - Sim ✅\n*2* - Não/Cancelar ❌`);
                    return json({ success: true });
                }

                // FLOW: Final Confirmation + Payment Link
                if (session.state === 'awaiting_confirmation') {
                    if (text === '1') {
                        const id = crypto.randomUUID();
                        const service = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(session.service_id).first();

                        await env.DB.prepare(`
                            INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                            VALUES (?, ?, ?, ?, ?, ?, 'pending')
                        `).bind(id, session.user_email, session.selected_barber_email, session.service_id, session.appointment_date, session.appointment_time).run();

                        // Create MP Preference directly
                        const mpPreference = {
                            items: [{
                                title: `Barber - ${service.name}`,
                                quantity: 1,
                                unit_price: service.price,
                                currency_id: 'BRL'
                            }],
                            external_reference: id,
                            back_urls: {
                                success: `${env.FRONTEND_URL}/success?id=${id}`,
                                failure: `${env.FRONTEND_URL}/cancel?id=${id}`,
                                pending: `${env.FRONTEND_URL}/pending?id=${id}`
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
                        const paymentUrl = mpData.init_point || `${env.FRONTEND_URL}/?payment=${id}`;

                        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                        await sendMessage(from, `🎉 *Agendamento Realizado!* \n\nSeu horário está reservado. Toque no link abaixo para realizar o pagamento e confirmar sua vaga agora mesmo:\n\n🔗 ${paymentUrl}\n\nObrigado! ✂️`);
                        return json({ success: true });
                    } else {
                        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                        await sendMessage(from, "❌ Agendamento cancelado. Quando quiser, mande um 'Oi' ou peça ajuda à nossa IA.");
                        return json({ success: true });
                    }
                }

                await sendMessage(from, "Não entendi muito bem. Digite 'Menu' para ver as opções ou fale comigo que eu te ajudo! 😎");
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

            return json({ error: 'Not Found' }, 404);
        } catch (err) {
            return json({ error: err.message, stack: err.stack }, 500);
        }
    }
};
