import { json } from '../utils/index.js';

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

    // Cancel Appointment
    if (url.pathname === '/api/appointments/cancel' && request.method === 'POST') {
        const { appointmentId, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        // Security check: Only client or assigned barber can cancel
        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(appointmentId).run();
        return json({ success: true });
    }

    // Delete Appointment (Historical Record)
    if (url.pathname === '/api/appointments/delete' && request.method === 'POST') {
        const { appointmentId, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        // Security check: Only client or assigned barber can delete
        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('DELETE FROM appointments WHERE id = ?').bind(appointmentId).run();
        return json({ success: true });
    }

    // Update Appointment Status
    if (url.pathname === '/api/appointments/update-status' && request.method === 'POST') {
        const { appointmentId, status, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        // Security check: Only admin or assigned barber can change status
        const user = await DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(userEmail).first();
        if (!user || (user.is_admin !== 1 && appt.barber_email !== userEmail)) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind(status, appointmentId).run();

        // Notify via WhatsApp if confirmed
        if (status === 'confirmed' || status === 'cancelled') {
            const { notifyWhatsApp } = await import('../utils/index.js');
            await notifyWhatsApp(env, DB, appointmentId, status);
        }

        return json({ success: true });
    }

    // Update Appointment (Reschedule)
    if (url.pathname === '/api/appointments/update' && request.method === 'POST') {
        const { appointmentId, userEmail, barberEmail, serviceId, date, time } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        // Security check
        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        // Conflict check (exclude current appointment)
        const conflict = await DB.prepare('SELECT id FROM appointments WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? AND id != ? AND status != "cancelled"').bind(barberEmail, date, time, appointmentId).first();
        if (conflict) {
            return json({ error: 'Horário já ocupado com este barbeiro' }, 409);
        }

        await DB.prepare(`
            UPDATE appointments 
            SET barber_email = ?, service_id = ?, appointment_date = ?, appointment_time = ?, status = 'pending'
            WHERE id = ?
        `).bind(barberEmail, serviceId, date, time, appointmentId).run();

        return json({ success: true });
    }

    return null;
}
