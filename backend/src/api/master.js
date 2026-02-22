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
            totalProfessionals: await DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_barber = 1').first(),
            activeBusinesses: await DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1 AND owner_id IS NULL').first(),
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
        const { targetEmail, is_admin, is_professional, expires, plan, phone, newName, newEmail, newShopName } = await request.json();

        await DB.prepare(`
            UPDATE users 
            SET is_admin = ?, is_barber = ?, subscription_expires = ?, plan = ?, phone = ?, name = ?, email = ?, shop_name = ?
            WHERE email = ?
        `).bind(
            is_admin ? 1 : 0,
            is_professional ? 1 : 0,
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

    // MASTER: Simular Onboarding Completo (Mock Total)
    if (url.pathname === '/api/master/simulate-onboarding' && request.method === 'POST') {
        const { email, name, phone, shopName, niche } = await request.json();
        const now = new Date();
        const expires = new Date();
        expires.setFullYear(now.getFullYear() + 1);

        const targetEmail = email || `demo_${Date.now()}@universal.com`;

        // 1. Criar Usuário Admin e Profissional
        await DB.prepare(`
            INSERT OR REPLACE INTO users (
                email, name, phone, is_admin, is_barber, business_type, shop_name, 
                plan, subscription_expires, bot_active, bot_name, bot_tone, 
                msg_welcome, wa_status, last_login
            ) VALUES (?, ?, ?, 1, 1, ?, ?, "Pro", ?, 1, "Leo", "profissional", ?, "connected", CURRENT_TIMESTAMP)
        `).bind(
            targetEmail,
            name || "João Exemplo",
            phone || "551199999999",
            niche || "barbearia",
            shopName || "Barbearia de Demonstração",
            expires.toISOString(),
            `Olá! Bem-vindo ao atendimento da nossa unidade. Como posso te ajudar?`
        ).run();

        // 2. Criar Serviços Mockados
        const services = [
            { id: `corte-${Date.now()}`, name: "Corte Social", price: 45 },
            { id: `barba-${Date.now()}`, name: "Barba Completa", price: 30 },
            { id: `combo-${Date.now()}`, name: "Cabelo e Barba", price: 65 }
        ];

        for (const s of services) {
            await DB.prepare('INSERT OR IGNORE INTO services (id, name, price, barber_email) VALUES (?, ?, ?, ?)')
                .bind(s.id, s.name, s.price, targetEmail).run();
        }

        // 3. Configurar Disponibilidade (Seg-Sex, 08-18h)
        for (let day = 1; day <= 5; day++) {
            await DB.prepare('INSERT OR IGNORE INTO availability (barber_email, day_of_week, start_time, end_time) VALUES (?, ?, "08:00", "18:00")')
                .bind(targetEmail, day).run();
        }

        return json({
            success: true,
            message: "Ecossistema criado com sucesso!",
            details: {
                email: targetEmail,
                plan: "Pro",
                botStatus: "connected",
                servicesCount: services.length,
                expires: expires.toISOString()
            }
        });
    }

    return null;
}
