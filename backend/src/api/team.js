import { json } from '../utils/index.js';

export async function handleTeamRoutes(request, env, url) {
    const { DB } = env;

    // Create Team Member (Shop Owner adds staff)
    if (url.pathname === '/api/team/add' && request.method === 'POST') {
        const { name, email, ownerEmail } = await request.json();

        // Verify if requester is really a barber/owner
        const requester = await DB.prepare('SELECT is_barber FROM users WHERE email = ?').bind(ownerEmail).first();
        if (!requester || requester.is_barber !== 1) return json({ error: 'Unauthorized' }, 401);

        // Insert new staff member linked to owner
        try {
            await DB.prepare(`
                INSERT INTO users (email, name, is_admin, is_barber, owner_id, business_type, picture, created_at)
                VALUES (?, ?, 1, 1, ?, 'staff', ?, CURRENT_TIMESTAMP)
            `).bind(
                email,
                name,
                ownerEmail,
                `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
            ).run();
            return json({ success: true });
        } catch (e) {
            if (e.message.includes('UNIQUE')) {
                return json({ error: 'Email já cadastrado' }, 409);
            }
            return json({ error: e.message }, 500);
        }
    }

    // Recruit Existing Barber (Shop Owner recruits independent barber)
    if (url.pathname === '/api/team/recruit' && request.method === 'POST') {
        const { email, ownerEmail } = await request.json();

        // 1. Verify Owner
        const owner = await DB.prepare('SELECT is_barber FROM users WHERE email = ?').bind(ownerEmail).first();
        if (!owner || owner.is_barber !== 1) return json({ error: 'Apenas barbeiros/donos podem recrutar' }, 403);

        // 2. Verify Target (Must be barber and independent)
        const target = await DB.prepare('SELECT is_barber, owner_id FROM users WHERE email = ?').bind(email).first();
        if (!target) return json({ error: 'Usuário não encontrado' }, 404);
        if (target.is_barber !== 1) return json({ error: 'Apenas barbeiros podem ser recrutados. Promova o usuário primeiro.' }, 400);
        if (target.owner_id) return json({ error: 'Este barbeiro já pertence a uma equipe.' }, 409);

        // 3. Execute Recruitment
        await DB.prepare(`
            UPDATE users 
            SET owner_id = ?, business_type = 'staff' 
            WHERE email = ?
        `).bind(ownerEmail, email).run();

        return json({ success: true, message: 'Barbeiro recrutado com sucesso!' });
    }

    // Remove Team Member (Shop Owner removes staff)
    if (url.pathname === '/api/team/remove' && request.method === 'POST') {
        const { memberEmail, ownerEmail } = await request.json();

        // 1. Verify Owner (requester)
        const owner = await DB.prepare('SELECT is_barber FROM users WHERE email = ?').bind(ownerEmail).first();
        if (!owner || owner.is_barber !== 1) return json({ error: 'Unauthorized' }, 401);

        // 2. Execute Removal (Set owner_id to NULL and business_type back to 'individual')
        await DB.prepare(`
            UPDATE users 
            SET owner_id = NULL, business_type = 'individual' 
            WHERE email = ? AND owner_id = ?
        `).bind(memberEmail, ownerEmail).run();

        return json({ success: true, message: 'Barbeiro removido da equipe.' });
    }

    return null;
}
