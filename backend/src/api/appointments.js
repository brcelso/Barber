import { json } from '../utils/index.js';

export async function handleAppointmentRoutes(url, request, env) {
    const { DB } = env;

    // 1. LISTAR AGENDAMENTOS (Histórico e Painel Admin)
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
            WHERE (a.user_email = ? OR a.barber_email = ?)
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `).bind(email, email).all();

        return json(appointments.results);
    }

    // 2. CRIAR AGENDAMENTO (Reserva via App/Site)
    if (url.pathname === '/api/appointments/book' && request.method === 'POST') {
        const { email, barberEmail, serviceId, date, time } = await request.json();
        if (!email || !barberEmail || !serviceId || !date || !time) {
            return json({ error: 'Missing fields' }, 400);
        }

        const id = crypto.randomUUID();
        const service = await DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

        if (!service) return json({ error: 'Service not found' }, 404);

        const conflict = await DB.prepare(`
            SELECT id FROM appointments 
            WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? 
            AND status IN ('pending', 'confirmed', 'blocked')
        `).bind(barberEmail, date, time).first();

        if (conflict) {
            return json({ error: 'Horário já ocupado ou bloqueado' }, 409);
        }

        await DB.prepare(`
            INSERT INTO appointments (id, user_email, barber_email, service_id, appointment_date, appointment_time, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `).bind(id, email, barberEmail, serviceId, date, time).run();

        return json({ appointmentId: id, status: 'pending' });
    }

    // 3. HORÁRIOS OCUPADOS (Calendário do App)
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

    // 4. CANCELAR AGENDAMENTO
    if (url.pathname === '/api/appointments/cancel' && request.method === 'POST') {
        const { appointmentId, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('UPDATE appointments SET status = "cancelled" WHERE id = ?').bind(appointmentId).run();
        return json({ success: true });
    }

    // 5. DELETAR REGISTRO
    if (url.pathname === '/api/appointments/delete' && request.method === 'POST') {
        const { appointmentId, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('DELETE FROM appointments WHERE id = ?').bind(appointmentId).run();
        return json({ success: true });
    }

    // 6. ATUALIZAR STATUS
    if (url.pathname === '/api/appointments/update-status' && request.method === 'POST') {
        const { appointmentId, status, userEmail } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        const user = await DB.prepare('SELECT is_admin, is_barber FROM users WHERE email = ?').bind(userEmail).first();
        if (!user || (user.is_admin !== 1 && appt.barber_email !== userEmail)) {
            return json({ error: 'Unauthorized' }, 403);
        }

        await DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind(status, appointmentId).run();

        if (status === 'confirmed' || status === 'cancelled') {
            const { notifyWhatsApp } = await import('../utils/index.js');
            await notifyWhatsApp(env, DB, appointmentId, status);
        }

        return json({ success: true });
    }

    // 7. REAGENDAR
    if (url.pathname === '/api/appointments/update' && request.method === 'POST') {
        const { appointmentId, userEmail, barberEmail, serviceId, date, time } = await request.json();
        const appt = await DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first();
        if (!appt) return json({ error: 'Appointment not found' }, 404);

        if (appt.user_email !== userEmail && appt.barber_email !== userEmail) {
            return json({ error: 'Unauthorized' }, 403);
        }

        const conflict = await DB.prepare(`
            SELECT id FROM appointments 
            WHERE barber_email = ? AND appointment_date = ? AND appointment_time = ? 
            AND id != ? AND status IN ('pending', 'confirmed', 'blocked')
        `).bind(barberEmail, date, time, appointmentId).first();

        if (conflict) {
            return json({ error: 'Horário já ocupado ou bloqueado' }, 409);
        }

        await DB.prepare(`
            UPDATE appointments 
            SET barber_email = ?, service_id = ?, appointment_date = ?, appointment_time = ?, status = 'pending'
            WHERE id = ?
        `).bind(barberEmail, serviceId, date, time, appointmentId).run();

        return json({ success: true });
    }

    // 8. LISTAR BARBEIROS (Público)
    if (url.pathname === '/api/barbers' && request.method === 'GET') {
        const barbers = await DB.prepare('SELECT email, name, picture, shop_name FROM users WHERE is_barber = 1').all();
        return json(barbers.results);
    }

    // 9. LISTAR SERVIÇOS (Público)
    if (url.pathname === '/api/services' && request.method === 'GET') {
        const barberEmail = url.searchParams.get('barber_email');
        let query = 'SELECT * FROM services WHERE id != "block"';
        let params = [];

        if (barberEmail) {
            query += ' AND barber_email = ?';
            params.push(barberEmail);
        }

        const services = await DB.prepare(query).bind(...params).all();
        return json(services.results);
    }

    return null;
}