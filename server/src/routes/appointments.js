import { json } from '../utils.js';

export async function handleAppointmentRoutes(url, request, env) {
    const { DB } = env;

    // Get Appointments for a user (unified history: personal + professional)
    if (url.pathname === '/api/appointments' && request.method === 'GET') {
        const email = request.headers.get('X-User-Email');
        if (!email) return json({ error: 'Unauthorized' }, 401);

        const appointments = await DB.prepare(`
            SELECT 
                a.*, 
                s.name as service_name, 
                s.price, 
                u.name as client_name, 
                u.picture as client_picture,
                b.name as barber_name,
                b.picture as barber_picture
            FROM appointments a
            LEFT JOIN services s ON a.service_id = s.id
            LEFT JOIN users u ON a.user_email = u.email
            LEFT JOIN users b ON a.barber_email = b.email
            WHERE (a.user_email = ? OR a.barber_email = ?) AND a.status != 'blocked'
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `).bind(email, email).all();

        return json(appointments.results);
    }

    // Book an Appointment
    if (url.pathname === '/api/appointments/book' && request.method === 'POST') {
        const { email, barberEmail, serviceId, date, time, skipPayment } = await request.json();
        if (!email || !barberEmail || !serviceId || !date || !time) {
            return json({ error: 'Missing fields' }, 400);
        }

        const id = crypto.randomUUID();
        const service = await DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

        if (!service) return json({ error: 'Service not found' }, 404);

        const conflict = await DB.prepare('SELECT id FROM appointments WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? AND status != "cancelled"').bind(barberEmail, date, time).first();
        if (conflict) {
            return json({ error: 'Horário já ocupado com este barbeiro' }, 409);
        }

        await DB.prepare(`
            INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `).bind(id, email, barberEmail, serviceId, date, time).run();

        return json({ appointmentId: id, status: 'pending' });
    }

    // Public: Get Busy Slots for a Date
    if (url.pathname === '/api/appointments/busy-slots' && request.method === 'GET') {
        const date = url.searchParams.get('date');
        const barberEmail = url.searchParams.get('barber_email');
        if (!date) return json({ error: 'Missing date' }, 400);

        let query = 'SELECT appointment_time as time, status FROM appointments WHERE appointment_date = ? AND status != "cancelled"';
        let params = [date];

        if (barberEmail) {
            query += ' AND barber_email = ?';
            params.push(barberEmail);
        }

        const busy = await DB.prepare(query).bind(...params).all();
        return json(busy.results);
    }

    return null;
}
