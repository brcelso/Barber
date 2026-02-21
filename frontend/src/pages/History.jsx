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

                            const isPast = dateObj < new Date() && !format(new Date(), 'yyyy-MM-dd').includes(appt.appointment_date);

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
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                {format(dateObj, "dd 'de' MMMM", { locale: ptBR })} às {appt.appointment_time}
                                            </p>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>Profissional: {appt.barber_name}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>R$ {appt.price}</div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {appt.status === 'pending' && !isPast && (
                                                    <>
                                                        <button className="btn-icon" onClick={() => handleEditStart(appt)} title="Reagendar"><Calendar size={18} /></button>
                                                        <button className="btn-icon" style={{ color: '#e74c3c' }} onClick={() => handleCancel(appt.id)} title="Cancelar"><X size={18} /></button>
                                                    </>
                                                )}
                                                {appt.status === 'pending' && appt.payment_status !== 'paid' && (
                                                    <button className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.7rem' }} onClick={() => handlePayment(appt)}>Pagar Agora</button>
                                                )}
                                                {(appt.status === 'cancelled' || isPast) && (
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
