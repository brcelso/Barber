import React, { useState, useEffect } from 'react';
import { format, addDays, startOfToday, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Services
import { api } from './services/api';

// Components
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { ActionSheet } from './components/ActionSheet';
import { PaymentModal } from './components/PaymentModal';
import { PlanSelectionModal } from './components/PlanSelectionModal';
import { PhoneSetupModal } from './components/PhoneSetupModal';

// Pages
import { BookingPage } from './pages/Booking';
import { HistoryPage } from './pages/History';
import { AdminPanel } from './pages/Admin/AdminPanel';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('barber_user') || 'null'));
  const [view, setView] = useState('book'); // book, history, admin
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedTime, setSelectedTime] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [busySlots, setBusySlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [subscription, setSubscription] = useState({ daysLeft: 0, isActive: false, expires: null });
  const [showPhoneSetup, setShowPhoneSetup] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [paymentSelectionAppt, setPaymentSelectionAppt] = useState(null);
  const [selectedActionAppt, setSelectedActionAppt] = useState(null);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', qr: null });
  const [masterStats, setMasterStats] = useState(null);
  const [masterUsers, setMasterUsers] = useState([]);
  const [botSettings, setBotSettings] = useState({
    bot_name: 'Leo',
    business_type: 'barbearia',
    bot_tone: 'prestativo e amigável',
    welcome_message: '',
    msg_welcome: '',
    msg_choose_barber: '',
    msg_choose_service: '',
    msg_confirm_booking: ''
  });
  const [adminTab, setAdminTab] = useState('agenda'); // agenda, team, bot, master
  const [masterFilter, setMasterFilter] = useState('all');
  const [sheetView, setSheetView] = useState('main');

  const timeSlots = [
    "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
  ];

  // Initialize data
  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (user) {
      if (user.isAdmin || user.isBarber) {
        setIsAdminMode(true);
        setView('admin');
        fetchSubscription();
      } else {
        setView('book');
      }
      fetchAppointments();
      if (user.isAdmin || user.isBarber) fetchAdminAppointments();
    }
  }, [user]);

  useEffect(() => {
    if (user?.isAdmin || user?.isBarber) {
      const interval = setInterval(() => {
        fetchWaStatus();
        if (user?.isMaster) fetchMasterData();
      }, 10000);
      fetchWaStatus();
      if (user?.isMaster) fetchMasterData();
      fetchBotSettings();
      return () => clearInterval(interval);
    }
  }, [user, view]);

  useEffect(() => {
    if (selectedBarber || user?.isBarber) {
      if (selectedBarber) fetchServices();
      fetchBusySlots(selectedDate, selectedBarber || user);
    }
  }, [selectedBarber, selectedDate, user?.email]);

  // API Handlers
  const fetchBarbers = async () => {
    try {
      const data = await api.getBarbers();
      setBarbers(data || []);
      if (data?.length === 1) setSelectedBarber(data[0]);
    } catch (e) { console.error('Error fetching barbers', e); }
  };

  const fetchServices = async (ts = '') => {
    try {
      const data = await api.getServices(selectedBarber?.email, ts);
      setServices(data || []);
    } catch (e) {
      console.error('Error fetching services', e);
      setServices([
        { id: 'corte-simples', name: 'Corte de Cabelo', price: 40, duration_minutes: 30 },
        { id: 'barba', name: 'Barba Completa', price: 30, duration_minutes: 20 },
        { id: 'combo', name: 'Cabelo e Barba', price: 60, duration_minutes: 50 }
      ]);
    }
  };

  const fetchAppointments = async (ts = '') => {
    if (!user) return;
    try {
      const data = await api.getAppointments(user.email, ts);
      setAppointments(data || []);
    } catch (e) { console.error('Error fetching appointments', e); }
  };

  const fetchAdminAppointments = async (ts = '') => {
    if (!user?.isAdmin && !user?.isBarber) return;
    try {
      const data = await api.getAdminAppointments(user.email, ts);
      setAdminAppointments(data || []);
    } catch (e) { console.error('Error fetching admin appts', e); }
  };

  const fetchBusySlots = async (date, barber, ts = '') => {
    const effectiveBarber = barber || (user?.isBarber ? user : null);
    if (!effectiveBarber) return;
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const data = await api.getBusySlots(dateStr, effectiveBarber.email, ts);
      setBusySlots(data || []);
    } catch (e) { console.error('Error busy slots', e); }
  };

  const fetchSubscription = async (ts = '') => {
    if (!user?.isAdmin && !user?.isBarber) return;
    try {
      const data = await api.getSubscription(user.email, ts);
      setSubscription(data);
      if ((data.isMaster && !user.isMaster) || (data.isBarber && !user.isBarber)) {
        const updatedUser = { ...user, isMaster: data.isMaster || user.isMaster, isBarber: data.isBarber || user.isBarber };
        setUser(updatedUser);
        localStorage.setItem('barber_user', JSON.stringify(updatedUser));
      }
    } catch (e) { console.error('Subscription fail', e); }
  };

  const fetchWaStatus = async () => {
    try {
      if (!user?.email) return;
      const data = await api.getWaStatus(user.email);
      setWaStatus(data);
    } catch (e) { console.error('WA status error', e); }
  };

  const fetchBotSettings = async () => {
    try {
      if (!user?.email) return;
      const data = await api.getBotSettings(user.email);
      if (data) {
        setBotSettings({
          ...data,
          welcome_message: data.welcome_message || `✅ *Agendamento Confirmado!* \n\nOlá {{user_name}}, seu horário para *{{service_name}}* com {{barber_name}} no dia *{{date}}* às *{{time}}* foi confirmado. \n\nTe esperamos lá! ✂️`,
          msg_welcome: data.msg_welcome || `✨ *Bem-vindo(a)!* \n\nVocê está sendo atendido(a) por *{{establishment_name}}*. 📍\n\nO que deseja fazer?\n\n`,
          msg_choose_barber: data.msg_choose_barber || `✨ *Bem-vindo(a) à {{establishment_name}}!* \n\nPara começar, selecione o *Profissional* desejado:\n\n`,
          msg_choose_service: data.msg_choose_service || `📅 *Escolha o serviço:* \n`,
          msg_confirm_booking: data.msg_confirm_booking || `📝 *Tudo pronto! Confirme:* \n\n👤 *Nome:* {{user_name}}\n📧 *E-mail:* {{user_email}}\n💇‍♂️ *Serviço:* {{service_name}}\n📅 *Data:* {{date}}\n⏰ *Hora:* {{time}}\n💈 *Barbeiro:* {{barber_name}}\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar\n*3* - ✏️ Corrigir dados`
        });
      }
    } catch (e) { console.error('Bot settings error', e); }
  };

  const fetchMasterData = async () => {
    if (!user?.isMaster) return;
    try {
      const stats = await api.getMasterStats(user.email);
      const users = await api.getMasterUsers(user.email);
      setMasterStats(stats);
      setMasterUsers(users || []);
    } catch (e) { console.error('Master data error', e); }
  };

  // UI Handlers
  const handleLogin = async (data, isGoogle) => {
    setLoading(true);
    try {
      const res = await api.login(data);
      if (res.user) {
        const finalUser = {
          name: res.user.name,
          email: res.user.email,
          picture: res.user.picture,
          isAdmin: res.user.isAdmin,
          isMaster: res.user.isMaster,
          isBarber: res.user.isBarber,
          phone: res.user.phone
        };
        setUser(finalUser);
        localStorage.setItem('barber_user', JSON.stringify(finalUser));
        if (!res.user.phone) setShowPhoneSetup(true);
      }
    } catch (e) { alert('Erro ao fazer login'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('barber_user');
  };

  const handleRefresh = async () => {
    setLoading(true);
    const ts = Date.now();
    await Promise.all([
      fetchSubscription(ts),
      fetchAppointments(ts),
      fetchAdminAppointments(ts),
      fetchWaStatus(),
      fetchBarbers()
    ]);
    setLoading(false);
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedTime || !user) return;
    setLoading(true);
    try {
      const bookingData = {
        barberEmail: selectedBarber.email,
        serviceId: selectedService.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        skipPayment: true
      };
      const res = editingAppointment
        ? await api.updateAppointment(user.email, { ...bookingData, appointmentId: editingAppointment.id })
        : await api.book(user.email, bookingData);

      if (res.error) throw new Error(res.error);

      alert(editingAppointment ? 'Agendamento atualizado!' : 'Agendamento realizado!');
      setEditingAppointment(null);
      fetchAppointments();
      setView('history');
    } catch (e) { alert('Erro: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Deseja cancelar?')) return;
    setLoading(true);
    try {
      await api.cancelAppointment(user.email, id);
      handleRefresh();
    } catch (e) { alert('Erro ao cancelar'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deseja excluir?')) return;
    setLoading(true);
    try {
      await api.deleteAppointment(user.email, id);
      handleRefresh();
    } catch (e) { alert('Erro ao excluir'); }
    finally { setLoading(false); }
  };

  const handleProcessPayment = async (type) => {
    setLoading(true);
    try {
      let res;
      if (type === 'real') {
        res = await api.createPayment(user.email, paymentSelectionAppt.id);
        if (res.paymentUrl) window.location.href = res.paymentUrl;
      } else {
        res = await api.mockPayment(user.email, paymentSelectionAppt.id, type === 'local' ? 'Local' : 'Simulado');
        if (res.success) {
          alert('Pagamento confirmado!');
          handleRefresh();
        }
      }
    } catch (e) { alert('Erro no pagamento'); }
    finally {
      setLoading(false);
      setPaymentSelectionAppt(null);
    }
  };

  const handleUpdateStatus = async (status) => {
    setLoading(true);
    try {
      await api.updateStatus(user.email, selectedActionAppt.id, status);
      handleRefresh();
      setSelectedActionAppt(null);
    } catch (e) { alert('Erro ao atualizar status'); }
    finally { setLoading(false); }
  };

  const handleUpdateBotSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.updateBotSettings(user.email, botSettings);
      alert('Configurações salvas!');
    } catch (e) { alert('Erro ao salvar'); }
    finally { setLoading(false); }
  };

  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    const data = { name: e.target.memberName.value, email: e.target.memberEmail.value };
    setLoading(true);
    try {
      await api.addTeamMember(user.email, data);
      alert('Membro adicionado!');
      e.target.reset();
      fetchBarbers();
    } catch (e) { alert('Erro ao adicionar'); }
    finally { setLoading(false); }
  };

  const handleToggleBlock = async (time) => {
    setLoading(true);
    try {
      await api.toggleBlock(user.email, { date: format(selectedDate, 'yyyy-MM-dd'), time });
      fetchBusySlots(selectedDate, user?.isBarber ? user : null);
      fetchAdminAppointments();
    } catch (e) { alert('Erro ao bloquear'); }
    finally { setLoading(false); }
  };

  const handleToggleFullDay = async () => {
    const isBlocking = busySlots.length < timeSlots.length;
    const action = isBlocking ? 'block' : 'unblock';
    setLoading(true);
    try {
      await api.bulkToggleBlock(user.email, {
        date: format(selectedDate, 'yyyy-MM-dd'),
        action,
        times: timeSlots,
        scope: user.ownerId ? 'individual' : 'shop'
      });
      handleRefresh();
      alert(isBlocking ? 'Dia bloqueado!' : 'Dia liberado!');
    } catch (e) { alert('Erro ao alterar dia'); }
    finally { setLoading(false); }
  };

  const handleWhatsAppNotify = (appt) => {
    const cleaned = appt.user_phone?.replace(/\D/g, "") || "";
    const phone = cleaned.length <= 11 ? `55${cleaned}` : cleaned;
    const text = `Olá ${appt.user_name}! Confirmamos seu agendamento para ${appt.appointment_time}.`;
    window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePromoteToBarber = async () => {
    if (!confirm('Deseja se tornar um Barbeiro parceiro?')) return;
    setLoading(true);
    try {
      const res = await api.promoteToBarber(user.email);
      if (res.success) {
        setUser({ ...user, isAdmin: true, isBarber: true });
        localStorage.setItem('barber_user', JSON.stringify({ ...user, isAdmin: true, isBarber: true }));
        window.location.reload();
      }
    } catch (e) { alert('Erro ao promover'); }
    finally { setLoading(false); }
  };

  if (!user) {
    return <LoginScreen onManualLogin={handleLogin} loading={loading} VITE_GOOGLE_CLIENT_ID={import.meta.env.VITE_GOOGLE_CLIENT_ID} />;
  }

  return (
    <div className="container">
      <Header
        user={user}
        view={view}
        setView={setView}
        loading={loading}
        handleRefresh={handleRefresh}
        handleLogout={handleLogout}
        subscription={subscription}
        setShowPlanSelection={setShowPlanSelection}
        handleMockPay={async () => {
          const res = await api.mockPayment(user.email, null, 'Test3d');
          if (res.success) { alert('Teste ativado!'); fetchSubscription(); }
        }}
        handleUpdateProfile={(phone) => api.updateProfile(user.email, phone).then(u => { setUser({ ...user, phone }); localStorage.setItem('barber_user', JSON.stringify({ ...user, phone })); })}
        handlePromoteToBarber={handlePromoteToBarber}
        isAdminMode={isAdminMode}
      />

      {view === 'book' && (
        <BookingPage
          user={user} barbers={barbers} selectedBarber={selectedBarber} setSelectedBarber={setSelectedBarber}
          services={services} selectedService={selectedService} setSelectedService={setSelectedService}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate} timeSlots={timeSlots}
          selectedTime={selectedTime} setSelectedTime={setSelectedTime} busySlots={busySlots}
          handleBooking={handleBooking} loading={loading} editingAppointment={editingAppointment}
          setEditingAppointment={setEditingAppointment}
        />
      )}

      {view === 'history' && (
        <HistoryPage
          appointments={appointments} handleCancel={handleCancel} handleDelete={handleDelete}
          handlePayment={(a) => setPaymentSelectionAppt(a)} handleEditStart={(a) => { setEditingAppointment(a); setView('book'); }}
          loading={loading}
        />
      )}

      {view === 'admin' && (user.isAdmin || user.isBarber) && (
        <AdminPanel
          user={user} adminTab={adminTab} setAdminTab={setAdminTab}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate} timeSlots={timeSlots}
          busySlots={busySlots} adminAppointments={adminAppointments}
          handleToggleBlock={handleToggleBlock} handleToggleFullDay={handleToggleFullDay}
          setSelectedActionAppt={setSelectedActionAppt} handleRefresh={handleRefresh}
          barbers={barbers} handleAddTeamMember={handleAddTeamMember}
          handleRecruitBarber={async () => {
            const email = document.getElementById('recruitSelect').value;
            if (!email) return;
            await api.recruitBarber(user.email, email);
            fetchBarbers();
          }}
          handleRemoveTeamMember={async (email) => {
            if (confirm('Remover membro?')) {
              await api.removeTeamMember(user.email, email);
              fetchBarbers();
            }
          }}
          botSettings={botSettings} setBotSettings={setBotSettings} handleUpdateBotSettings={handleUpdateBotSettings}
          waStatus={waStatus} masterStats={masterStats} masterUsers={masterUsers}
          handleMasterUpdate={(t, u) => api.masterUpdateUser(user.email, t, u).then(() => fetchMasterData())}
          handleMasterDelete={(t) => confirm('Deletar?') && api.masterDeleteUser(user.email, t).then(() => fetchMasterData())}
          handleMasterRestartBot={(t) => api.startBot(user.email, t)}
          handleMasterStopBot={(t) => api.stopBot(user.email, t)}
          masterFilter={masterFilter} setMasterFilter={setMasterFilter} loading={loading}
        />
      )}

      <ActionSheet
        selectedActionAppt={selectedActionAppt} setSelectedActionAppt={setSelectedActionAppt}
        sheetView={sheetView} setSheetView={setSheetView} user={user}
        handleEditStart={(a) => { setEditingAppointment(a); setView('book'); }}
        handleWhatsAppNotify={handleWhatsAppNotify}
        updateStatus={handleUpdateStatus}
        updatePayment={async (status) => {
          await api.updatePaymentStatus(user.email, selectedActionAppt.id, { status: status === 'paid' ? 'confirmed' : 'pending' });
          handleRefresh();
          setSelectedActionAppt(null);
        }}
      />

      <PaymentModal
        appointment={paymentSelectionAppt} onClose={() => setPaymentSelectionAppt(null)}
        onProcess={handleProcessPayment} loading={loading}
      />

      <PlanSelectionModal
        show={showPlanSelection} onClose={() => setShowPlanSelection(false)}
        onSelect={(p) => api.subscriptionPayment(user.email, p).then(r => r.paymentUrl && (window.location.href = r.paymentUrl))}
        loading={loading}
      />

      <PhoneSetupModal
        show={showPhoneSetup} loading={loading}
        onSave={(phone) => api.updateProfile(user.email, phone).then(() => { setUser({ ...user, phone }); localStorage.setItem('barber_user', JSON.stringify({ ...user, phone })); setShowPhoneSetup(false); })}
      />
    </div>
  );
}

export default App;