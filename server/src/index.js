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

            // Get Styles/Services
            if (url.pathname === '/api/services' && request.method === 'GET') {
                const services = await env.DB.prepare('SELECT * FROM services').all();
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
                    // Ensure 'system' user and 'block' service exist to satisfy FK constraints
                    await env.DB.prepare(`
                        INSERT OR IGNORE INTO users (email, name, is_admin, created_at)
                        VALUES ('system', 'System', 0, CURRENT_TIMESTAMP)
                    `).run();
                    await env.DB.prepare(`
                        INSERT OR IGNORE INTO services (id, name, price, duration_minutes, description)
                        VALUES ('block', 'Blocked Slot', 0.0, 0, 'Reserved by admin')
                    `).run();

                    await env.DB.prepare(`
                        INSERT INTO appointments (id, user_email, service_id, appointment_date, appointment_time, status)
                        VALUES (?, 'system', 'block', ?, ?, 'blocked')
                    `).bind(id, date, time).run();
                    return json({ status: 'blocked' });
                }
            }

            // Public: Get Busy Slots for a Date
            if (url.pathname === '/api/appointments/busy-slots' && request.method === 'GET') {
                const date = url.searchParams.get('date');
                if (!date) return json({ error: 'Missing date' }, 400);

                const busy = await env.DB.prepare('SELECT appointment_time as time, status FROM appointments WHERE appointment_date = ? AND status != "cancelled"').bind(date).all();
                return json(busy.results);
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
