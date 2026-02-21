import { json, notifyWhatsApp, getMasterEmail } from '../utils.js';

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
        const { date, action, adminEmail, times } = await request.json();
        const admin = await DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(adminEmail).first();
        if (!admin || admin.is_admin !== 1) return json({ error: 'Forbidden' }, 403);

        if (action === 'block') {
            const body = await request.json().catch(() => ({}));
            const scope = body.scope;
            const me = await DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(adminEmail).first();
            const isOwner = me && !me.owner_id;

            const targetBarbers = (isOwner && scope === 'shop')
                ? (await DB.prepare('SELECT email FROM users WHERE owner_id = ? OR email = ?').bind(adminEmail, adminEmail).all()).results.map(r => r.email)
                : [adminEmail];

            const statements = [];
            for (const bEmail of targetBarbers) {
                const existingTimes = await DB.prepare('SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"').bind(date, bEmail).all();
                const busySet = new Set(existingTimes.results.map(r => r.appointment_time));

                for (const time of times) {
                    if (!busySet.has(time)) {
                        const id = `block-${crypto.randomUUID()}`;
                        statements.push(DB.prepare(`
                            INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
                            VALUES (?, 'system', ?, 'block', ?, ?, 'blocked')
                        `).bind(id, bEmail, date, time));
                    }
                }
            }
            if (statements.length > 0) await DB.batch(statements);
            return json({ status: 'blocked' });
        } else {
            const body = await request.json().catch(() => ({}));
            const scope = body.scope;
            const me = await DB.prepare('SELECT owner_id FROM users WHERE email = ?').bind(adminEmail).first();
            const isOwner = me && !me.owner_id;

            if (isOwner && scope === 'shop') {
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

    return null; // Not handled
}
