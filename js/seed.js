// بيانات تجريبية — Demo seed data (loaded once on first run, or after "reset demo data")

const svg = (w, h, body, bg = '#f1f5f9') =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" rx="18" fill="${bg}"/>${body}</svg>`);

const boxPhoto = (brand, model, imei) => svg(480, 320, `
  <rect x="40" y="40" width="400" height="240" rx="14" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>
  <text x="240" y="100" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#0f172a">${brand} ${model}</text>
  <rect x="80" y="130" width="320" height="60" fill="#0f172a" opacity=".85"/>
  ${Array.from({ length: 40 }, (_, i) => `<rect x="${84 + i * 8}" y="134" width="${i % 3 ? 3 : 5}" height="52" fill="#fff"/>`).join('')}
  <text x="240" y="225" font-family="monospace" font-size="22" text-anchor="middle" fill="#0f172a">IMEI ${imei}</text>
  <text x="240" y="258" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#64748b">صورة توضيحية تجريبية</text>`, '#e2e8f0');

const idCard = (name) => svg(480, 300, `
  <rect x="20" y="20" width="440" height="260" rx="16" fill="#ecfeff" stroke="#0e7490" stroke-width="3"/>
  <text x="440" y="62" font-family="sans-serif" font-size="20" text-anchor="end" fill="#0e7490" font-weight="700">جمهورية مصر العربية — بطاقة تحقيق الشخصية</text>
  <rect x="40" y="90" width="120" height="150" rx="10" fill="#cbd5e1"/><circle cx="100" cy="140" r="30" fill="#94a3b8"/><rect x="60" y="180" width="80" height="50" rx="25" fill="#94a3b8"/>
  <text x="440" y="130" font-family="sans-serif" font-size="22" text-anchor="end" fill="#0f172a">${name}</text>
  <text x="440" y="170" font-family="monospace" font-size="20" text-anchor="end" fill="#334155">2•• •••• •••• ••••</text>
  <text x="440" y="240" font-family="sans-serif" font-size="14" text-anchor="end" fill="#64748b">صورة بطاقة تجريبية (ليست حقيقية)</text>`, '#fff');

const selfie = (hue) => svg(360, 360, `
  <circle cx="180" cy="150" r="70" fill="hsl(${hue},40%,70%)"/>
  <rect x="80" y="230" width="200" height="130" rx="90" fill="hsl(${hue},40%,55%)"/>
  <text x="180" y="340" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#fff">سيلفي تجريبي</text>`, `hsl(${hue},40%,90%)`);

const deviceShot = (imei) => svg(300, 520, `
  <rect x="20" y="20" width="260" height="480" rx="30" fill="#0f172a"/>
  <rect x="34" y="60" width="232" height="400" rx="8" fill="#f8fafc"/>
  <text x="150" y="120" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#0f172a">حول الهاتف</text>
  <text x="150" y="200" font-family="monospace" font-size="15" text-anchor="middle" fill="#0f172a">IMEI</text>
  <text x="150" y="225" font-family="monospace" font-size="15" text-anchor="middle" fill="#0f172a">${imei}</text>
  <text x="150" y="275" font-family="monospace" font-size="15" text-anchor="middle" fill="#0f172a">S/N R58N123ABC</text>`, '#fff');

