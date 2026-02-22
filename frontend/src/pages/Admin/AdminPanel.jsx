import React from 'react';
import { Calendar, Users, MessageSquare, Activity, Shield } from 'lucide-react';
import { AgendaTab } from './Tabs/Agenda';
import { TeamTab } from './Tabs/Team';
import { BotSettingsTab } from './Tabs/BotSettings';
import { MasterPanelTab } from './Tabs/MasterPanel';

export const AdminPanel = ({
    user,
    adminTab,
    setAdminTab,
    // Agenda Props
    selectedDate,
    setSelectedDate,
    timeSlots,
    busySlots,
    adminAppointments,
    handleToggleBlock,
    handleToggleFullDay,
    setSelectedActionAppt,
    handleRefresh,
    // Team Props
    professionals,
    teamMembers,
    handleAddTeamMember,
    handleRecruitBarber,
    handleRemoveTeamMember,
    handleUpdateTeamMember,
    // Bot Props
    botSettings,
    setBotSettings,
    handleUpdateBotSettings,
    waStatus,
    // Master Props
    masterStats,
    masterUsers,
    handleMasterUpdate,
    handleMasterDelete,
    handleMasterRestartBot,
    handleMasterStopBot,
    masterFilter,
    setMasterFilter,
    loading
}) => {
    return (
        <main className="fade-in">
            {/* Tab Navigation */}
            <div className="glass-card" style={{
                display: 'flex',
                gap: '5px',
                padding: '6px',
                marginBottom: '2rem',
                borderRadius: '15px',
                overflowX: 'auto',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                position: 'sticky',
                top: '70px',
                zIndex: 10
            }}>
                <button
                    onClick={() => setAdminTab('agenda')}
                    style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '10px',
                        border: 'none',
                        background: adminTab === 'agenda' ? 'var(--primary)' : 'transparent',
                        color: adminTab === 'agenda' ? 'black' : 'white',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                    }}
                >
                    <Calendar size={16} /> Agenda
                </button>
                <button
                    onClick={() => setAdminTab('team')}
                    style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '10px',
                        border: 'none',
                        background: adminTab === 'team' ? 'var(--primary)' : 'transparent',
                        color: adminTab === 'team' ? 'black' : 'white',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                    }}
                >
                    <Users size={16} /> Equipe
                </button>
                <button
                    onClick={() => setAdminTab('bot')}
                    style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '10px',
                        border: 'none',
                        background: adminTab === 'bot' ? 'var(--primary)' : 'transparent',
                        color: adminTab === 'bot' ? 'black' : 'white',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                    }}
                >
                    <MessageSquare size={16} /> WhatsApp Bot
                </button>
                {user.isMaster && (
                    <button
                        onClick={() => setAdminTab('master')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: adminTab === 'master' ? 'var(--primary)' : 'transparent',
                            color: adminTab === 'master' ? 'black' : 'white',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        <Shield size={16} /> Painel Master
                    </button>
                )}
            </div>

            {/* Tab Content */}
            {adminTab === 'agenda' && (
                <AgendaTab
                    // A KEY ABAIXO É O SEGREDO: 
                    // Ela força o componente a atualizar o texto do botão e as cores
                    key={`agenda-${selectedDate.getTime()}-${busySlots.length}`}
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    timeSlots={timeSlots}
                    busySlots={busySlots}
                    adminAppointments={adminAppointments}
                    handleToggleBlock={handleToggleBlock}
                    handleToggleFullDay={handleToggleFullDay}
                    setSelectedActionAppt={setSelectedActionAppt}
                    handleRefresh={handleRefresh}
                />
            )}

            {adminTab === 'team' && (
                <TeamTab
                    user={user}
                    professionals={professionals}
                    teamMembers={teamMembers}
                    handleAddTeamMember={handleAddTeamMember}
                    handleRecruitBarber={handleRecruitBarber}
                    handleRemoveTeamMember={handleRemoveTeamMember}
                    handleUpdateTeamMember={handleUpdateTeamMember}
                    loading={loading}
                />
            )}

            {adminTab === 'bot' && (
                <BotSettingsTab
                    botSettings={botSettings}
                    setBotSettings={setBotSettings}
                    handleUpdateBotSettings={handleUpdateBotSettings}
                    waStatus={waStatus}
                    loading={loading}
                />
            )}

            {adminTab === 'master' && user.isMaster && (
                <MasterPanelTab
                    masterStats={masterStats}
                    masterUsers={masterUsers}
                    handleMasterUpdate={handleMasterUpdate}
                    handleMasterDelete={handleMasterDelete}
                    handleMasterRestartBot={handleMasterRestartBot}
                    handleMasterStopBot={handleMasterStopBot}
                    masterFilter={masterFilter}
                    setMasterFilter={setMasterFilter}
                    loading={loading}
                />
            )}
        </main>
    );
};
