import React, { useState, useEffect } from 'react';
import { Clock, Check, Save } from 'lucide-react';
import { api } from '../../../services/api';

const DAYS = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Segunda-feira' },
    { id: 2, name: 'Terça-feira' },
    { id: 3, name: 'Quarta-feira' },
    { id: 4, name: 'Quinta-feira' },
    { id: 5, name: 'Sexta-feira' },
    { id: 6, name: 'Sábado' }
];

export const AvailabilityTab = ({ user }) => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchAvail = async () => {
            setLoading(true);
            try {
                const data = await api.getAvailability(user.email);
                // Se não houver nada, inicializa com horários padrão (seg-sex, 09-18)
                if (!data || data.length === 0) {
                    const defaults = DAYS.filter(d => d.id > 0 && d.id < 6).map(d => ({
                        day_of_week: d.id,
                        start_time: '09:00',
                        end_time: '18:00',
                        active: true
                    }));
                    setSchedules(defaults);
                } else {
                    setSchedules(data.map(d => ({ ...d, active: true })));
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchAvail();
    }, []);

    const handleToggleDay = (dayId) => {
        if (schedules.find(s => s.day_of_week === dayId)) {
            setSchedules(schedules.filter(s => s.day_of_week !== dayId));
        } else {
            setSchedules([...schedules, { day_of_week: dayId, start_time: '09:00', end_time: '18:00' }]);
        }
    };

    const handleUpdate = (dayId, field, value) => {
        setSchedules(schedules.map(s => s.day_of_week === dayId ? { ...s, [field]: value } : s));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.saveAvailability(user.email, { schedules });
            alert('Horários de funcionamento atualizados!');
        } catch (e) { alert('Erro ao salvar'); }
        finally { setLoading(false); }
    };

    return (
        <div className="fade-in">
            <h3 className="section-title">
                <Clock size={18} /> Horário de Funcionamento
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Defina os dias e horários em que seu estabelecimento está aberto. O robô usará isso para sugerir horários aos clientes.
            </p>

            <div style={{ display: 'grid', gap: '10px' }}>
                {DAYS.map(day => {
                    const sched = schedules.find(s => s.day_of_week === day.id);
                    return (
                        <div key={day.id} className="glass-card" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            padding: '15px',
                            background: sched ? 'rgba(212, 175, 55, 0.05)' : 'rgba(255,255,255,0.02)',
                            borderColor: sched ? 'var(--primary)' : 'var(--border)'
                        }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={!!sched}
                                    onChange={() => handleToggleDay(day.id)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ fontWeight: 600, color: sched ? 'white' : 'var(--text-muted)' }}>{day.name}</span>
                            </div>

                            {sched ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input
                                        type="time"
                                        value={sched.start_time}
                                        onChange={(e) => handleUpdate(day.id, 'start_time', e.target.value)}
                                        className="glass-card"
                                        style={{ padding: '5px 10px', background: 'transparent', color: 'white', border: '1px solid var(--border)' }}
                                    />
                                    <span>até</span>
                                    <input
                                        type="time"
                                        value={sched.end_time}
                                        onChange={(e) => handleUpdate(day.id, 'end_time', e.target.value)}
                                        className="glass-card"
                                        style={{ padding: '5px 10px', background: 'transparent', color: 'white', border: '1px solid var(--border)' }}
                                    />
                                </div>
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: '#e74c3c' }}>Fechado</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <button
                onClick={handleSave}
                className="btn-primary"
                style={{ marginTop: '2rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                disabled={loading}
            >
                <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
        </div>
    );
};
