/**
 * Barber App Server - Cloudflare Worker
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*', // Adjust for production
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Email',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Helper: Response Builder ---
            const json = (data, status = 200) => new Response(JSON.stringify(data), {
                status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

            // --- Routes ---

            // Health check
            if (url.pathname === '/') {
                return json({ status: 'Barber API Online', time: new Date().toISOString() });
            }

            // Authentication / Login
            if (url.pathname === '/api/login' && request.method === 'POST') {
                const userData = await request.json();
                const token = request.headers.get('Authorization')?.replace('Bearer ', '');

                // In a real app, verify 'token' with Google Auth
                // For now, we trust the frontend and save user info
                await env.DB.prepare(`
                    INSERT INTO users (email, name, picture, last_login)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name,
                    picture = excluded.picture,
                    last_login = CURRENT_TIMESTAMP
                `).bind(userData.email, userData.name, userData.picture).run();

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
                    SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture
                    FROM appointments a
                    JOIN services s ON a.service_id = s.id
                    JOIN users u ON a.user_email = u.email
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

            // Webhook for Mercado Pago
            if (url.pathname === '/api/webhook/mp' && request.method === 'POST') {
                const data = await request.json();

                // Usually check 'topic' and 'resource'
                if (data.type === 'payment') {
                    const paymentId = data.data.id;

                    // Fetch payment details from MP
                    const pRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                        headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` }
                    });
                    const payment = await pRes.json();

                    if (payment.status === 'approved') {
                        const appointmentId = payment.external_reference;
                        await env.DB.prepare('UPDATE appointments SET status = "confirmed", payment_status = "paid", payment_id = ? WHERE id = ?')
                            .bind(paymentId.toString(), appointmentId)
                            .run();
                    }
                }

                return new Response('OK', { status: 200, headers: corsHeaders });
            }

            return json({ error: 'Not Found' }, 404);

        } catch (err) {
            return json({ error: err.message, stack: err.stack }, 500);
        }
    }
};
