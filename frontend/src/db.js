import Dexie from 'dexie';

export const db = new Dexie('UniversalSchedulerDB');

db.version(1).stores({
    user: 'email',
    appointments: 'id, date, status',
    services: 'id'
});

export const generateUUID = () => crypto.randomUUID();
