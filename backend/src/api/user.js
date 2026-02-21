import { json } from '../utils/index.js';

export async function handleUserRoutes(url, request, env) {
    const { DB } = env;

    // Promote User to Barber
    if (url.pathname === '/api/user/promote' && request.method === 'POST') {
        const { email } = await request.json();

        // Trial setting: 3 days
        const expires = new Date();
        expires.setDate(expires.getDate() + 3);

        await DB.prepare(`
            UPDATE users 
            SET is_barber = 1, is_admin = 1, subscription_expires = ?, plan = 'Barber Shop', business_type = 'individual', trial_used = 1
            WHERE email = ?
        `).bind(expires.toISOString(), email).run();

        return json({ success: true });
    }

    // Update Profile (Phone)
    if (url.pathname === '/api/user/update-profile' && request.method === 'POST') {
        const { email, phone } = await request.json();
        if (!email || !phone) return json({ error: 'Missing fields' }, 400);

        await DB.prepare('UPDATE users SET phone = ? WHERE email = ?').bind(phone, email).run();
        return json({ success: true });
    }

    return null;
}
