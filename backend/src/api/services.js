import { json } from '../utils/index.js';

export async function handleServicesRoutes(url, request, env) {
    const { DB } = env;

    // GET /api/admin/services - List services for the admin (multi-tenant)
    if (url.pathname === '/api/admin/services' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        const services = await DB.prepare('SELECT * FROM services WHERE barber_email = ? AND id != "block"').bind(email).all();
        return json(services.results);
    }

    // POST /api/admin/services - Add or Update a service
    if (url.pathname === '/api/admin/services' && request.method === 'POST') {
        const email = request.headers.get('X-User-Email');
        const { id, name, price, duration_minutes, description } = await request.json();

        if (!name || !price) return json({ error: 'Name and price are required' }, 400);

        const serviceId = id || crypto.randomUUID();

        await DB.prepare(`
            INSERT INTO services (id, name, price, duration_minutes, description, barber_email)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            price = excluded.price,
            duration_minutes = excluded.duration_minutes,
            description = excluded.description
        `).bind(serviceId, name, price, duration_minutes || 30, description || '', email).run();

        return json({ success: true, id: serviceId });
    }

    // DELETE /api/admin/services/:id
    if (url.pathname.startsWith('/api/admin/services/delete') && request.method === 'POST') {
        const email = request.headers.get('X-User-Email');
        const { id } = await request.json();

        await DB.prepare('DELETE FROM services WHERE id = ? AND barber_email = ?').bind(id, email).run();
        return json({ success: true });
    }

    return null;
}
