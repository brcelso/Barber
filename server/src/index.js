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

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Routes ---

            // Health check
            if (url.pathname === '/') {
                return json({ status: 'Barber API Online', time: new Date().toISOString() });
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
                return json({ user: { ...user, isAdmin: user.is_admin === 1 } });
            }

            // Get Styles/Services (exclude internal 'block' service)
            if (url.pathname === '/api/services' && request.method === 'GET') {
                const services = await env.DB.prepare('SELECT * FROM services WHERE id != ?').bind('block').all();
                return json(services.results);
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
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                `).all();

                return json(allAppointments.results);
            }

            // Get Appointments for a user
            if (url.pathname === '/api/appointments' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                if (!email) return json({ error: 'Unauthorized' }, 401);

                const appointments = await env.DB.prepare(`
                    SELECT a.*, s.name as service_name, s.price
                    FROM appointments a
                    JOIN services s ON a.service_id = s.id
                    WHERE a.user_email = ?
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                `).bind(email).all();

                return json(appointments.results);
            }

            // Book an Appointment
            if (url.pathname === '/api/appointments/book' && request.method === 'POST') {
                const { email, serviceId, date, time, skipPayment } = await request.json();
                if (!email || !serviceId || !date || !time) {
                    return json({ error: 'Missing fields' }, 400);
                }

                const id = crypto.randomUUID();
                const service = await env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

                if (!service) return json({ error: 'Service not found' }, 404);

                // Check for existing appointment at same time
                const conflict = await env.DB.prepare('SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != "cancelled"').bind(date, time).first();
                if (conflict) {
                    return json({ error: 'Horário já ocupado' }, 409);
                }

                // Create appointment record
                await env.DB.prepare(`
                    INSERT INTO appointments (id, user_email, service_id, appointment_date, appointment_time, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')
                `).bind(id, email, serviceId, date, time).run();

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
                    WHERE a.id = ? AND a.user_email = ?
                `).bind(appointmentId, email).first();

                if (!appointment) return json({ error: 'Agendamento não encontrado' }, 404);

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
                return json({ paymentUrl: mpData.init_point });
            }

            // Admin: Confirm Appointment (Manual)
            if (url.pathname === '/api/admin/appointments/confirm' && request.method === 'POST') {
                const { appointmentId, adminEmail } = await request.json();
                const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
                if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

                await env.DB.prepare('UPDATE appointments SET status = "confirmed" WHERE id = ?').bind(appointmentId).run();

                // Get user email to simulate notification
                const appt = await env.DB.prepare('SELECT user_email FROM appointments WHERE id = ?').bind(appointmentId).first();
                console.log(`[Notification] Sending confirmation email to ${appt.user_email} for appt ${appointmentId}`);

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

                if (!from) return json({ error: "Missing phone" }, 400);

                // Helper to send message back (Placeholder for Evolution/Z-API/Twilio)
                const sendMessage = async (phone, message) => {
                    console.log(`[WhatsApp Bot] TO: ${phone} MSG: ${message}`);
                    // return fetch(`${env.WA_API_URL}/send`, { method: 'POST', body: JSON.stringify({ phone, message }), headers: { 'Authorization': env.WA_TOKEN } });
                };

                let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

                // Restart or Start
                if (!session || textLower === 'oi' || textLower === 'ola' || textLower === 'menu' || textLower === 'sair') {
                    const services = await env.DB.prepare('SELECT * FROM services WHERE id != "block"').all();
                    let msg = "✂️ *Bem-vindo à Barber!* \n\nEscolha um serviço enviando o número:\n";
                    services.results.forEach((s, i) => { msg += `\n*${i + 1}* - ${s.name} (R$ ${s.price})`; });

                    await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state) VALUES (?, "awaiting_service")').bind(from).run();
                    await sendMessage(from, msg);
                    return json({ success: true });
                }

                // FLOW: Choose Service
                if (session.state === 'awaiting_service') {
                    const index = parseInt(text) - 1;
                    const services = await env.DB.prepare('SELECT * FROM services WHERE id != "block"').all();
                    const service = services.results[index];

                    if (!service) return sendMessage(from, "❌ Opção inválida. Escolha um serviço da lista.");

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_date", service_id = ? WHERE phone = ?').bind(service.id, from).run();

                    let msg = `✅ *${service.name}* selecionado.\n\n📅 *Escolha a data:*`;
                    for (let i = 0; i < 7; i++) {
                        const d = new Date(); d.setDate(d.getDate() + i);
                        const str = d.toISOString().split('T')[0];
                        msg += `\n*${i + 1}* - ${str}`;
                    }
                    return sendMessage(from, msg);
                }

                // FLOW: Choose Date
                if (session.state === 'awaiting_date') {
                    const index = parseInt(text) - 1;
                    if (index < 0 || index > 6) return sendMessage(from, "❌ Data inválida. Escolha de 1 a 7.");

                    const d = new Date(); d.setDate(d.getDate() + index);
                    const dateStr = d.toISOString().split('T')[0];

                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != "cancelled"').bind(dateStr).all();
                    const busyTimes = busy.results.map(r => r.appointment_time);
                    const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
                    const available = timeSlots.filter(t => !busyTimes.includes(t));

                    if (available.length === 0) return sendMessage(from, "❌ Infelizmente não há horários para este dia. Escolha outro dia.");

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_time", appointment_date = ? WHERE phone = ?').bind(dateStr, from).run();

                    let msg = `📅 *Data: ${dateStr}*\n\n⏰ *Escolha o horário:*`;
                    available.forEach((t, i) => { msg += `\n*${i + 1}* - ${t}`; });
                    return sendMessage(from, msg);
                }

                // FLOW: Choose Time
                if (session.state === 'awaiting_time') {
                    const dateStr = session.appointment_date;
                    const busy = await env.DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != "cancelled"').bind(dateStr).all();
                    const busyTimes = busy.results.map(r => r.appointment_time);
                    const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
                    const available = timeSlots.filter(t => !busyTimes.includes(t));

                    const index = parseInt(text) - 1;
                    const time = available[index];
                    if (!time) return sendMessage(from, "❌ Horário inválido.");

                    // Check if we know this user
                    const user = await env.DB.prepare('SELECT email FROM users WHERE phone LIKE ?').bind(`%${from}`).first();

                    if (user) {
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", appointment_time = ?, user_email = ? WHERE phone = ?').bind(time, user.email, from).run();
                        return sendMessage(from, `📍 *Quase lá!* \n\n*Serviço:* ${session.service_id}\n*Data:* ${dateStr}\n*Hora:* ${time}\n\nConfirma o agendamento? \n*1* - Sim\n*2* - Não/Cancelar`);
                    } else {
                        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_email", appointment_time = ? WHERE phone = ?').bind(time, from).run();
                        return sendMessage(from, `⏰ *Horário ${time} reservado!* \n\nComo é sua primeira vez pelo WhatsApp, por favor digite seu *E-mail* para completar o cadastro:`);
                    }
                }

                // FLOW: Awaiting Email (New users)
                if (session.state === 'awaiting_email') {
                    const email = text.toLowerCase();
                    if (!email.includes('@')) return sendMessage(from, "❌ E-mail inválido. Digite um e-mail correto:");

                    // Upsert user
                    await env.DB.prepare('INSERT OR IGNORE INTO users (email, name, phone) VALUES (?, ?, ?)').bind(email, `Cliente ${from}`, from).run();

                    await env.DB.prepare('UPDATE whatsapp_sessions SET state = "awaiting_confirmation", user_email = ? WHERE phone = ?').bind(email, from).run();
                    return sendMessage(from, `📍 *Confirmado e-mail!* \n\nConfirma o agendamento? \n*1* - Sim\n*2* - Não/Cancelar`);
                }

                // FLOW: Final Confirmation + Payment Link
                if (session.state === 'awaiting_confirmation') {
                    if (text === '1') {
                        const id = crypto.randomUUID();
                        await env.DB.prepare(`
                            INSERT INTO appointments (id, user_email, service_id, appointment_date, appointment_time, status)
                            VALUES (?, ?, ?, ?, ?, 'pending')
                        `).bind(id, session.user_email, session.service_id, session.appointment_date, session.appointment_time).run();

                        // Generate MP Link (Simplified)
                        const paymentUrl = `${env.FRONTEND_URL}/?payment=${id}`; // In real case, call MP API to get init_point

                        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                        return sendMessage(from, `🎉 *Agendamento Realizado!* \n\nSeu horário está reservado. Para garantir sua vaga, realize o pagamento no link abaixo:\n\n🔗 ${paymentUrl}\n\nObrigado!`);
                    } else {
                        await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
                        return sendMessage(from, "❌ Agendamento cancelado. Quando quiser, mande um 'Oi'.");
                    }
                }

                return sendMessage(from, "Não entendi. Digite 'Menu' para recomeçar.");
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
                        const apptId = payment.external_reference;
                        await env.DB.prepare('UPDATE appointments SET status = "confirmed", payment_status = "paid" WHERE id = ?').bind(apptId).run();
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
