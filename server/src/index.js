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
                        SELECT a.*, s.name as service_name, u.phone, u.name as user_name, b.name as barber_name
                        FROM appointments a
                        JOIN services s ON a.service_id = s.id
                        JOIN users u ON a.user_email = u.email
                        LEFT JOIN users b ON a.barber_email = b.email
                        WHERE a.id = ?
                    `).bind(appointmentId).first();

                    if (!appt || !appt.phone) return;

                    let message = "";
                    const dateParts = appt.appointment_date.split('-');
                    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                    if (status === 'confirmed') {
                        message = `✅ *Agendamento Confirmado!* \n\nOlá ${appt.user_name}, seu horário para *${appt.service_name}* com o barbeiro *${appt.barber_name || 'Barbearia'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi confirmado. \n\nTe esperamos lá! ✂️`;
                    } else if (status === 'cancelled') {
                        message = `❌ *Agendamento Cancelado* \n\nOlá ${appt.user_name}, informamos que o agendamento para *${appt.service_name}* com o barbeiro *${appt.barber_name || 'Barbearia'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi cancelado.`;
                    } else if (status === 'pending') {
                        message = `⏳ *Agendamento Recebido* \n\nOlá ${appt.user_name}, seu agendamento para *${appt.service_name}* com o barbeiro *${appt.barber_name || 'Barbearia'}* no dia *${formattedDate}* às *${appt.appointment_time}* foi recebido e está sendo processado.`;
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
                                        message: message,
                                        barber_email: barberEmail
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
                const user = await env.DB.prepare('SELECT is_admin, is_barber, subscription_expires, trial_used, plan FROM users WHERE email = ?').bind(email).first();
                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) return json({ error: 'Permission Denied' }, 403);

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
                    plan: user.plan,
                    isBarber: user.is_barber === 1
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

            // MASTER: Update User Role/Subscription/Phone/Name/Email
            if (url.pathname === '/api/master/user/update' && request.method === 'POST') {
                const email = request.headers.get('X-User-Email');
                if (email !== MASTER_EMAIL) return json({ error: 'Unauthorized' }, 401);

                const { targetEmail, is_admin, is_barber, expires, plan, phone, newName, newEmail } = await request.json();

                await env.DB.prepare(`
                    UPDATE users 
                    SET is_admin = ?, is_barber = ?, subscription_expires = ?, plan = ?, phone = ?, name = ?, email = ?
                    WHERE email = ?
                `).bind(
                    is_admin ? 1 : 0,
                    is_barber ? 1 : 0,
                    expires || null,
                    plan || null,
                    phone || null,
                    newName || null,
                    newEmail || targetEmail,
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
                const user = await env.DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(email).first();

                if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) {
                    return json({ error: 'Permission Denied' }, 403);
                }

                const allAppointments = await env.DB.prepare(`
                    SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture, u.phone as user_phone, b.name as barber_name
                    FROM appointments a
                    LEFT JOIN services s ON a.service_id = s.id
                    LEFT JOIN users u ON a.user_email = u.email
                    LEFT JOIN users b ON a.barber_email = b.email
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
                const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

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
                const admin = await env.DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || (admin.is_admin !== 1 && admin.is_barber !== 1)) return json({ error: 'Forbidden' }, 403);

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
                        const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(botBarberEmail).first();
                        const barberName = barber ? barber.name : 'Barber Shop';

                        const servicesData = await env.DB.prepare('SELECT * FROM services WHERE id != "block" AND barber_email = ?').bind(botBarberEmail).all();
                        const servicesList = servicesData.results.map(s => `✂️ ${s.name}: R$ ${s.price}`).join('\n');

                        const systemPrompt = `Você é o Leo, o assistente virtual gente boa da barbearia ${barberName}. 💈
Seu tom é amigável, direto e profissional, como um barbeiro experiente.

OBJETIVO:
Tirar dúvidas sobre serviços/preços e SEMPRE guiar o cliente para uma das opções do menu numerado abaixo.

IMPORTANTE:
Você DEVE SEMPRE incluir as seguintes opções ao final de sua resposta para que o cliente saiba o que fazer a seguir:
1️⃣ - Para AGENDAR um novo corte ou serviço.
2️⃣ - Para CONSULTAR ou CANCELAR agendamentos existentes.
3️⃣ - Para tirar dúvidas com você (Leo).

SEUS SERVIÇOS E PREÇOS ATUAIS:
${servicesList}

DIRETRIZES DE COMPORTAMENTO:
1. SEJA ÚTIL: Se o cliente perguntar o preço de um corte, RESPONDA o preço antes de mostrar o menu.
2. SEJA CONVERSADOR: Use emojis (✂️, 💈, ✅) e linguagem natural, mas não seja prolixo.
3. SEMPRE MOSTRE O MENU: Não deixe o cliente sem saber o próximo passo. Termine com "Como posso te ajudar agora? Escolha uma opção:" seguido do menu 1, 2 e 3.
4. NÃO INVENTE: Não invente horários. Diga para ele digitar 1 para ver a disponibilidade real.

EXEMPLOS:
Cliente: "Quanto é a barba?"
Leo: "A barba sai por R$ 35, campeão! 💈 Como posso te ajudar agora? Escolha uma opção:
1️⃣ - Agendar
2️⃣ - Meus Agendamentos
3️⃣ - Dúvidas"`;

                        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userMessage }
                            ]
                        });
                        return response.response || "Estou aqui para ajudar! Digite '1' para agendar, '2' para ver seus horários ou 'Menu' para o início.";
                    } catch (_e) {
                        return "Olá! ✂️ Como posso te ajudar? Digite '1' para agendar ou 'Menu' para o menu principal.";
                    }
                };

                const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;

                // Fluxo Inicial / Reset Universal
                if (!session || textLower === 'oi' || textLower === 'ola' || textLower === 'menu' || textLower === 'sair' || textLower === 'ajuda' || (session.state === 'main_menu' && !session.selected_barber_email)) {
                    const userEmail = userInDb ? userInDb.email : (session ? session.user_email : null);

                    // Se o bot já veio com o e-mail do barbeiro vinculado (visto no bridge)
                    if (botBarberEmail) {
                        const b = await env.DB.prepare('SELECT email, name FROM users WHERE email = ?').bind(botBarberEmail).first();
                        if (b) {
                            await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
                            let msg = `✂️ *Bem-vindo à Barber!* \n\nVocê está sendo atendido por *${b.name}*. 💈\n\nO que deseja fazer?\n\n`;
                            msg += "1️⃣ - Agendar novo horário\n";
                            msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                            msg += "3️⃣ - Dúvidas com o Leo (Chat IA)\n";
                            msg += "\nDigite 'Menu' a qualquer momento para voltar.";
                            await sendMessage(from, msg);
                            return json({ success: true });
                        }
                    }

                    const barbers = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();

                    if (barbers.results.length === 1) {
                        const b = barbers.results[0];
                        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email) VALUES (?, "main_menu", ?, ?)').bind(from, userEmail, b.email).run();
                        let msg = `✂️ *Bem-vindo à Barber!* \n\nVocê está sendo atendido por *${b.name}*. 💈\n\nO que deseja fazer?\n\n`;
                        msg += "1️⃣ - Agendar novo horário\n";
                        msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
                        msg += "3️⃣ - Dúvidas com o Leo (Chat IA)\n";
                        msg += "\nDigite 'Menu' a qualquer momento para voltar.";
                        await sendMessage(from, msg);
                    } else if (barbers.results.length > 1) {
                        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email) VALUES (?, "awaiting_barber", ?)').bind(from, userEmail).run();
                        let msg = "✂️ *Bem-vindo à Barber!* \n\nPara começar, selecione o *Barbeiro* desejado:\n\n";
                        barbers.results.forEach((b, i) => { msg += `*${i + 1}* - ${b.name}\n`; });
                        msg += "\nDigite o número correspondente!";
                        await sendMessage(from, msg);
                    } else {
                        await sendMessage(from, "⚠️ Desculpe, não encontramos barbeiros ativos no momento. Tente novamente mais tarde.");
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
                    const barbers = await env.DB.prepare('SELECT email, name FROM users WHERE is_barber = 1').all();
                    const idx = parseInt(text) - 1;
                    const b = barbers.results[idx];
                    if (!b) {
                        await sendMessage(from, "❌ Opção inválida. Escolha um barbeiro da lista acima.");
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
                        const services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();
                        if (services.results.length === 0) {
                            await sendMessage(from, "❌ Este barbeiro ainda não cadastrou serviços. Escolha outro ou digite 'Menu'.");
                            return json({ success: true });
                        }
                        let msg = "📅 *Escolha o serviço:* \n";
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
                    const services = await env.DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(session.selected_barber_email).all();
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
                    const barber = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(session.selected_barber_email).first();

                    await sendMessage(from, `📝 *Tudo pronto! Confirme:* \n\n👤 *Nome:* ${userName}\n📧 *E-mail:* ${email}\n💇‍♂️ *Serviço:* ${s.name}\n📅 *Data:* ${session.appointment_date}\n⏰ *Hora:* ${session.appointment_time}\n💈 *Barbeiro:* ${barber?.name || 'Barbearia'}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir dados`);
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
