/* MedArşiv — Supabase Auth ve yalnızca hesap sahibine açık bulut arşivi. */
(() => {
  'use strict';

  const cloud = window.supabase?.createClient('https://marbwehrtjjebnwnvxlj.supabase.co', 'sb_publishable_mjpEJfg4yMuoZelEg9UAZA_N0YvWsV3');
  const $ = (id) => document.getElementById(id);
  const create = (tag, className = '', text = '') => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const idNew = () => (window.crypto && typeof window.crypto.randomUUID === 'function')
    ? window.crypto.randomUUID()
    : `ders-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const clean = (v, max = 2048) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  function validDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12);
    return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
  }
  function dateObject(iso) {
    if (!validDate(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  function dateFormat(iso, config = { day: 'numeric', month: 'short', year: 'numeric' }) {
    const d = dateObject(iso);
    return d ? d.toLocaleDateString('tr-TR', config) : (iso || 'Tarih yok');
  }
  function readableDate(iso) {
    return dateFormat(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function safeLink(text) {
    try {
      const value = clean(text);
      if (!value) return '';
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
    } catch (_) { return ''; }
  }
  function drivePreview(raw) {
    try {
      const url = new URL(raw);
      if (!['drive.google.com', 'www.drive.google.com'].includes(url.hostname)) return '';
      const match = url.pathname.match(/^\/file\/d\/([\w-]+)/);
      const id = match ? match[1] : url.searchParams.get('id');
      if (!id || !/^[\w-]+$/.test(id)) return '';
      return `https://drive.google.com/file/d/${id}/preview`;
    } catch (_) { return ''; }
  }
  const studyLabel = (progress) => progress === 100 ? 'Tamamlandı' : progress > 0 ? 'Çalışılıyor' : 'Başlanmadı';
  function normalize(record) {
    return {
      id: clean(record.id, 150) || idNew(),
      ad: clean(record.ad, 120),
      konu: clean(record.konu, 180),
      tarih: clean(record.tarih, 10),
      saat: clean(record.saat, 5),
      kurul: clean(record.kurul, 100),
      pdf: safeLink(record.pdf),
      ses: safeLink(record.ses),
      aciklama: clean(record.aciklama, 5000),
      progress: typeof record.progress === 'number' && Number.isFinite(record.progress) ? Math.max(0, Math.min(100, Math.round(record.progress))) : 0,
      favorite: record.favorite === true,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : ''
    };
  }
  const state = {
    lessons: [], view: 'dashboard', lastView: 'dashboard', detailId: null,
    editingId: null, selectedDate: localISO(new Date()),
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    search: '', courseFilter: '', sort: 'newest', favoritesOnly: false, studyFilter: '',
    pendingImport: null, storageBroken: false,
    user: null, revision: null, saving: false, loading: false, epoch: 0
  };

  function cloudError(error) {
    if (error?.code === 'P0001') return 'Arşiv başka bir cihazda değişti. Yenile düğmesine basıp değişikliğini tekrar uygula.';
    if (['42P01','PGRST205','PGRST202','42883'].includes(error?.code)) return 'Veritabanı kurulumu tamamlanmamış. Kurulum SQL dosyasını Supabase’de çalıştır.';
    if (error?.code === '42501') return 'Bu hesabın arşive erişim izni yok.';
    return 'Bağlantı veya oturum doğrulanamadı. İnternetini kontrol edip tekrar dene.';
  }
  function lockApp(message = '') {
    state.epoch++; state.user = null; state.revision = null; state.lessons = [];
    state.saving = false; state.loading = false; state.detailId = null; state.pendingImport = null;
    stopEmbeds(); $('lesson-dialog').close(); $('import-dialog').close();
    $('detail-meta').replaceChildren(); $('detail-favorite-wrap').replaceChildren();
    $('detail-title').textContent='Ders'; $('detail-notes').textContent='';
    for(const kind of ['pdf','audio'])$(`detail-${kind}-link`).removeAttribute('href');
    renderAll(false); navigate('dashboard');
    $('app-shell').classList.add('hidden'); $('auth-screen').classList.remove('hidden');
    $('auth-message').textContent = message; $('auth-password').value = '';
  }
  async function loadArchive() {
    if (!state.user || state.saving || state.loading) return false;
    state.loading = true;
    const epoch = state.epoch;
    $('cloud-status').textContent = 'Kayıtlar yenileniyor…';
    try {
      const {data, error} = await cloud.from('medarsiv_archives').select('lessons,revision').eq('owner_id', state.user.id).single();
      if (epoch !== state.epoch) return false;
      if (error) throw error;
      if (!data || !Number.isInteger(data.revision)) throw new Error('Geçersiz arşiv yanıtı.');
      const lessons = validateImport(data.lessons);
      state.lessons = lessons; state.revision = data.revision; state.storageBroken = false;
      renderAll(); $('cloud-status').textContent = 'Bulutla eşitlendi · '+new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
      return true;
    } catch (error) {
      if (epoch === state.epoch) { $('cloud-status').textContent = cloudError(error); toast(cloudError(error), true); }
      return false;
    } finally { if (epoch === state.epoch) state.loading = false; }
  }
  async function unlockApp(user) {
    if (state.user?.id === user.id && (state.loading || state.revision !== null)) return;
    lockApp('Arşiv açılıyor…'); state.user = user;
    if (await loadArchive()) {
      $('auth-screen').classList.add('hidden'); $('app-shell').classList.remove('hidden');
      $('auth-password').value = ''; navigate('dashboard');
    } else { $('auth-message').textContent = $('cloud-status').textContent; }
  }

  function toast(message, error = false) {
    const item = create('div', `toast${error ? ' error' : ''}`, message);
    $('toast-container').appendChild(item);
    window.setTimeout(() => { item.style.opacity = '0'; window.setTimeout(() => item.remove(), 250); }, 3600);
  }
  async function persist(next, message, refreshDetail = true) {
    if (!state.user || state.revision === null || state.saving || state.loading) { toast('Kayıt işlemi hazır değil; kısa süre sonra tekrar dene.', true); return false; }
    const epoch = state.epoch;
    state.saving = true; document.body.classList.add('cloud-saving');
    $('cloud-status').textContent = 'Kaydediliyor…';
    try {
      const {data,error} = await cloud.rpc('save_medarsiv_archive', {expected_revision:state.revision, new_lessons:next});
      if (epoch !== state.epoch) return false;
      if (error) throw error;
      if (!Number.isInteger(data)) throw new Error('Kaydetme yanıtı doğrulanamadı.');
      state.lessons = next; state.revision = data;
      renderAll(refreshDetail); $('cloud-status').textContent = 'Tüm değişiklikler buluta kaydedildi.';
      if (message) toast(message); return true;
    } catch (error) {
      if (epoch === state.epoch) { $('cloud-status').textContent = cloudError(error); toast(cloudError(error), true); }
      return false;
    } finally { if (epoch === state.epoch) state.saving = false; document.body.classList.remove('cloud-saving'); }
  }
  function sorted(items, mode = 'newest') {
    const d = [...items];
    d.sort((a, b) => {
      const cmp = a.tarih.localeCompare(b.tarih) || (a.saat || '').localeCompare(b.saat || '');
      return mode === 'oldest' ? cmp : -cmp;
    });
    return d;
  }
  function groupKey(name) { return name.trim().toLocaleLowerCase('tr-TR'); }
  function uniqueSubjects() { return new Set(state.lessons.map((d) => groupKey(d.ad))).size; }
  function setText(id, text) { $(id).textContent = String(text); }
  function emptyBox(title, description, withButton = false) {
    const wrap = create('div', 'empty-state');
    wrap.append(create('div', 'empty-symbol', '▧'), create('strong', '', title), create('p', '', description));
    if (withButton) {
      const button = create('button', 'btn btn-outline', '+ İlk dersini ekle');
      button.type = 'button'; button.dataset.action = 'add'; wrap.appendChild(button);
    }
    return wrap;
  }
  function attachmentMark(record) {
    return `${record.pdf ? 'PDF' : ''}${record.pdf && record.ses ? ' · ' : ''}${record.ses ? 'Ses' : ''}` || 'Materyal yok';
  }
  function studyIndicator(record) {
    const wrap = create('span', 'study-indicator');
    wrap.append(create('span', `study-status status-${record.progress === 100 ? 'done' : record.progress > 0 ? 'active' : 'new'}`, studyLabel(record.progress)), create('span', 'study-percent', `%${record.progress}`));
    const bar = create('progress', 'study-bar'); bar.max = 100; bar.value = record.progress;
    bar.setAttribute('aria-label', `${record.ad} — ${record.konu} tamamlanma`);
    wrap.appendChild(bar); return wrap;
  }
  function favoriteButton(record) {
    const button = create('button', `favorite-button${record.favorite ? ' is-favorite' : ''}`, record.favorite ? '★' : '☆');
    button.type = 'button'; button.dataset.action = 'favorite'; button.dataset.id = record.id;
    button.setAttribute('aria-pressed', String(record.favorite));
    button.title = button.ariaLabel = `${record.ad} — ${record.konu}: ${record.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}`;
    return button;
  }
  async function updateStudy(id, patch) {
    const record = state.lessons.find((d) => d.id === id); if (!record) return;
    const openGroups = [...document.querySelectorAll('.archive-group')].filter((el) => el.open).map((el) => el.dataset.group);
    const next = state.lessons.map((d) => d.id === id ? {...d, ...patch, updatedAt: new Date().toISOString()} : d);
    const saved = await persist(next, '', false);
    document.querySelectorAll('.archive-group').forEach((el) => { if (openGroups.includes(el.dataset.group)) el.open = true; });
    if (state.view === 'detail') renderStudyDetail();
    return saved;
  }
  function lessonListButton(record) {
    const button = create('button', 'list-lesson');
    button.type = 'button'; button.dataset.action = 'view'; button.dataset.id = record.id;
    const badge = create('span', 'lesson-avatar', record.ad.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'D');
    const info = create('span', 'lesson-info');
    info.append(create('strong', '', `${record.favorite ? '★ ' : ''}${record.ad}`), create('small', '', `${record.konu}${record.kurul ? ` · ${record.kurul}` : ''}`), studyIndicator(record));
    button.append(badge, info, create('span', 'lesson-date', dateFormat(record.tarih)), create('span', 'list-chevron', '›'));
    return button;
  }

  function renderDashboard() {
    setText('stat-total', state.lessons.length);
    setText('stat-subjects', uniqueSubjects());
    setText('stat-pdfs', state.lessons.filter((d) => d.pdf).length);
    setText('stat-audios', state.lessons.filter((d) => d.ses).length);
    setText('today-label', dateFormat(localISO(new Date()), {weekday:'long', day:'numeric', month:'long'}));
    const recent = $('recent-list'); recent.replaceChildren();
    const rec = [...state.lessons].sort((a,b) => (b.updatedAt || b.createdAt || b.tarih).localeCompare(a.updatedAt || a.createdAt || a.tarih)).slice(0, 5);
    if (rec.length) rec.forEach((d) => recent.appendChild(lessonListButton(d)));
    else recent.appendChild(emptyBox('Henüz ders kaydı yok', 'Yeni ders eklediğinde burada görünecek.', true));

    const week = $('week-list'); week.replaceChildren();
    const now = new Date(); now.setHours(12,0,0,0);
    const start = new Date(now); start.setDate(now.getDate()-6);
    const items = sorted(state.lessons.filter((d) => { const dt=dateObject(d.tarih); return dt && dt >= start && dt <= now; })).slice(0,6);
    if (items.length) items.forEach((d) => week.appendChild(lessonListButton(d)));
    else week.appendChild(emptyBox('Son 7 günde ders yok', 'Takvimden önceki tarihlerdeki kayıtlarını inceleyebilirsin.'));
  }
  function renderCalendar() {
    const year=state.month.getFullYear(), month=state.month.getMonth();
    setText('calendar-month-label', state.month.toLocaleDateString('tr-TR', {month:'long',year:'numeric'}));
    const grid=$('calendar-grid'); grid.replaceChildren();
    for (const dayName of ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']) grid.appendChild(create('div','weekday',dayName));
    const blank=(new Date(year,month,1).getDay()+6)%7;
    for(let i=0;i<blank;i++)grid.appendChild(create('div','calendar-blank'));
    const total=new Date(year,month+1,0).getDate();
    const counts=new Map();
    state.lessons.forEach((d)=>counts.set(d.tarih,(counts.get(d.tarih)||0)+1));
    for(let day=1;day<=total;day++){
      const iso=`${year}-${pad(month+1)}-${pad(day)}`;
      const count=counts.get(iso)||0;
      const cell=create('button','calendar-day');cell.type='button';cell.dataset.action='date';cell.dataset.date=iso;
      cell.setAttribute('aria-label',`${dateFormat(iso)}, ${count} kayıt`);
      if(count)cell.classList.add('has-lessons');
      if(iso===state.selectedDate)cell.classList.add('selected');
      if(iso===localISO(new Date()))cell.classList.add('today');
      cell.appendChild(create('span','day-num',day));
      if(count)cell.appendChild(create('span','day-count',`${count} ders`));
      grid.appendChild(cell);
    }
    renderSelectedDay();
  }
  function renderSelectedDay(){
    setText('selected-day-title',readableDate(state.selectedDate));
    const items=sorted(state.lessons.filter((d)=>d.tarih===state.selectedDate),'oldest');
    setText('selected-day-count',`${items.length} ders kaydı`);
    const dest=$('selected-day-lessons');dest.replaceChildren();
    if(items.length)items.forEach((d)=>dest.appendChild(lessonListButton(d)));
    else dest.appendChild(emptyBox('Bu güne ders eklenmemiş','Takvimden başka bir gün seçebilir ya da yeni ders oluşturabilirsin.'));
  }
  function filteredLessons(){
    const query=groupKey(state.search);
    return sorted(state.lessons.filter((d)=>{
      if(state.courseFilter && groupKey(d.ad)!==state.courseFilter)return false;
      if(state.favoritesOnly && !d.favorite)return false;
      if(state.studyFilter && state.studyFilter !== (d.progress === 100 ? 'done' : d.progress > 0 ? 'active' : 'new'))return false;
      const text=groupKey([d.ad,d.konu,d.kurul,d.aciklama,d.tarih].join(' '));
      return !query || text.includes(query);
    }),state.sort);
  }
  function renderArchive(){
    const select=$('archive-course-filter');
    const names=new Map();
    state.lessons.forEach((d)=>{const key=groupKey(d.ad);if(!names.has(key))names.set(key,d.ad);});
    const options=Array.from(names.entries()).sort((a,b)=>a[1].localeCompare(b[1],'tr'));
    select.replaceChildren();
    const defaultOption=create('option','','Tüm dersler');defaultOption.value='';select.appendChild(defaultOption);
    options.forEach(([key,label])=>{const o=create('option','',label);o.value=key;select.appendChild(o);});
    if(!options.some(([key])=>key===state.courseFilter))state.courseFilter='';
    select.value=state.courseFilter;
    $('archive-search').value=state.search;
    $('global-search').value=state.search;
    $('archive-sort').value=state.sort;
    $('archive-favorites').checked=state.favoritesOnly;
    $('archive-study-filter').value=state.studyFilter;
    const filtered=filteredLessons();setText('archive-total-label',`${filtered.length} kayıt`);
    const wrap=$('archive-groups');wrap.replaceChildren();
    if(!filtered.length){wrap.appendChild(emptyBox(state.lessons.length?'Sonuç bulunamadı':'Arşivin henüz boş',state.lessons.length?'Farklı bir arama ya da filtre deneyebilirsin.':'Ders ekleyerek arşivini oluşturmaya başla.',!state.lessons.length));return;}
    const groups=new Map();
    filtered.forEach((d)=>{const key=groupKey(d.ad);if(!groups.has(key))groups.set(key,{label:d.ad,records:[]});groups.get(key).records.push(d);});
    Array.from(groups.values()).sort((a,b)=>a.label.localeCompare(b.label,'tr')).forEach(({label,records})=>{
      const details=create('details','archive-group');details.open=groups.size===1;details.dataset.group=groupKey(label);
      const summary=create('summary');const heading=create('span','group-heading');
      const icon=create('span','group-icon','▤');const headingText=create('span');headingText.append(create('strong','',label),create('small','',`${records.length} kayıt`));
      heading.append(icon,headingText);summary.append(heading,create('span','group-chevron','›'));details.appendChild(summary);
      const contents=create('div','group-contents');
      records.forEach((d)=>{
        const row=create('div','archive-row');const texts=create('div','archive-row-text');
        texts.append(create('strong','',d.konu),create('small','',`${dateFormat(d.tarih)}${d.saat?' · '+d.saat:''}${d.kurul?' · '+d.kurul:''}`));
        texts.appendChild(studyIndicator(d));
        const right=create('div','archive-row-right');
        right.appendChild(favoriteButton(d));
        if(d.pdf)right.appendChild(create('span','mini-tag','PDF'));
        if(d.ses)right.appendChild(create('span','mini-tag','SES'));
        const button=create('button','btn btn-outline btn-small','Dersi aç ↗');button.type='button';button.dataset.action='view';button.dataset.id=d.id;
        right.appendChild(button);row.append(texts,right);contents.appendChild(row);
      });
      details.appendChild(contents);wrap.appendChild(details);
    });
  }
  function renderManage(){
    setText('manage-count',`${state.lessons.length} kayıt`);
    const body=$('manage-table-body');body.replaceChildren();
    const empty=$('manage-empty');empty.replaceChildren();
    if(!state.lessons.length){empty.appendChild(emptyBox('Kayıt bulunmuyor','İlk dersini oluşturarak MedArşiv’i kullanmaya başla.',true));return;}
    sorted(state.lessons).forEach((d)=>{
      const row=create('tr');const lesson=create('td');lesson.append(create('div','table-title',d.ad),create('div','table-sub',d.konu));
      lesson.appendChild(studyIndicator(d));
      const date=create('td','',dateFormat(d.tarih));const files=create('td');const pills=create('div','file-pills');
      if(d.pdf)pills.appendChild(create('span','file-pill','PDF'));if(d.ses)pills.appendChild(create('span','file-pill','Ses'));
      if(!d.pdf&&!d.ses)pills.appendChild(create('span','table-sub','—'));files.appendChild(pills);
      const actions=create('td','align-right');const buttons=create('div','action-buttons');
      buttons.appendChild(favoriteButton(d));
      for(const [action,label,extra] of [['view','Aç',''],['edit','Düzenle',''],['delete','Sil','danger']]){
        const b=create('button',`tiny-btn ${extra}`,label);b.type='button';b.dataset.action=action;b.dataset.id=d.id;buttons.appendChild(b);
      }
      actions.appendChild(buttons);row.append(lesson,date,files,actions);body.appendChild(row);
    });
  }
  function showFile(kind, raw) {
    const wrap=$(`detail-${kind}-wrap`), empty=$(`detail-${kind}-empty`), frame=$(`detail-${kind}-frame`), link=$(`detail-${kind}-link`);
    const url=safeLink(raw);const embed=url?drivePreview(url):'';
    frame.removeAttribute('src');
    link.classList.toggle('hidden',!url);
    link.removeAttribute('href');if(url)link.href=url;
    wrap.classList.toggle('hidden',!embed);
    empty.classList.toggle('hidden',!!embed);
    const hint=$(`detail-${kind}-hint`);hint.classList.toggle('hidden',!url);
    if(embed){frame.src=embed;}
    else if(url){
      empty.querySelector('strong').textContent='Önizleme kullanılamıyor';
      empty.querySelector('p').textContent='Dosyayı üstteki veya alttaki Drive bağlantısından açabilirsin.';
    } else {
      empty.querySelector('strong').textContent=kind==='pdf'?'PDF eklenmemiş':'Ses kaydı eklenmemiş';
      empty.querySelector('p').textContent='Bu derse ait bir dosya bağlantısı bulunmuyor.';
    }
  }
  function stopEmbeds(){
    $('detail-pdf-frame').removeAttribute('src');
    $('detail-audio-frame').removeAttribute('src');
  }
  function renderStudyDetail(){
    const d=state.lessons.find((x)=>x.id===state.detailId);if(!d)return;
    $('detail-study-status').value=d.progress===100?'done':d.progress>0?'active':'new';
    $('detail-progress').value=d.progress;
    setText('detail-progress-value',`%${d.progress}`);
    $('detail-progress-bar').value=d.progress;
    $('detail-favorite-wrap').replaceChildren(favoriteButton(d));
  }
  function renderDetail(){
    const d=state.lessons.find((x)=>x.id===state.detailId);
    if(!d){navigate(state.lastView==='detail'?'archive':state.lastView);return;}
    setText('detail-title',d.ad);setText('detail-category',d.kurul||'DERS DETAYI');
    renderStudyDetail();
    const meta=$('detail-meta');meta.replaceChildren();
    meta.appendChild(create('span','meta-pill',`📅 ${readableDate(d.tarih)}`));
    if(d.saat)meta.appendChild(create('span','meta-pill',`◷ ${d.saat}`));
    meta.appendChild(create('span','meta-pill',d.konu));
    showFile('pdf',d.pdf);showFile('audio',d.ses);
    $('detail-notes-wrap').classList.toggle('hidden',!d.aciklama);
    setText('detail-notes',d.aciklama);
  }
  function renderAll(refreshDetail = true){renderDashboard();renderCalendar();renderArchive();renderManage();if(refreshDetail && state.view==='detail')renderDetail();}

  const labels={dashboard:'Genel Bakış',calendar:'Takvim',archive:'Ders Arşivi',manage:'Ders Yönetimi',detail:'Ders Detayı'};
  function navigate(view){
    if(!labels[view])return;
    if(state.view==='detail'&&view!=='detail')stopEmbeds();
    state.view=view;
    document.querySelectorAll('[data-screen]').forEach((sec)=>sec.classList.toggle('hidden',sec.dataset.screen!==view));
    document.querySelectorAll('.nav-item').forEach((btn)=>btn.classList.toggle('active',btn.dataset.viewTarget===view));
    setText('topbar-current',labels[view]);
    if(view==='detail')renderDetail();
    if(view==='archive')renderArchive();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function openDetail(id){
    if(!state.lessons.some((d)=>d.id===id))return;
    if(state.view!=='detail')state.lastView=state.view;
    state.detailId=id;navigate('detail');
  }
  const lessonDialog=$('lesson-dialog');
  function closeLesson(){lessonDialog.close();}
  function openLesson(id=null){
    const record=id?state.lessons.find((d)=>d.id===id):null;
    state.editingId=record?record.id:null;
    $('lesson-form').reset();
    $('lesson-dialog-title').textContent=record?'Dersi düzenle':'Yeni ders ekle';
    $('lesson-submit').textContent=record?'Değişiklikleri kaydet':'Dersi kaydet';
    $('form-ad').value=record?.ad||'';
    $('form-konu').value=record?.konu||'';
    $('form-tarih').value=record?.tarih||localISO(new Date());
    $('form-saat').value=record?.saat||'';
    $('form-kurul').value=record?.kurul||'';
    $('form-pdf').value=record?.pdf||'';
    $('form-ses').value=record?.ses||'';
    $('form-aciklama').value=record?.aciklama||'';
    lessonDialog.showModal();
    $('form-ad').focus();
  }
  async function saveLesson(event){
    event.preventDefault();
    const form=$('lesson-form');
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const ad=clean(data.get('ad'),120),konu=clean(data.get('konu'),180),tarih=clean(data.get('tarih'),10);
    const pdf=clean(data.get('pdf')),ses=clean(data.get('ses'));
    if(!ad||!konu||!validDate(tarih)){toast('Ders adı, konu ve geçerli tarih gereklidir.',true);return;}
    if((pdf&&!safeLink(pdf))||(ses&&!safeLink(ses))){toast('Drive bağlantısı http:// veya https:// ile başlamalı.',true);return;}
    const prior=state.lessons.find((d)=>d.id===state.editingId);
    const now=new Date().toISOString();
    const record={
      id:prior?.id||idNew(),ad,konu,tarih,
      saat:clean(data.get('saat'),5),kurul:clean(data.get('kurul'),100),
      pdf:safeLink(pdf),ses:safeLink(ses),aciklama:clean(data.get('aciklama'),5000),
      progress:prior?.progress||0,favorite:prior?.favorite||false,
      createdAt:prior?.createdAt||now,updatedAt:now
    };
    const next=prior?state.lessons.map((d)=>d.id===prior.id?record:d):[...state.lessons,record];
    if(await persist(next,prior?'Ders güncellendi.':'Yeni ders kaydedildi.')){
      closeLesson();
      if(state.view==='detail'&&state.detailId===record.id)renderDetail();
    }
  }
  async function deleteLesson(id){
    const d=state.lessons.find((x)=>x.id===id);if(!d)return;
    if(!window.confirm(`“${d.ad} — ${d.konu}” kaydını silmek istiyor musun?\n\nBu işlem Drive dosyalarını silmez.`))return;
    const next=state.lessons.filter((x)=>x.id!==id);
    if(await persist(next,'Ders kaydı silindi.')){
      if(state.view==='detail'&&state.detailId===id)navigate('manage');
    }
  }
  function exportData(){
    if(state.storageBroken){toast('Bozuk kayıtları dışa aktarmak için önce kayıt alanını kontrol et.',true);return;}
    const payload={app:'MedArsiv',version:2,exportedAt:new Date().toISOString(),dersler:state.lessons};
    const file=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(file);
    const a=create('a');a.href=url;a.download=`MedArsiv-Yedek-${localISO(new Date())}.json`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast('Yedek indirme işlemi başlatıldı.');
  }
  function validateImport(raw){
    const input=Array.isArray(raw)?raw:(raw && (Array.isArray(raw.dersler)?raw.dersler:raw.lessons));
    if(!Array.isArray(input))throw new Error('Dosya bir ders listesi içermiyor.');
    if(input.length>5000)throw new Error('Bir seferde en fazla 5000 kayıt aktarılabilir.');
    for(const item of input){
      if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.ad!=='string'||!item.ad.trim()||item.ad.length>120||typeof item.konu!=='string'||!item.konu.trim()||item.konu.length>180||!validDate(item.tarih))throw new Error('Bazı derslerde zorunlu bilgiler eksik veya geçersiz.');
      for(const f of ['pdf','ses'])if(item[f]!==undefined && item[f]!==null && (typeof item[f]!=='string'||(item[f].trim()&&!safeLink(item[f]))))throw new Error('Bazı Drive bağlantıları geçersiz.');
    }
    return input.map(normalize);
  }
  async function readBackup(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>5*1024*1024){toast('Dosya çok büyük (en fazla 5 MB).',true);return;}
    try{
      const parsed=JSON.parse(await file.text());
      state.pendingImport=validateImport(parsed);
      setText('import-preview-text',`${file.name} · ${state.pendingImport.length} ders kaydı bulundu.`);
      document.querySelector('input[name="import-mode"][value="merge"]').checked=true;
      $('import-dialog').showModal();
    }catch(error){toast(`Yedek okunamadı: ${error.message}`,true);}
  }
  function backupKey(d){return [d.ad,d.konu,d.tarih,d.saat,d.pdf,d.ses].map((x)=>groupKey(x||'')).join('|');}
  async function confirmImport(){
    if(!state.pendingImport)return;
    const mode=document.querySelector('input[name="import-mode"]:checked')?.value||'merge';
    if(mode==='replace'&&!window.confirm('Mevcut tüm derslerin bu yedekle değiştirilecek. Devam edilsin mi?'))return;
    let next;
    if(mode==='replace')next=state.pendingImport;
    else{
      const seen=new Set(state.lessons.map(backupKey));
      const ids=new Set(state.lessons.map((d)=>d.id));
      next=[...state.lessons];
      state.pendingImport.forEach((item)=>{
        const key=backupKey(item);
        if(seen.has(key))return;
        seen.add(key);
        const record={...item,id:ids.has(item.id)?idNew():item.id};
        ids.add(record.id);next.push(record);
      });
    }
    if(await persist(next,`${next.length} ders kaydı arşivde hazır.`)){
      $('import-dialog').close();state.pendingImport=null;navigate('manage');
    }
  }

  document.addEventListener('click',(event)=>{
    const btn=event.target.closest('[data-action],[data-view-target]');if(!btn)return;
    if(!state.user || state.revision === null || state.saving || state.loading)return;
    if(btn.dataset.viewTarget){navigate(btn.dataset.viewTarget);return;}
    const {action,id,date}=btn.dataset;
    if(action==='add')openLesson();
    if(action==='view')openDetail(id);
    if(action==='edit')openLesson(id);
    if(action==='delete')deleteLesson(id);
    if(action==='favorite'){const d=state.lessons.find((x)=>x.id===id);if(d)updateStudy(id,{favorite:!d.favorite});}
    if(action==='date'){state.selectedDate=date;renderCalendar();}
    if(action==='close-lesson')closeLesson();
    if(action==='close-import'){$('import-dialog').close();state.pendingImport=null;}
  });
  $('lesson-form').addEventListener('submit',saveLesson);
  $('detail-back').addEventListener('click',()=>navigate(state.lastView));
  $('detail-edit').addEventListener('click',()=>openLesson(state.detailId));
  $('detail-delete').addEventListener('click',()=>deleteLesson(state.detailId));
  $('prev-month').addEventListener('click',()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar();});
  $('next-month').addEventListener('click',()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar();});
  $('calendar-today').addEventListener('click',()=>{state.selectedDate=localISO(new Date());state.month=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();});
  $('archive-search').addEventListener('input',(e)=>{state.search=e.target.value;renderArchive();});
  $('global-search').addEventListener('input',(e)=>{state.search=e.target.value;navigate('archive');});
  $('archive-course-filter').addEventListener('change',(e)=>{state.courseFilter=e.target.value;renderArchive();});
  $('archive-sort').addEventListener('change',(e)=>{state.sort=e.target.value;renderArchive();});
  $('archive-favorites').addEventListener('change',(e)=>{state.favoritesOnly=e.target.checked;renderArchive();});
  $('archive-study-filter').addEventListener('change',(e)=>{state.studyFilter=e.target.value;renderArchive();});
  $('detail-progress').addEventListener('input',(e)=>{
    setText('detail-progress-value',`%${e.target.value}`);$('detail-progress-bar').value=Number(e.target.value);
    $('detail-study-status').value=Number(e.target.value)===100?'done':Number(e.target.value)>0?'active':'new';
  });
  $('detail-progress').addEventListener('change',(e)=>updateStudy(state.detailId,{progress:Number(e.target.value)}));
  $('detail-study-status').addEventListener('change',(e)=>{
    const d=state.lessons.find((x)=>x.id===state.detailId);if(!d)return;
    updateStudy(d.id,{progress:e.target.value==='done'?100:e.target.value==='new'?0:(d.progress>0&&d.progress<100?d.progress:1)});
  });
  $('export-btn').addEventListener('click',exportData);
  $('sidebar-export').addEventListener('click',exportData);
  $('import-btn').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',readBackup);
  $('confirm-import').addEventListener('click',confirmImport);
  $('import-dialog').addEventListener('close',()=>{state.pendingImport=null;});
  lessonDialog.addEventListener('close',()=>{state.editingId=null;});

  $('sync-btn').addEventListener('click',()=>loadArchive());
  $('logout-btn').addEventListener('click',async()=>{
    const {error}=await cloud.auth.signOut();
    if(error){toast('Çıkış yapılamadı. Tekrar dene.',true);return;}lockApp();
  });
  $('auth-form').addEventListener('submit',async(event)=>{
    event.preventDefault(); if(!cloud)return;
    $('auth-submit').disabled=true; $('auth-message').textContent='Giriş yapılıyor…';
    try {
      const {data,error}=await cloud.auth.signInWithPassword({email:$('auth-email').value.trim(),password:$('auth-password').value});
      if(error){$('auth-message').textContent='Giriş başarısız. E-posta ve şifreni kontrol et.';return;}
      await unlockApp(data.user);
    } catch (_) { $('auth-message').textContent='Bağlantı kurulamadı. Tekrar dene.'; }
    finally { $('auth-submit').disabled=false; }
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && state.user && !state.saving && !state.loading && !$('lesson-dialog').open && !$('import-dialog').open)loadArchive();
  });
  lockApp('Oturum kontrol ediliyor…');
  if(!cloud){$('auth-message').textContent='Giriş bileşeni yüklenemedi. Sayfayı yenile.';}
  else {
    cloud.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT')lockApp();
      if(event==='SIGNED_IN' && session?.user && state.user?.id!==session.user.id)setTimeout(()=>unlockApp(session.user),0);
    });
    cloud.auth.getUser().then(({data,error})=>{
      if(data?.user&&!error)unlockApp(data.user);
      else if(!state.user)$('auth-message').textContent='E-posta ve şifrenle giriş yap.';
    }).catch(()=>{$('auth-message').textContent='Bağlantı kurulamadı. Sayfayı yenile.';});
  }
})();
