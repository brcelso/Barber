import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Trash2, Calendar } from 'lucide-react';

export const HistoryPage = ({
    appointments,
    handleCancel,
    handleDelete,
    handlePayment,
    handleEditStart
}) => {
    return (
        <main className="fade-in">
            <h2 className="section-title">Meu Histórico</h2>
            {appointments.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                    <Calendar size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Você ainda não possui agendamentos.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {appointments
                        .filter(appt => appt && appt.status !== 'blocked')
                        .map(appt => {
                            if (!appt.appointment_date) return null;
                            const dateObj = parseISO(appt.appointment_date);
                            if (isNaN(dateObj.getTime())) return null;

                            const now = new Date();
                            const isPast = dateObj < now && !format(now, 'yyyy-MM-dd').includes(appt.appointment_date);
                            // Se for hoje, mas o horário já passou (ex: 10:00 vs agora 11:00)
                            const isPastTime = format(now, 'yyyy-MM-dd') === appt.appointment_date && appt.appointment_time < format(now, 'HH:mm');
                            const canDelete = appt.status === 'cancelled' || isPast || isPastTime;
                            const canCancel = appt.status !== 'cancelled' && !isPast && !isPastTime;

                            return (
                                <div key={appt.id} className={`glass-card appointment-card ${appt.status}`}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                                                <span className={`status-badge ${appt.status}`}>
                                                    {appt.status === 'confirmed' ? 'Confirmado' : appt.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                                                </span>
                                                {appt.payment_status === 'paid' && (
                                                    <span className="status-badge confirmed" style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
                                                        Pago
                                                    </span>
                                                )}
                                            </div>
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.2rem' }}>{appt.service_name}</h3>
                                            <p style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.2rem' }}>Cliente: {appt.client_name}</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                {format(dateObj, "dd 'de' MMMM", { locale: ptBR })} às {appt.appointment_time}
                                            </p>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>Profissional: {appt.professional_name || appt.barber_name}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>R$ {appt.price}</div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {canCancel && (
                                                    <>
                                                        <button className="btn-icon" onClick={() => handleEditStart(appt)} title="Reagendar"><Calendar size={18} /></button>
                                                        <button className="btn-icon" style={{ color: '#e74c3c' }} onClick={() => handleCancel(appt.id)} title="Cancelar"><X size={18} /></button>
                                                    </>
                                                )}
                                                {appt.status !== 'cancelled' && appt.payment_status !== 'paid' && !isPast && !isPastTime && (
                                                    <button className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.7rem' }} onClick={() => handlePayment(appt)}>Pagar Agora</button>
                                                )}
                                                {canDelete && (
                                                    <button className="btn-icon" style={{ color: '#ff4d4d', opacity: 1 }} onClick={() => handleDelete(appt.id)} title="Excluir do Histórico"><Trash2 size={18} /></button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}
        </main>
    );
};
