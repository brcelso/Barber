/**
 * Barber App Server - Cloudflare Worker
 * Modularized version
 */

import { corsHeaders, json, getMasterEmail, notifyWhatsApp } from './utils/index.js';
import { handleWhatsAppWebhook } from './bot/index.js';
import { handleAdminRoutes } from './api/admin.js';
import { handleMasterRoutes } from './api/master.js';
import { handleAppointmentRoutes } from './api/appointments.js';
import { handleUserRoutes } from './api/user.js';
import { handlePaymentRoutes } from './api/payments.js';
import { handleTeamRoutes } from './api/team.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const { DB } = env;
        const MASTER_EMAIL = getMasterEmail(env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Schema Migration Check (Run once per request or use a better strategy) ---
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

            // --- Health Check ---
            if (url.pathname === '/') {
                return json({
                    status: 'API Online',
                    app_name: env.GLOBAL_APP_NAME || 'Barber API',
                    time: new Date().toISOString()
                });
            }

            // --- Modular Routes ---

            // 1. WhatsApp Webhook (Specialized)
            if (url.pathname === '/api/whatsapp/webhook' && request.method === 'POST') {
                return await handleWhatsAppWebhook(request, env);
            }

            // 2. Admin Routes
            const adminRes = await handleAdminRoutes(url, request, env);
            if (adminRes) return adminRes;

            // 3. Master Routes
            const masterRes = await handleMasterRoutes(url, request, env);
            if (masterRes) return masterRes;

            // 4. Appointment Routes
            const apptRes = await handleAppointmentRoutes(url, request, env);
            if (apptRes) return apptRes;

            // 5. User Routes
            const userRes = await handleUserRoutes(url, request, env);
            if (userRes) return userRes;

            // 6. Payment Routes
            const payRes = await handlePaymentRoutes(url, request, env);
            if (payRes) return payRes;

            // 7. Team Routes
            const teamRes = await handleTeamRoutes(request, env, url);
            if (teamRes) return teamRes;

            // --- Remaining Routes (Gradually move these to files too) ---

            // Authentication / Login
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

            // Get Current User Data
            if (url.pathname === '/api/auth/me' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');
                const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);

                const now = new Date();
                let expiresStr = user.subscription_expires;
                let activePlan = user.plan;
                let isStaff = !!user.owner_id;

                if (isStaff) {
                    const owner = await DB.prepare('SELECT subscription_expires, plan FROM users WHERE email = ?').bind(user.owner_id).first();
                    expiresStr = owner?.subscription_expires;
                    activePlan = 'Barber Shop (Staff)';
                } else if (user.business_type === 'barbearia') {
                    activePlan = 'Barber Shop';
                }

                let expires = expiresStr ? new Date(expiresStr) : new Date();
                const diffTime = expires - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return json({
                    ...user,
                    daysLeft: Math.max(0, diffDays),
                    expires: expiresStr,
                    isActive: diffTime > 0,
                    trialUsed: !!user.trial_used,
                    isMaster: email === MASTER_EMAIL,
                    plan: activePlan,
                    isBarber: user.is_barber === 1,
                    isStaff: isStaff,
                    ownerId: user.owner_id,
                    ownerEmail: user.owner_id
                });
            }

            // Get Services
            if (url.pathname === '/api/services' && request.method === 'GET') {
                const barberEmail = url.searchParams.get('barber_email');
                if (barberEmail) {
                    let services = await DB.prepare('SELECT * FROM services WHERE id != ? AND (barber_email = ? OR barber_email IS NULL)').bind('block', barberEmail).all();
                    if (services.results.length === 0) {
                        const barber = await DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(barberEmail).first();
                        if (barber && barber.owner_id) {
                            services = await DB.prepare('SELECT * FROM services WHERE id != ? AND (barber_email = ? OR barber_email IS NULL)').bind('block', barber.owner_id).all();
                        }
                    }
                    return json(services.results);
                } else {
                    const services = await DB.prepare('SELECT * FROM services WHERE id != ?').bind('block').all();
                    return json(services.results);
                }
            }

            // Get Barbers
            if (url.pathname === '/api/barbers' && request.method === 'GET') {
                const barbers = await DB.prepare('SELECT email, name, picture, business_type, owner_id, shop_name FROM users WHERE is_barber = 1').all();
                return json(barbers.results.map(b => ({ ...b, ownerId: b.owner_id })));
            }

            // WhatsApp Bridge Status Updates
            if (url.pathname === '/api/whatsapp/status' && request.method === 'POST') {
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

                if (email === MASTER_EMAIL) {
                    const check = await DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(MASTER_EMAIL).first();
                    const exp = check?.subscription_expires ? new Date(check.subscription_expires) : null;
                    if (!exp || exp < new Date()) {
                        const future = new Date(); future.setFullYear(future.getFullYear() + 10);
                        await DB.prepare('UPDATE users SET subscription_expires = ?, plan = "Barber Shop", business_type = "barbearia" WHERE email = ?').bind(future.toISOString(), MASTER_EMAIL).run();
                    }
                }
                return json({ success: true });
            }

            if (url.pathname === '/api/whatsapp/status' && request.method === 'GET') {
                const email = request.headers.get('X-User-Email');

                // Automated Cleanup: delete appointments older than 60 days
                try {
                    const sixtyDaysAgo = new Date();
                    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                    const dateStr = sixtyDaysAgo.toISOString().split('T')[0];
                    await DB.prepare('DELETE FROM appointments WHERE appointment_date < ?').bind(dateStr).run();
                } catch (e) {
                    console.error('[Cleanup Error]', e.message);
                }

                const user = await DB.prepare('SELECT wa_status, wa_qr, wa_last_seen FROM users WHERE email = ?').bind(email).first();
                if (!user) return json({ error: 'User not found' }, 404);
                let status = user.wa_status || 'disconnected';
                if (status === 'connected' && user.wa_last_seen) {
                    const lastSeen = new Date(user.wa_last_seen);
                    if ((new Date() - lastSeen) > 45000) {
                        status = 'disconnected';
                        try { await DB.prepare('UPDATE users SET wa_status = "disconnected" WHERE email = ?').bind(email).run(); } catch (error) {
                            console.error('[Status Update Error]', error.message);
                        }
                    }
                }
                return json({ status, qr: user.wa_qr });
            }

            // Mercado Pago Webhook
            if (url.pathname === '/api/payments/webhook' && request.method === 'POST') {
                const body = await request.json();
                if (body.type === 'payment' || body.action === 'payment.created' || body.action === 'payment.updated') {
                    const paymentId = body.data?.id || body.resource?.split('/').pop();
                    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                        headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` }
                    });
                    const payment = await mpRes.json();
                    if (payment.status === 'approved') {
                        const ref = payment.external_reference;
                        if (ref && ref.startsWith('sub_')) {
                            const email = ref.replace('sub_', '');
                            const user = await DB.prepare('SELECT subscription_expires FROM users WHERE email = ?').bind(email).first();
                            const base = (user?.subscription_expires && new Date(user.subscription_expires) > new Date()) ? new Date(user.subscription_expires) : new Date();
                            base.setDate(base.getDate() + 30);
                            await DB.prepare('UPDATE users SET subscription_expires = ? WHERE email = ?').bind(base.toISOString(), email).run();
                        } else {
                            await DB.prepare('UPDATE appointments SET status = "confirmed", payment_status = "paid" WHERE id = ?').bind(ref).run();
                            await notifyWhatsApp(env, DB, ref, 'confirmed');
                        }
                    }
                }
                return json({ received: true });
            }

            return json({ error: 'Not Found' }, 404);

        } catch (e) {
            console.error('[Global Error]', e);
            return json({ error: 'Internal Server Error', message: e.message }, 500);
        }
    },

    async scheduled(event, env, ctx) {
        const { handleDailyBriefing } = await import('./cron/dailyBriefing.js');
        ctx.waitUntil(handleDailyBriefing(env, event));
    }
};
