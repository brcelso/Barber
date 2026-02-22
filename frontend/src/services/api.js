const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api';

const headers = (email) => ({
    'Content-Type': 'application/json',
    ...(email ? { 'X-User-Email': email } : {})
});

export const api = {
    // Auth
    login: async (userData) => {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(userData)
        });
        return res.json();
    },
    getMe: async (email) => {
        const res = await fetch(`${API_URL}/auth/me`, { headers: headers(email) });
        return res.json();
    },
    updateProfile: async (email, phone) => {
        const res = await fetch(`${API_URL}/user/update-profile`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email, phone })
        });
        return res.json();
    },
    promoteToBarber: async (email) => {
        const res = await fetch(`${API_URL}/user/promote`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email })
        });
        return res.json();
    },

    // Professionals & Services
    getProfessionals: async () => {
        const res = await fetch(`${API_URL}/professionals`);
        return res.json();
    },
    getServices: async (providerEmail, ts = '') => {
        const url = providerEmail ? `${API_URL}/services?barber_email=${providerEmail}&t=${ts}` : `${API_URL}/services?t=${ts}`;
        const res = await fetch(url);
        return res.json();
    },

    // Appointments
    getAppointments: async (email, ts = '') => {
        const res = await fetch(`${API_URL}/appointments?_t=${ts || Date.now()}`, {
            headers: headers(email)
        });
        return res.json();
    },
    getAdminAppointments: async (email, ts = '') => {
        const res = await fetch(`${API_URL}/admin/appointments?_t=${ts || Date.now()}`, {
            headers: headers(email)
        });
        return res.json();
    },
    getBusySlots: async (dateStr, barberEmail, ts = '') => {
        const res = await fetch(`${API_URL}/appointments/busy-slots?date=${dateStr}&barber_email=${barberEmail}&t=${ts}`);
        return res.json();
    },
    book: async (email, data) => {
        const res = await fetch(`${API_URL}/appointments/book`, {
            method: 'POST',
            headers: headers(email),
            // Mudamos userEmail para email para bater com o que o Worker espera
            body: JSON.stringify({ ...data, email: email })
        });
        return res.json();
    },
    updateAppointment: async (email, data) => {
        const res = await fetch(`${API_URL}/appointments/update`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ ...data, userEmail: email })
        });
        return res.json();
    },
    cancelAppointment: async (email, appointmentId) => {
        const res = await fetch(`${API_URL}/appointments/cancel`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ appointmentId, userEmail: email })
        });
        return res.json();
    },
    deleteAppointment: async (email, appointmentId) => {
        const res = await fetch(`${API_URL}/appointments/delete`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ appointmentId, userEmail: email })
        });
        return res.json();
    },
    updateStatus: async (email, appointmentId, status) => {
        const res = await fetch(`${API_URL}/appointments/update-status`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ appointmentId, status, userEmail: email })
        });
        return res.json();
    },

    // Admin
    getSubscription: async (email, ts = '') => {
        const res = await fetch(`${API_URL}/admin/subscription?t=${ts}`, {
            headers: headers(email)
        });
        return res.json();
    },
    bulkToggleBlock: async (email, data) => {
        const res = await fetch(`${API_URL}/admin/bulk-toggle-block`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ ...data, adminEmail: email })
        });
        return res.json();
    },
    toggleBlock: async (email, data) => {
        const res = await fetch(`${API_URL}/admin/toggle-block`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ ...data, adminEmail: email })
        });
        return res.json();
    },
    getBotSettings: async (email) => {
        const res = await fetch(`${API_URL}/admin/bot/settings`, {
            headers: headers(email)
        });
        return res.json();
    },
    updateBotSettings: async (email, settings) => {
        const res = await fetch(`${API_URL}/admin/bot/settings`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify(settings)
        });
        return res.json();
    },
    updatePaymentStatus: async (email, appointmentId, data) => {
        const res = await fetch(`${API_URL}/admin/appointments/update-payment`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ ...data, appointmentId, adminEmail: email })
        });
        return res.json();
    },

    // Master
    getMasterStats: async (email) => {
        const res = await fetch(`${API_URL}/master/stats`, { headers: headers(email) });
        return res.json();
    },
    getMasterUsers: async (email) => {
        const res = await fetch(`${API_URL}/master/users`, { headers: headers(email) });
        return res.json();
    },
    masterUpdateUser: async (email, targetEmail, updates) => {
        const res = await fetch(`${API_URL}/master/user/update`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ targetEmail, ...updates })
        });
        return res.json();
    },
    masterDeleteUser: async (email, targetEmail) => {
        const res = await fetch(`${API_URL}/master/user/delete`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ targetEmail })
        });
        return res.json();
    },

    // WhatsApp
    getWaStatus: async (email) => {
        const res = await fetch(`${API_URL}/whatsapp/status`, {
            headers: headers(email)
        });
        return res.json();
    },
    startBot: async (email, targetEmail) => {
        const res = await fetch(`${API_URL}/admin/bot/start`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email: targetEmail })
        });
        return res.json();
    },
    stopBot: async (email, targetEmail) => {
        const res = await fetch(`${API_URL}/admin/bot/stop`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email: targetEmail })
        });
        return res.json();
    },

    // Payments
    createPayment: async (email, appointmentId) => {
        const res = await fetch(`${API_URL}/payments/create`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ appointmentId, email })
        });
        return res.json();
    },
    mockPayment: async (email, appointmentId, method) => {
        const res = await fetch(`${API_URL}/payments/mock`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ appointmentId, email, method })
        });
        return res.json();
    },
    subscriptionPayment: async (email, planId) => {
        const res = await fetch(`${API_URL}/admin/subscription/payment`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email, planId })
        });
        return res.json();
    },

    // Team
    addTeamMember: async (email, data) => {
        const res = await fetch(`${API_URL}/team/add`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ ...data, ownerEmail: email })
        });
        return res.json();
    },
    recruitBarber: async (email, targetEmail) => {
        const res = await fetch(`${API_URL}/team/recruit`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ email: targetEmail, ownerEmail: email })
        });
        return res.json();
    },
    removeTeamMember: async (email, memberEmail) => {
        const res = await fetch(`${API_URL}/team/remove`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ memberEmail, ownerEmail: email })
        });
        return res.json();
    },
    updateTeamMember: async (email, memberEmail, updates) => {
        const res = await fetch(`${API_URL}/team/update`, {
            method: 'POST',
            headers: headers(email),
            body: JSON.stringify({ memberEmail, ownerEmail: email, ...updates })
        });
        return res.json();
    },
    getTeamMembers: async (email) => {
        const res = await fetch(`${API_URL}/team/list`, {
            headers: headers(email)
        });
        return res.json();
    }
};
