import { json, getMasterEmail } from '../utils/index.js';

export async function handleMasterRoutes(url, request, env) {
    const { DB } = env;
    const MASTER_EMAIL = getMasterEmail(env);

    const email = request.headers.get('X-User-Email');
    if (email !== MASTER_EMAIL) return null; // Not authorized or not master route

    // MASTER: Global Stats
    if (url.pathname === '/api/master/stats' && request.method === 'GET') {
        const stats = {
            totalUsers: await DB.prepare('SELECT COUNT(*) as count FROM users').first(),
            totalBarbers: await DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_barber = 1').first(),
            activeAdmins: await DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').first(),
            totalAppointments: await DB.prepare('SELECT COUNT(*) as count FROM appointments').first(),
            connectedBots: await DB.prepare('SELECT COUNT(*) as count FROM users WHERE wa_status = "connected"').first(),
            planCounts: await DB.prepare('SELECT plan, COUNT(*) as count FROM users WHERE plan IS NOT NULL GROUP BY plan').all()
        };
        return json(stats);
    }

    // MASTER: List All Barbers/Admins
    if (url.pathname === '/api/master/users' && request.method === 'GET') {
        const usersListing = await DB.prepare("SELECT email, name, phone, is_admin, is_barber, wa_status, wa_last_seen, subscription_expires, trial_used, plan, business_type, owner_id, shop_name FROM users WHERE email != 'system' ORDER BY created_at DESC").all();

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
        const { targetEmail, is_admin, is_barber, expires, plan, phone, newName, newEmail, newShopName } = await request.json();

        await DB.prepare(`
            UPDATE users 
            SET is_admin = ?, is_barber = ?, subscription_expires = ?, plan = ?, phone = ?, name = ?, email = ?, shop_name = ?
            WHERE email = ?
        `).bind(
            is_admin ? 1 : 0,
            is_barber ? 1 : 0,
            expires || null,
            plan || null,
            phone || null,
            newName || null,
            newEmail || targetEmail,
            newShopName || null,
            targetEmail
        ).run();

        return json({ success: true });
    }

    // MASTER: Delete User
    if (url.pathname === '/api/master/user/delete' && request.method === 'POST') {
        const { targetEmail } = await request.json();
        if (targetEmail === MASTER_EMAIL) return json({ error: 'Cannot delete master user' }, 400);

        await DB.prepare('DELETE FROM appointments WHERE user_email = ? OR barber_email = ?').bind(targetEmail, targetEmail).run();
        await DB.prepare('DELETE FROM whatsapp_sessions WHERE user_email = ?').bind(targetEmail).run();
        await DB.prepare('DELETE FROM users WHERE email = ?').bind(targetEmail).run();

        return json({ success: true });
    }

    return null;
}
