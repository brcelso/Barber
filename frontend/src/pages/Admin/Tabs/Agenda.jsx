import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Lock, Play, ChevronLeft, ChevronRight } from 'lucide-react';

export const AgendaTab = ({
    selectedDate,
    setSelectedDate,
    timeSlots,
    busySlots,
    adminAppointments,
    handleToggleBlock,
    handleToggleFullDay,
    setSelectedActionAppt
}) => {
    const handleNextDay = () => setSelectedDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + 1);
        return next;
    });
    const handlePrevDay = () => setSelectedDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() - 1);
        return next;
    });

    // Verifica se o dia está totalmente bloqueado para mudar o texto do botão principal
    const isFullDayBlocked = busySlots.length >= timeSlots.length;

    return (
        <div className="fade-in">
            {/* Header com Navegação de Data */}
            <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button className="btn-icon" onClick={handlePrevDay}><ChevronLeft size={20} /></button>
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ margin: 0, textTransform: 'capitalize' }}>
                                {selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : 'Data selecionada'}
                            </h3>
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
                        className={`btn-primary ${isFullDayBlocked ? 'danger' : ''}`}
                        style={{
                            fontSize: '0.8rem',
                            padding: '8px 15px',
                            background: isFullDayBlocked ? '#e74c3c' : 'var(--primary)',
                            color: isFullDayBlocked ? 'white' : 'black'
                        }}
                        onClick={handleToggleFullDay}
                    >
                        <Lock size={16} /> {isFullDayBlocked ? 'Liberar Dia Inteiro' : 'Bloquear Dia Inteiro'}
                    </button>
                </div>

                {/* Grid de Horários - ATUALIZADO PARA SINCRONIA COM WHATSAPP/D1 */}
                <div className="service-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                    gap: '8px'
                }}>
                    {timeSlots.map(time => {
                        // Busca o dado de ocupação (suporta string ou objeto vindo do D1)
                        const slotData = busySlots && busySlots.find(s => {
                            const slotTime = typeof s === 'string' ? s : (s.time || s.appointment_time);
                            return slotTime?.trim() === time.trim();
                        });

                        const isBusy = !!slotData;
                        const isBlockedBySystem = slotData?.status === 'blocked';

                        return (
                            <button
                                key={time}
                                onClick={() => handleToggleBlock(time)}
                                style={{
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: isBlockedBySystem ? '2px solid #ff4d4d' : isBusy ? '1px solid #e74c3c' : '1px solid var(--border)',
                                    background: isBlockedBySystem ? 'rgba(255, 77, 77, 0.2)' : isBusy ? 'rgba(231, 76, 60, 0.3)' : 'rgba(46, 204, 113, 0.05)',
                                    color: isBlockedBySystem ? '#ff4d4d' : isBusy ? '#ff4d4d' : '#2ecc71',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px'
                                }}
                            >
                                {(isBlockedBySystem || isBusy) && <Lock size={10} />}
                                {time}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Lista de Agendamentos */}
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
                            style={{ cursor: 'pointer', padding: '1rem' }}
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
                                        fontWeight: 800
                                    }}>
                                        {appt.appointment_time}
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0 }}>{appt.client_name || appt.user_name}</h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>{appt.service_name}</p>
                                    </div>
                                </div>
                                <Play size={16} color="var(--primary)" />
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