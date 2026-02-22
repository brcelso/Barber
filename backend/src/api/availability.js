import { json } from '../utils/index.js';

export async function handleAvailabilityRoutes(url, request, env) {
    const { DB } = env;

    // GET /api/admin/availability - List working hours
    if (url.pathname === '/api/admin/availability' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        const avail = await DB.prepare('SELECT * FROM availability WHERE barber_email = ? ORDER BY day_of_week ASC').bind(email).all();
        return json(avail.results);
    }

    // POST /api/admin/availability - Save/Update working hours
    if (url.pathname === '/api/admin/availability' && request.method === 'POST') {
        const email = request.headers.get('X-User-Email');
        const { schedules } = await request.json(); // Array de {day_of_week, start_time, end_time}

        // Limpa antigos e reinsere (mais simples para D1)
        await DB.prepare('DELETE FROM availability WHERE barber_email = ?').bind(email).run();

        const statements = schedules.map(s => {
            return DB.prepare(`
                INSERT INTO availability (day_of_week, start_time, end_time, barber_email)
                VALUES (?, ?, ?, ?)
            `).bind(s.day_of_week, s.start_time, s.end_time, email);
        });

        if (statements.length > 0) {
            await DB.batch(statements);
        }

        return json({ success: true });
    }

    return null;
}
