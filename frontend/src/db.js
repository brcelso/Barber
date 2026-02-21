import Dexie from 'dexie';

export const db = new Dexie('BarberDB');

db.version(1).stores({
    user: 'email',
    appointments: 'id, date, status',
    services: 'id'
});

export const generateUUID = () => crypto.randomUUID();