export async function seed(db, { store, hashPassword, uid, audit }) {
  const t0 = Date.now();
  const day = 86400000;
  const mkUser = async (u, password) => {
    const salt = uid('salt');
    return store.insert('users', { ...u, salt, passwordHash: await hashPassword(password, salt) });
  };
  const F = db.files;

  const admin = await mkUser({ id: 'usr_demo_admin', role: 'admin', name: 'فريق الدعم الفني', email: 'admin@demo.eg', phone: '', createdAt: t0 - 60 * day }, 'Admin@123');
  const owner = await mkUser({ id: 'usr_demo_owner', role: 'owner', name: 'أحمد محمود', email: 'owner@demo.eg', phone: '01012345678', createdAt: t0 - 30 * day }, 'Owner@123');
  const owner2 = await mkUser({ id: 'usr_demo_owner2', role: 'owner', name: 'منى السيد', email: 'mona@demo.eg', phone: '01198765432', createdAt: t0 - 20 * day }, 'Owner@123');
  const tech = await mkUser({
    id: 'usr_demo_tech', role: 'technician', name: 'كريم حسن', email: 'tech@demo.eg', phone: '01234567890', createdAt: t0 - 25 * day,
    tech: {
      shopName: 'مركز النور لصيانة الموبايل', address: 'شارع التحرير، الدقي', governorate: 'الجيزة', deviceImei: '354678119876543',
      idPhoto: await F.put(idCard('كريم حسن علي')), selfie: await F.put(selfie(200)), selfieMethod: 'live-camera', deviceShot: await F.put(deviceShot('354678119876543')),
      status: 'approved', faceMatch: 'simulated-pending', submittedAt: t0 - 25 * day, reviewedBy: admin.id, reviewedByName: admin.name, reviewedAt: t0 - 24 * day, reviewNote: 'تمت المراجعة يدوياً',
    },
  }, 'Tech@123');
  await mkUser({
    id: 'usr_demo_tech2', role: 'technician', name: 'سامح عادل', email: 'newtech@demo.eg', phone: '01555555555', createdAt: t0 - 1 * day,
    tech: {
      shopName: 'سامح موبايل', address: 'ميدان الساعة', governorate: 'الإسكندرية', deviceImei: '864123055566777',
      idPhoto: await F.put(idCard('سامح عادل فهمي')), selfie: await F.put(selfie(30)), selfieMethod: 'live-camera', deviceShot: await F.put(deviceShot('864123055566777')),
      status: 'pending', faceMatch: 'simulated-pending', submittedAt: t0 - 1 * day,
    },
  }, 'Tech@123');

  const contact = (u, pubPhone = false) => ({
    phone: { value: u.phone, public: pubPhone }, email: { value: u.email, public: false },
    socials: [{ value: 'https://facebook.com/demo.profile', public: false }],
  });
  const reports = [
    { id: 'rep_demo_1', ownerId: owner.id, type: 'stolen', status: 'stolen', brand: 'Samsung', model: 'Galaxy S23', color: 'أسود', imei1: '356938035643809', imei2: '356938035643817', serial: 'R58N12ABCDE', governorate: 'القاهرة', place: 'مترو السادات', incidentDate: new Date(t0 - 10 * day).toISOString().slice(0, 10), description: 'سُرق من الجيب في زحام المترو.', policeNumber: '1234 لسنة 2026 إداري قصر النيل', contact: contact(owner), createdAt: t0 - 10 * day },
    { id: 'rep_demo_2', ownerId: owner.id, type: 'lost', status: 'lost', brand: 'Apple iPhone', model: '13', color: 'أزرق', imei1: '352099001761481', imei2: '', serial: 'F2LXK0ABCD12', governorate: 'الجيزة', place: 'تاكسي من المهندسين', incidentDate: new Date(t0 - 4 * day).toISOString().slice(0, 10), description: 'نسيته في تاكسي.', policeNumber: '', contact: contact(owner), createdAt: t0 - 4 * day },
    { id: 'rep_demo_3', ownerId: owner2.id, type: 'stolen', status: 'stolen', brand: 'Xiaomi', model: 'Redmi Note 12', color: 'أخضر', imei1: '868910041234577', imei2: '', serial: '', governorate: 'الإسكندرية', place: 'محطة الرمل', incidentDate: new Date(t0 - 15 * day).toISOString().slice(0, 10), description: 'خطف من اليد.', policeNumber: '987 لسنة 2026', contact: contact(owner2, true), createdAt: t0 - 15 * day },
    { id: 'rep_demo_4', ownerId: owner2.id, type: 'stolen', status: 'delivered', brand: 'Oppo', model: 'Reno 8', color: 'فضي', imei1: '353325101234569', imei2: '', serial: '', governorate: 'القاهرة', place: 'مدينة نصر', incidentDate: new Date(t0 - 40 * day).toISOString().slice(0, 10), description: '', policeNumber: '', contact: contact(owner2), createdAt: t0 - 40 * day },
  ];
  for (const r of reports) {
    r.boxPhoto = await F.put(boxPhoto(r.brand, r.model, r.imei1));
    r.invoicePhoto = null; r.policePhoto = null; r.updatedAt = r.createdAt;
    r.history = [{ status: r.type, at: r.createdAt, by: r.ownerId, byName: '', note: 'إنشاء البلاغ' }];
    if (r.status === 'delivered') r.history.push({ status: 'delivered', at: r.createdAt + 5 * day, by: r.ownerId, byName: '', note: 'أكد المالك الاستلام من مركز النور لصيانة الموبايل' });
    store.insert('reports', r);
  }

  // A demo conversation between a finder (technician) and the owner
  const conv = store.insert('conversations', { id: 'conv_demo_1', reportId: 'rep_demo_2', participants: [owner.id, tech.id], createdAt: t0 - 2 * day, updatedAt: t0 - 2 * day + 600000, lastText: '' });
  const msgs = [
    { from: tech, text: 'السلام عليكم، جالي عميل عايز يبيع iPhone 13 أزرق والـ IMEI بتاعه مطابق لبلاغك. ممكن تيجي المحل بعلبة الموبايل؟', dt: 0 },
    { from: owner, text: 'وعليكم السلام، شكراً جداً! هاجي بكرة الساعة 5 ومعايا العلبة والفاتورة.', dt: 600000 },
  ];
  msgs.forEach((m, i) => store.insert('messages', { id: 'msg_demo_' + i, conversationId: conv.id, fromId: m.from.id, fromName: m.from.name, fromRole: m.from.role, text: m.text, kind: 'text', data: null, createdAt: conv.createdAt + m.dt, readBy: [m.from.id] }));
  store.update('conversations', conv.id, { lastText: msgs[msgs.length - 1].text });

  store.insert('handovers', { id: 'hnd_demo_1', reportId: 'rep_demo_4', technicianId: tech.id, technicianName: tech.name, shopName: tech.tech.shopName, ownerId: owner2.id, checklist: { box: true, imeiMatch: true, unlocked: true }, deviceImei: '353325101234569', ownerIdPhoto: null, selfie: null, notes: 'تسليم تجريبي سابق', status: 'confirmed', createdAt: t0 - 35 * day, confirmedAt: t0 - 35 * day + 3600000 });

  audit('تهيئة البيانات التجريبية', 'تم إنشاء حسابات وبلاغات تجريبية', null);
}
