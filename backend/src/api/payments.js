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
        } catch (error) {
            console.error('[MP Preference Error]', error.message);
            return json({ error: 'Failed to create payment' }, 500);
        }
    }

    // Create Mercado Pago Preference for Appointment
    if (url.pathname === '/api/payments/create' && request.method === 'POST') {
        const { appointmentId } = await request.json();

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
        } catch (error) {
            console.error('[MP Preference Error]', error.message);
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

    // Mercado Pago Webhook (IPN)
    if (url.pathname === '/api/payments/webhook' && request.method === 'POST') {
        const payload = await request.json();
        console.log('[MP Webhook] Received:', JSON.stringify(payload));

        // Note: Em produção, você deve validar o Signature do Mercado Pago
        const paymentId = payload.data?.id || payload.id;
        const topic = payload.type || payload.topic;

        if (topic === 'payment' && paymentId) {
            try {
                const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` }
                });
                const paymentData = await mpRes.json();

                if (paymentData.status === 'approved') {
                    const appointmentId = paymentData.external_reference;

                    if (appointmentId && appointmentId.startsWith('sub_')) {
                        // Tratar renovação de assinatura
                        const email = appointmentId.replace('sub_', '');
                        const expires = new Date();
                        expires.setMonth(expires.getMonth() + 1);
                        await DB.prepare('UPDATE users SET subscription_expires = ?, plan = "Ecosystem Pro" WHERE email = ?').bind(expires.toISOString(), email).run();

                        // Notificar o usuário sobre a ativação
                        const user = await DB.prepare('SELECT phone FROM users WHERE email = ?').bind(email).first();
                        if (user?.phone) {
                            const { sendMessage } = await import('../utils/index.js');
                            await sendMessage(env, user.phone, "🚀 *Assinatura Ativada!* \n\nParabéns! Seu pagamento foi processado e seu Agente Inteligente agora tem acesso total aos recursos Pro. Boas vendas! 💰", email);
                        }
                    } else {
                        // Tratar agendamento normal
                        const appt = await DB.prepare('SELECT id, status FROM appointments WHERE id = ?').bind(appointmentId).first();
                        if (appt && appt.status !== 'confirmed') {
                            await DB.prepare(`
                                UPDATE appointments 
                                SET status = 'confirmed', payment_status = 'paid', payment_id = ? 
                                WHERE id = ?
                            `).bind(paymentId.toString(), appointmentId).run();

                            const { notifyWhatsApp } = await import('../utils/index.js');
                            await notifyWhatsApp(env, DB, appointmentId, 'confirmed');
                        }
                    }
                }
            } catch (error) {
                console.error('[MP Webhook Error]', error.message);
            }
        }
        return json({ received: true });
    }

    return null;
}
