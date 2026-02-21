import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Lock, MessageSquare, Play, X, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export const AgendaTab = ({
    selectedDate,
    setSelectedDate,
    timeSlots,
    busySlots,
    adminAppointments,
    handleToggleBlock,
    handleToggleFullDay,
    setSelectedActionAppt,
    handleRefresh
}) => {
    const handleNextDay = () => setSelectedDate(prev => new Date(prev.setDate(prev.getDate() + 1)));
    const handlePrevDay = () => setSelectedDate(prev => new Date(prev.setDate(prev.getDate() - 1)));

    return (
        <div className="fade-in">
            {/* Header com Navegação de Data */}
            <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button className="btn-icon" onClick={handlePrevDay}><ChevronLeft size={20} /></button>
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</h3>
                            <button
                                onClick={() => setSelectedDate(new Date())}
                                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                Voltar para hoje
                            </button>
                        </div>
                        <button className="btn-icon" onClick={handleNextDay}><ChevronRight size={20} /></button>
                    </div>

                    <button
                        className={`btn-primary ${busySlots.length >= timeSlots.length ? 'danger' : ''}`}
                        style={{ fontSize: '0.8rem', padding: '8px 15px' }}
                        onClick={handleToggleFullDay}
                    >
                        <Lock size={16} /> {busySlots.length >= timeSlots.length ? 'Liberar Dia Inteiro' : 'Bloquear Dia Inteiro'}
                    </button>
                </div>

                {/* Grid de Horários para Bloqueio Rápido */}
                <div className="service-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                    {timeSlots.map(time => {
                        const isBlocked = busySlots.includes(time);
                        return (
                            <button
                                key={time}
                                onClick={() => handleToggleBlock(time)}
                                style={{
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: isBlocked ? 'rgba(231, 76, 60, 0.1)' : 'rgba(46, 204, 113, 0.05)',
                                    color: isBlocked ? '#e74c3c' : '#2ecc71',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                {time}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Lista de Agendamentos do Dia */}
            <h3 className="section-title" style={{ marginTop: '2rem' }}>Agendamentos do Profissional</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {adminAppointments
                    .filter(a => a.appointment_date === format(selectedDate, 'yyyy-MM-dd') && a.status !== 'blocked')
                    .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
                    .map(appt => (
                        <div
                            key={appt.id}
                            className={`glass-card appointment-card ${appt.status}`}
                            onClick={() => setSelectedActionAppt(appt)}
                            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '50%',
                                        background: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'black',
                                        fontWeight: 800,
                                        fontSize: '0.8rem'
                                    }}>
                                        {appt.appointment_time}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h4 style={{ margin: 0 }}>{appt.user_name}</h4>
                                            <span className={`status-badge ${appt.status}`} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>
                                                {appt.status}
                                            </span>
                                            {appt.payment_status === 'paid' && (
                                                <span className="status-badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(46,204,113,0.1)', color: '#2ecc71', border: '1px solid #2ecc71' }}>
                                                    PAGO
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{appt.service_name} • R$ {appt.price}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn-icon" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--primary)' }}>
                                        <Play size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                {adminAppointments.filter(a => a.appointment_date === format(selectedDate, 'yyyy-MM-dd') && a.status !== 'blocked').length === 0 && (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                        <Clock size={40} style={{ marginBottom: '1rem' }} />
                        <p>Nenhum agendamento para este dia.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
