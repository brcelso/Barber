import { json, notifyWhatsApp, getMasterEmail } from '../utils/index.js';

export async function handleAdminRoutes(url, request, env) {
    const { DB } = env;
    const MASTER_EMAIL = getMasterEmail(env);

    // Subscription Status
    if (url.pathname === '/api/admin/subscription' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        const user = await DB.prepare('SELECT is_admin, is_barber, subscription_expires, trial_used, plan, owner_id FROM users WHERE email = ?').bind(email).first();
        if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) return json({ error: 'Permission Denied' }, 403);

        let expiresStr = user.subscription_expires;
        let activePlan = user.plan;
        let isStaff = !!user.owner_id;

        if (isStaff) {
            const owner = await DB.prepare('SELECT subscription_expires, plan FROM users WHERE email = ?').bind(user.owner_id).first();
            expiresStr = owner?.subscription_expires;
            activePlan = 'Barber Shop (Staff)';
        }

        const now = new Date();
        let expires = expiresStr ? new Date(expiresStr) : new Date();

        if (email === MASTER_EMAIL) {
            expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3650);
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
            isStaff: isStaff,
            ownerId: user.owner_id,
            ownerEmail: user.owner_id
        });
    }

    // Admin: Get ALL Appointments
    if (url.pathname === '/api/admin/appointments' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        const user = await DB.prepare('SELECT is_admin, is_barber, owner_id FROM users WHERE email = ?').bind(email).first();

        if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) {
            return json({ error: 'Permission Denied' }, 403);
        }

        let allAppointments;

        if (!user.owner_id) {
            const teamEmails = await DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(email, email).all();
            const emails = teamEmails.results.map(t => t.email);
            const placeholders = emails.map(() => '?').join(',');
            allAppointments = await DB.prepare(`
                SELECT a.*, s.name as service_name, s.price, u.name as user_name, u.picture as user_picture, u.phone as user_phone, b.name as barber_name
                FROM appointments a
                LEFT JOIN services s ON a.service_id = s.id
                LEFT JOIN users u ON a.user_email = u.email
                LEFT JOIN users b ON a.barber_email = b.email
                WHERE a.barber_email IN (${placeholders})
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            `).bind(...emails).all();
        } else {
            allAppointments = await DB.prepare(`
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

    // Admin: Bulk Toggle Block Day
    if (url.pathname === '/api/admin/bulk-toggle-block' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const adminEmail = request.headers.get('X-User-Email') || body.adminEmail;
        const { date, action, times, scope } = body;

        if (!adminEmail) return json({ error: 'Email não fornecido' }, 400);

        const admin = await DB.prepare('SELECT is_admin, owner_id FROM users WHERE email = ?').bind(adminEmail).first();
        if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

        if (action === 'block') {
            const isOwner = !admin.owner_id;
            const targetBarbers = (isOwner && scope === 'shop')
                ? (await DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all()).results.map(r => r.email)
                : [adminEmail];

            const statements = [];
            for (const bEmail of targetBarbers) {
                // Busca o que já está ocupado para evitar conflitos desnecessários
                const existing = await DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"').bind(date, bEmail).all();
                const busySet = new Set(existing.results.map(r => r.appointment_time));

                for (const time of times) {
                    if (!busySet.has(time)) {
                        // ID determinístico para evitar duplicatas: block-email-data-hora
                        const id = `block-${bEmail}-${date}-${time.replace(':', '')}`; 
                        statements.push(DB.prepare(`
                            INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                            VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                            ON CONFLICT(id) DO UPDATE SET status = 'blocked'
                        `).bind(id, bEmail, date, time));
                    }
                }
            }

            if (statements.length > 0) {
                await DB.batch(statements);
            }
            return json({ status: 'blocked', count: statements.length });
        } else {
            // Lógica de Unblock
            if (!admin.owner_id && scope === 'shop') {
                const team = await DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all();
                const teamEmails = team.results.map(r => r.email);
                const placeholders = teamEmails.map(() => '?').join(',');
                await DB.prepare(`DELETE FROM appointments WHERE appointment_date = ? AND status = "blocked" AND barber_email IN (${placeholders})`).bind(date, ...teamEmails).run();
            } else {
                await DB.prepare('DELETE FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status = "blocked"').bind(date, adminEmail).run();
            }
            return json({ status: 'unblocked' });
        }
    }

    // Admin: Get Bot Settings
    if (url.pathname === '/api/admin/bot/settings' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        const user = await DB.prepare('SELECT bot_name, business_type, bot_tone, welcome_message, msg_welcome, msg_choose_barber, msg_choose_service, msg_confirm_booking FROM users WHERE email = ?').bind(email).first();
        if (!user) return json({ error: 'User not found' }, 404);
        return json(user);
    }

    // Admin: Update Bot Settings
    if (url.pathname === '/api/admin/bot/settings' && request.method === 'POST') {
        const email = request.headers.get('X-User-Email');
        const { bot_name, business_type, bot_tone, welcome_message, msg_welcome, msg_choose_barber, msg_choose_service, msg_confirm_booking } = await request.json().catch((error) => {
            console.error('[JSON Parse Error]', error.message);
            return {};
        });

        await DB.prepare(`
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

    // Admin: Update Bridge URL
    if (url.pathname === '/api/admin/bridge/update' && request.method === 'POST') {
        const { key, url: bridgeUrl, email } = await request.json();
        if (key !== env.WA_BRIDGE_KEY) return json({ error: 'Invalid Key' }, 401);

        try {
            await DB.prepare('ALTER TABLE users ADD COLUMN wa_bridge_url TEXT').run();
        } catch (e) {
            console.error('[Column Add Error]', e.message);
        }

        await DB.prepare('UPDATE users SET wa_bridge_url = ? WHERE email = ?').bind(bridgeUrl, email).run();
        return json({ success: true });
    }

    // Admin: Remote Start/Stop Bot
    if ((url.pathname === '/api/admin/bot/start' || url.pathname === '/api/admin/bot/stop') && request.method === 'POST') {
        const email = request.headers.get('X-User-Email');
        const user = await DB.prepare('SELECT is_admin, is_barber, wa_bridge_url FROM users WHERE email = ?').bind(email).first();
        if (!user || (user.is_admin !== 1 && user.is_barber !== 1)) return json({ error: 'Permission Denied' }, 403);

        const { targetEmail } = await request.json();
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

    // Admin: Update Appointment Payment Status
    if (url.pathname === '/api/admin/appointments/update-payment' && request.method === 'POST') {
        const { appointmentId, adminEmail, status, paymentId } = await request.json();
        const admin = await DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
        if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

        await DB.prepare(`
            UPDATE appointments 
            SET status = ?, payment_status = 'paid', payment_id = ? 
            WHERE id = ?
        `).bind(status || 'confirmed', paymentId || 'Manual', appointmentId).run();

        if (status === 'confirmed') {
            await notifyWhatsApp(env, DB, appointmentId, 'confirmed');
        }

        return json({ success: true });
    }

    // Admin: Individual Toggle Block Slot
    if (url.pathname === '/api/admin/toggle-block' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const adminEmail = request.headers.get('X-User-Email') || body.adminEmail;
        const { date, time } = body;

        const admin = await DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(adminEmail).first();
        if (!admin || (admin.is_admin !== 1 && admin.is_barber !== 1)) return json({ error: 'Forbidden' }, 403);

        const existing = await DB.prepare('SELECT id, status FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND barber_email = ?').bind(date, time, adminEmail).first();

        if (existing) {
            if (existing.status === 'blocked') {
                await DB.prepare('DELETE FROM appointments WHERE id = ?').bind(existing.id).run();
                return json({ status: 'unblocked' });
            } else {
                return json({ error: 'Existem agendamentos neste horário' }, 409);
            }
        } else {
            const id = `block-${adminEmail}-${date}-${time.replace(':', '')}`;
            await DB.prepare(`
                INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                ON CONFLICT(id) DO UPDATE SET status = 'blocked'
            `).bind(id, adminEmail, date, time).run();
            return json({ status: 'blocked' });
        }
    }

    return null; // Not handled
}