(function () {
  'use strict';

  const tokenKey = 'webgl_hub_token';
  const refreshKey = 'webgl_hub_refresh_token';
  const guestKey = 'webgl_hub_guest_id';
  const supabaseBrowserVersion = '2.112.3';
  const state = { appId: 'global', user: null, socket: null, supabase: null, ready: false };

  function qs(id) { return document.getElementById(id); }
  function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
  function showToast(text) { const toast = el('div', 'toast', String(text || 'Ошибка')); document.body.appendChild(toast); setTimeout(() => toast.remove(), 3200); }
  function randomUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function guestId() { let id = localStorage.getItem(guestKey); if (!id) { id = randomUuid(); localStorage.setItem(guestKey, id); } return id; }
  function accessToken() { return localStorage.getItem(tokenKey) || ''; }

  async function loadSupabaseBrowser() {
    if (window.supabase?.createClient) return window.supabase;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${supabaseBrowserVersion}/dist/umd/supabase.min.js`;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить Supabase client.'));
      document.head.appendChild(script);
    });
    if (!window.supabase?.createClient) throw new Error('Supabase client недоступен.');
    return window.supabase;
  }

  function createOfflineSupabaseClient() {
    return {
      channel(_name, _opts) {
        const listeners = [];
        const ch = {
          on(event, filter, callback) {
            listeners.push({ event, filter, callback: typeof filter === 'function' ? filter : callback });
            return ch;
          },
          subscribe(callback) {
            if (typeof callback === 'function') {
              setTimeout(() => callback('SUBSCRIBED'), 0);
            }
            return ch;
          },
          async track() { return 'ok'; },
          async send() { return 'ok'; },
          presenceState() { return {}; }
        };
        return ch;
      },
      removeChannel() { return Promise.resolve(); },
      auth: {
        async setSession() { return { data: { session: null }, error: null }; },
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        async signOut() { return { error: null }; }
      },
      realtime: {
        setAuth() {}
      }
    };
  }

  async function createSupabase() {
    try {
      const [library, response] = await Promise.all([
        loadSupabaseBrowser().catch(() => null),
        fetch('/api/config', { headers: { Accept: 'application/json' } }).catch(() => null)
      ]);
      const config = response && response.ok ? await response.json().catch(() => ({})) : {};
      if (config?.configured !== false && config?.supabaseUrl && config?.supabasePublishableKey && library?.createClient) {
        const client = library.createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
        });
        const token = accessToken();
        const refreshToken = localStorage.getItem(refreshKey) || '';
        if (token && refreshToken) {
          const { data, error } = await client.auth.setSession({ access_token: token, refresh_token: refreshToken });
          if (error) {
            localStorage.removeItem(tokenKey);
            localStorage.removeItem(refreshKey);
          } else if (data.session) {
            localStorage.setItem(tokenKey, data.session.access_token);
            localStorage.setItem(refreshKey, data.session.refresh_token);
          }
        } else if (token) {
          client.realtime.setAuth(token);
        }
        client.auth.onAuthStateChange((_event, session) => {
          if (session) {
            localStorage.setItem(tokenKey, session.access_token);
            localStorage.setItem(refreshKey, session.refresh_token);
            client.realtime.setAuth(session.access_token);
          }
        });
        return client;
      }
    } catch {
      // Fall through to offline client fallback
    }
    return createOfflineSupabaseClient();
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, opts.headers || {});
    const token = accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, Object.assign({}, opts, { headers }));
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || 'Ошибка сервера');
    return json;
  }

  function buildAuth() { const box = el('div', 'hud-panel'); box.id = 'authBox'; document.body.appendChild(box); renderAuth(); }
  function renderAuth() {
    const box = qs('authBox'); if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('h3', null, 'Аккаунт для всех приложений'));
    if (state.user) {
      const row = el('div', 'loggedRow');
      row.innerHTML = `<span class="loggedName">${escapeHtml(state.user.username)}</span>`;
      const out = el('button', null, 'Выйти'); out.onclick = logout; row.appendChild(out); box.appendChild(row);
      const hint = el('div', null, 'Ник в играх берётся из аккаунта.'); hint.style.cssText = 'font-size:12px;color:#9fb0c0;margin-top:6px'; box.appendChild(hint);
      return;
    }
    const name = el('input'); name.id = 'authName'; name.placeholder = 'ник'; name.maxLength = 20;
    const pass = el('input'); pass.id = 'authPass'; pass.placeholder = 'пароль (от 6 символов)'; pass.type = 'password';
    const row = el('div'); row.style.display = 'flex'; row.style.gap = '6px';
    const login = el('button', null, 'Войти'); const register = el('button', null, 'Рег');
    login.onclick = () => loginOrRegister('/api/login'); register.onclick = () => loginOrRegister('/api/register'); row.append(login, register);
    const message = el('div'); message.id = 'authMsg'; box.append(name, pass, row, message);
  }
  async function loginOrRegister(path) {
    const username = qs('authName').value.trim(); const password = qs('authPass').value;
    try {
      const json = await api(path, { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem(tokenKey, json.token);
      if (json.refreshToken) localStorage.setItem(refreshKey, json.refreshToken);
      state.user = json.user; renderAuth(); showToast(`Аккаунт: ${json.user.username}`); setTimeout(() => location.reload(), 350);
    } catch (error) { qs('authMsg').textContent = error.message; }
  }
  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    try { await state.supabase?.auth.signOut({ scope: 'local' }); } catch {}
    localStorage.removeItem(tokenKey); localStorage.removeItem(refreshKey); state.user = null; renderAuth(); showToast('Выход из аккаунта'); setTimeout(() => location.reload(), 350);
  }
  async function loadMe() {
    if (!accessToken()) return;
    try { state.user = (await api('/api/me')).user; if (!state.user) throw new Error('expired'); }
    catch { localStorage.removeItem(tokenKey); localStorage.removeItem(refreshKey); state.user = null; }
  }

  function buildChat() {
    const chat = el('div', 'mc-chat');
    chat.innerHTML = '<div class="mc-lines" id="chatLines"></div><div class="mc-input-row"><input class="mc-input" id="chatInput" placeholder="[Global] Нажми Enter для чата..." maxlength="220"><button class="mc-send" id="chatSend">Send</button></div>';
    document.body.appendChild(chat); qs('chatSend').onclick = sendChat; qs('chatInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendChat(); } });
  }
  function addChat(message) {
    const lines = qs('chatLines'); if (!lines) return;
    const div = el('div', 'mc-line'); const time = new Date(message.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span class="mc-app">[${escapeHtml(message.app || 'global')}]</span> <span class="mc-name ${message.account ? 'acc' : ''}">&lt;${escapeHtml(message.name || 'Guest')}&gt;</span> ${escapeHtml(message.text || '')} <span class="mc-app">${time}</span>`;
    lines.appendChild(div); while (lines.children.length > 10) lines.removeChild(lines.firstChild); lines.scrollTop = lines.scrollHeight;
  }
  function sendChat() { const input = qs('chatInput'); const text = input.value.trim(); if (!text || !state.socket) return; input.value = ''; state.socket.emit('chat:send', { app: state.appId, text }); }

  function dbChat(row) { return { id: row.id, ts: new Date(row.created_at).getTime(), app: row.app, name: row.author_name, account: Boolean(row.user_id), text: row.message }; }
  function dbObject(row) { return { id: row.id, type: row.object_type, position: row.position, size: Number(row.size), owner: row.owner_user_id || row.owner_guest_id, ownerName: row.owner_name }; }
  function dbBuilding(row) { return { id: row.id, piece: row.piece, owner: row.owner_user_id || row.owner_guest_id, ownerName: row.owner_name, position: row.position, rotationY: Number(row.rotation_y) || 0, supportId: row.support_id, slot: row.slot, hp: row.hp, createdAt: new Date(row.created_at).getTime() }; }

  class MiniSocket {
    constructor() {
      this.handlers = {}; this.queue = []; this.connected = false; this.closed = false; this.app = 'global';
      this.guestId = guestId(); this.id = state.user?.id || this.guestId; this.name = state.user?.username || `Guest_${this.guestId.replaceAll('-', '').slice(0, 4)}`;
      this.channels = {}; this.playerMaps = { sharabass: new Map(), survival: new Map() }; this.lastSurvivalState = null; this.lastPositionSave = 0;
      this.seen = { chat: new Set(), objects: new Set(), buildings: new Set() };
      this._connect().catch(error => { this._trigger('error:message', error.message); this._trigger('disconnect'); });
    }
    on(event, fn) { (this.handlers[event] || (this.handlers[event] = [])).push(fn); return this; }
    emit(event, data) { const item = { event, data }; if (!this.connected) this.queue.push(item); else this._send(event, data).catch(error => this._trigger('error:message', error.message)); }
    disconnect() { this.closed = true; this.connected = false; for (const channel of Object.values(this.channels)) state.supabase.removeChannel(channel).catch(() => {}); this._trigger('disconnect'); }
    _trigger(event, data) { for (const fn of this.handlers[event] || []) try { fn(data); } catch (error) { console.error(error); } }
    _once(kind, id, event, data) { if (!id || this.seen[kind].has(id)) return; this.seen[kind].add(id); if (this.seen[kind].size > 500) this.seen[kind].delete(this.seen[kind].values().next().value); this._trigger(event, data); }
    async _game(action, payload = {}) { return api('/api/game', { method: 'POST', body: JSON.stringify(Object.assign({ action, guestId: this.guestId }, payload)) }); }
    async _connect() {
      const channel = state.supabase.channel('world:database'); this.channels.database = channel;
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, change => { const message = dbChat(change.new); this._once('chat', message.id, 'chat:message', message); })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sharabass_objects' }, change => { const object = dbObject(change.new); this._once('objects', object.id, 'sharabass:object:placed', object); })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sharabass_objects' }, change => this._trigger('sharabass:object:removed', { id: change.old.id }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_world_state', filter: 'key=eq.sharabass_weather' }, change => { if (change.new?.value) this._trigger('sharabass:weather', change.new.value); })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survival_buildings' }, change => { const building = dbBuilding(change.new); this._once('buildings', building.id, 'building:placed', building); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'survival_resource_states' }, change => { if (change.new?.resource_id) this._trigger('resource:update', { id: change.new.resource_id, remaining: Number(change.new.remaining) }); });
      await new Promise((resolve, reject) => channel.subscribe(status => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Supabase Realtime недоступен.'));
      }));
      if (this.closed) return;
      this.connected = true; this._trigger('connect');
      try {
        const history = await this._game('chat_history');
        const lines = qs('chatLines'); if (lines) lines.innerHTML = '';
        for (const message of history.messages || []) { this.seen.chat.add(message.id); this._trigger('chat:message', message); }
      } catch (error) { this._trigger('error:message', error.message); }
      for (const item of this.queue.splice(0)) {
        try { await this._send(item.event, item.data); }
        catch (error) { this._trigger('error:message', error.message); }
      }
    }
    async _room(name) {
      if (this.channels[name]) return this.channels[name];
      const topic = name === 'sharabass' ? 'world:sharabass' : 'world:survival';
      const channel = state.supabase.channel(topic, { config: { presence: { key: this.id }, broadcast: { self: false, ack: false } } });
      this.channels[name] = channel;
      channel.on('presence', { event: 'sync' }, () => this._syncPresence(name));
      channel.on('broadcast', { event: 'player_state' }, ({ payload }) => {
        if (!payload?.id) return; this.playerMaps[name].set(payload.id, Object.assign({}, this.playerMaps[name].get(payload.id), payload)); this._emitPlayers(name);
      });
      await new Promise((resolve, reject) => channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') { await channel.track({ id: this.id, name: this.name, joinedAt: Date.now() }); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime-комната ${name} недоступна.`));
      }));
      return channel;
    }
    _syncPresence(name) {
      const channel = this.channels[name]; if (!channel) return;
      const active = new Set();
      for (const entries of Object.values(channel.presenceState())) for (const entry of entries) {
        if (!entry.id) continue; active.add(entry.id); const previous = this.playerMaps[name].get(entry.id) || {}; this.playerMaps[name].set(entry.id, Object.assign(previous, entry));
      }
      for (const id of this.playerMaps[name].keys()) if (!active.has(id)) this.playerMaps[name].delete(id);
      this._emitPlayers(name);
    }
    _emitPlayers(name) {
      const players = [...this.playerMaps[name].values()];
      if (name === 'sharabass') this._trigger('sharabass:players', players.map(p => ({ id: p.id, name: p.name, cameraPos: p.cameraPos || { x: 0, y: 0, z: 0 }, cameraTarget: p.cameraTarget || { x: 0, y: 0, z: 0 } })));
      else this._trigger('survival:players:update', players.map(p => ({ id: p.id, name: p.name, position: p.position || { x: 0, y: 0, z: 0 }, rotationY: p.rotationY || 0, running: Boolean(p.running), action: p.action || 'idle', health: 100, hunger: 100, thirst: 100 })));
    }
    async _send(event, data) {
      if (event === 'app:join') { this.app = String(data || 'global'); return; }
      if (event === 'chat:send') { const result = await this._game('chat_send', data || {}); this._once('chat', result.message?.id, 'chat:message', result.message); return; }
      if (event === 'sharabass:join') {
        await this._room('sharabass'); const result = await this._game('sharabass_init');
        this._trigger('sharabass:init', Object.assign(result, { players: [...this.playerMaps.sharabass.values()] })); return;
      }
      if (event === 'sharabass:fly') {
        const channel = await this._room('sharabass'); const payload = Object.assign({ id: this.id, name: this.name }, data || {});
        this.playerMaps.sharabass.set(this.id, payload); await channel.send({ type: 'broadcast', event: 'player_state', payload }); return;
      }
      if (event === 'sharabass:place') { const result = await this._game('sharabass_place', data || {}); this._once('objects', result.object?.id, 'sharabass:object:placed', result.object); return; }
      if (event === 'sharabass:remove') { const result = await this._game('sharabass_remove', data || {}); this._trigger('sharabass:object:removed', { id: result.id }); return; }
      if (event === 'sharabass:weather') { const result = await this._game('sharabass_weather', { weather: data || {} }); this._trigger('sharabass:weather', result.weather); return; }
      if (event === 'survival:join') {
        await this._room('survival'); const result = await this._game('survival_join'); this._trigger('survival:init', result); this._trigger('inventory:update', result.player.inventory); return;
      }
      if (event === 'survival:state') {
        this.lastSurvivalState = data || {}; const channel = await this._room('survival'); const payload = Object.assign({ id: this.id, name: this.name }, data || {});
        this.playerMaps.survival.set(this.id, payload); await channel.send({ type: 'broadcast', event: 'player_state', payload });
        if (Date.now() - this.lastPositionSave > 1000) { this.lastPositionSave = Date.now(); this._game('survival_position', data || {}).catch(error => this._trigger('error:message', error.message)); }
        return;
      }
      if (event === 'chunk:request') { const result = await this._game('chunks', data || {}); this._trigger('chunk:data', result.chunks || []); return; }
      if (event === 'resource:hit') {
        const result = await this._game('resource_hit', Object.assign({}, data || {}, { playerPosition: this.lastSurvivalState?.position, rotationY: this.lastSurvivalState?.rotationY })); this._trigger('inventory:update', result.inventory); if (result.resource) this._trigger('resource:update', result.resource); return;
      }
      if (event === 'craft:item') { const result = await this._game('craft_item', data || {}); this._trigger('inventory:update', result.inventory); return; }
      if (event === 'inventory:move') { const result = await this._game('inventory_move', data || {}); this._trigger('inventory:update', result.inventory); return; }
      if (event === 'build:place') {
        const result = await this._game('build_place', Object.assign({}, data || {}, { playerPosition: this.lastSurvivalState?.position, playerRotationY: this.lastSurvivalState?.rotationY }));
        this._trigger('inventory:update', result.inventory); this._once('buildings', result.building?.id, 'building:placed', result.building); return;
      }
    }
  }

  function connectSocket() {
    state.socket = new MiniSocket();
    state.socket.on('connect', () => state.socket.emit('app:join', state.appId));
    state.socket.on('chat:message', addChat);
    state.socket.on('error:message', showToast);
    window.dispatchEvent(new CustomEvent('appcore:socket', { detail: state.socket }));
  }

  window.AppCore = {
    state,
    async init(appId) {
      state.appId = appId || 'global';
      state.supabase = await createSupabase();
      await loadMe(); buildAuth(); buildChat(); connectSocket(); state.ready = true; return state;
    },
    socket: () => state.socket,
    toast: showToast,
    api,
    token: accessToken,
    user: () => state.user,
    supabase: () => state.supabase
  };
})();
