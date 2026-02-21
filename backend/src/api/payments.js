import { json } from '../utils/index.js';

export async function handlePaymentRoutes(url, request, env) {
    const { DB } = env;

    // Create Mercado Pago Preference for Subscriptions
    if (url.pathname === '/api/admin/subscription/payment' && request.method === 'POST') {
        const { email, planId } = await request.json();

        const plans = {
            'individual': { title: 'Plano Barbeiro Solo', price: 29.90 },
            'barbearia': { title: 'Plano Barbearia (Equipe)', price: 89.90 }
        };
        const plan = plans[planId] || plans['individual'];

        try {
            const mpPref = {
                items: [{
                    title: `Barber - ${plan.title}`,
                    quantity: 1,
                    unit_price: plan.price,
                    currency_id: 'BRL'
                }],
                external_reference: `sub_${email}`,
                back_urls: {
                    success: `${env.FRONTEND_URL}/admin/success`,
                    failure: `${env.FRONTEND_URL}/admin/cancel`,
                    pending: `${env.FRONTEND_URL}/admin/pending`
                },
                auto_return: 'approved'
            };

            const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(mpPref)
            });

            const mpD = await mpRes.json();
            return json({ paymentUrl: mpD.init_point });
        } catch (e) {
            return json({ error: 'Failed to create payment' }, 500);
        }
    }

    // Create Mercado Pago Preference for Appointment
    if (url.pathname === '/api/payments/create' && request.method === 'POST') {
        const { appointmentId, email } = await request.json();

        const appt = await DB.prepare(`
            SELECT a.*, s.name as service_name, s.price 
            FROM appointments a 
            JOIN services s ON a.service_id = s.id 
            WHERE a.id = ?
        `).bind(appointmentId).first();

        if (!appt) return json({ error: 'Appointment not found' }, 404);

        try {
            const mpPref = {
                items: [{
                    title: `Agendamento - ${appt.service_name}`,
                    quantity: 1,
                    unit_price: appt.price,
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

            const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(mpPref)
            });

            const mpD = await mpRes.json();
            return json({ paymentUrl: mpD.init_point });
        } catch (e) {
            return json({ error: 'Failed' }, 500);
        }
    }

    // Mock Payment (Admin/Simulation)
    if (url.pathname === '/api/payments/mock' && request.method === 'POST') {
        const { appointmentId, method } = await request.json();

        await DB.prepare(`
            UPDATE appointments 
            SET status = 'confirmed', payment_status = 'paid', payment_id = ? 
            WHERE id = ?
        `).bind(method || 'Mock', appointmentId).run();

        const { notifyWhatsApp } = await import('../utils/index.js');
        await notifyWhatsApp(env, DB, appointmentId, 'confirmed');

        return json({ success: true });
    }

    // Mock Subscription Payment (3 days trial)
    if (url.pathname === '/api/admin/subscription/pay' && request.method === 'POST') {
        const { email } = await request.json();

        const expires = new Date();
        expires.setDate(expires.getDate() + 3);

        await DB.prepare('UPDATE users SET subscription_expires = ?, plan = "Trial", trial_used = 1 WHERE email = ?').bind(expires.toISOString(), email).run();

        return json({ success: true });
    }

    return null;
}
