// Salalah info screen for the VIDAA TV browser. Plain ES2017 (no modules, no
// optional chaining) because TV web engines lag behind desktop browsers.
(function () {
  'use strict';

  // Same calibration as the Android app (Config.kt): matches the Ministry of Awqaf
  // Salalah tables with Fajr/Isha at 18° plus the ministry's precaution minutes.
  var CFG = {
    lat: 17.0151,
    lon: 54.0924,
    tz: 'Asia/Muscat',
    methodSettings: '18,null,18',
    tune: '0,0,0,5,6,5,0,0,0', // Imsak,Fajr,Sunrise,Dhuhr,Asr,Maghrib,Sunset,Isha,Midnight
    prayerCacheVersion: 1,
  };
  var OMAN_OFFSET_MS = 4 * 3600 * 1000; // Oman has no daylight saving
  var MINUTE = 60 * 1000;
  // Commit stamped into index.html by the deploy workflow ("__V__" when run locally).
  var VERSION = ((document.currentScript && document.currentScript.src.match(/[?&]v=([^&]+)/)) || [])[1] || '__V__';

  var PRAYERS = [
    { key: 'Fajr', w: 'p_fajr', prayer: true },
    { key: 'Sunrise', w: 'p_sunrise', prayer: false },
    { key: 'Dhuhr', w: 'p_dhuhr', prayer: true },
    { key: 'Asr', w: 'p_asr', prayer: true },
    { key: 'Maghrib', w: 'p_maghrib', prayer: true },
    { key: 'Isha', w: 'p_isha', prayer: true },
  ];

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function setHtml(el, html) { if (el.getAttribute('data-html') !== html) { el.innerHTML = html; el.setAttribute('data-html', html); } }

  // ---- Thmanyah word images (labels.js, made by tools/render-labels.mjs) ----
  // Plain <img> in a pre-rendered colour (white, or 'gold'/'ink' variants): the
  // VIDAA TV browser didn't show CSS-masked words. Dim labels use CSS opacity.
  var LABELS = window.LABELS || {};

  function W(key, variant) {
    var l = LABELS[key];
    if (!l) return '';
    return '<img class="w" alt="' + l.t + '" src="labels/' + key + (variant ? '_' + variant : '') + '.png" style="' +
      'width:' + (l.h * l.r).toFixed(3) + 'em;height:' + l.h + 'em;vertical-align:-' + l.d + 'em">';
  }
  function T(key) { return LABELS[key] ? LABELS[key].t : ''; }

  // ---- Muscat wall-clock helpers: a "day key" is "YYYY-MM-DD" in Muscat time. ----
  function wall(ms) { return new Date(ms + OMAN_OFFSET_MS); } // read with getUTC*()
  function keyOf(w) { return w.getUTCFullYear() + '-' + pad(w.getUTCMonth() + 1) + '-' + pad(w.getUTCDate()); }
  function parts(key) { var p = key.split('-'); return [+p[0], +p[1], +p[2]]; }
  function addDays(key, n) { var p = parts(key); return keyOf(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n))); }
  function weekday(key) { var p = parts(key); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
  function momentOf(key, hhmm) {
    var p = parts(key), t = hhmm.split(':');
    return Date.UTC(p[0], p[1] - 1, p[2], +t[0], +t[1]) - OMAN_OFFSET_MS;
  }
  function time12(hhmm) {
    var t = hhmm.split(':'), h = +t[0], h12 = h % 12 || 12;
    return h12 + ':' + t[1] + ' ' + (h < 12 ? 'ص' : 'م');
  }
  function label(p, key) { return p.key === 'Dhuhr' && weekday(key) === 5 ? 'p_jumua' : p.w; }

  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  function getJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  // ---- Prayer times (Aladhan, one month per request, cached for offline use) ----
  var days = {}; // day key -> { times: {Fajr: 'HH:MM', ...}, hijri: [d, m, y] }
  var loadedMonths = {};

  function monthUrl(y, m) {
    return 'https://api.aladhan.com/v1/calendar/' + y + '/' + m +
      '?latitude=' + CFG.lat + '&longitude=' + CFG.lon + '&method=99&methodSettings=' + CFG.methodSettings +
      '&tune=' + CFG.tune + '&school=0&timezonestring=' + CFG.tz;
  }

  function loadMonth(y, m) {
    var id = y + '-' + m;
    if (loadedMonths[id]) return Promise.resolve();
    var cacheKey = 'prayers_v' + CFG.prayerCacheVersion + '_' + id;
    var cached = store.get(cacheKey);
    var source = cached ? Promise.resolve(cached) : getJson(monthUrl(y, m)).then(function (json) {
      if (json.code !== 200) throw new Error('Aladhan: ' + JSON.stringify(json.data));
      var list = json.data.map(function (d) {
        var g = d.date.gregorian.date.split('-'); // DD-MM-YYYY
        var times = {};
        PRAYERS.forEach(function (p) { times[p.key] = d.timings[p.key].slice(0, 5); });
        var h = d.date.hijri;
        return { key: g[2] + '-' + g[1] + '-' + g[0], times: times, hijri: [+h.day, h.month.number, +h.year] };
      });
      store.set(cacheKey, list);
      return list;
    });
    return source.then(function (list) {
      list.forEach(function (d) { days[d.key] = d; });
      loadedMonths[id] = true;
    });
  }

  var prayersFailed = false;
  var prayersFor = null;

  function ensurePrayers(todayKey) {
    if (prayersFor === todayKey) return;
    prayersFor = todayKey;
    var t = parts(todayKey), n = parts(addDays(todayKey, 1));
    loadMonth(t[0], t[1]).then(function () { return loadMonth(n[0], n[1]); }).then(function () {
      prayersFailed = false;
    }).catch(function (e) {
      console.warn('prayers', e);
      prayersFailed = true;
      prayersFor = null;
      setTimeout(function () { ensurePrayers(keyOf(wall(Date.now()))); }, MINUTE);
    });
  }

  function nextPrayer(now, todayKey) {
    var today = days[todayKey], tomorrowKey = addDays(todayKey, 1);
    if (today) {
      for (var i = 0; i < PRAYERS.length; i++) {
        var p = PRAYERS[i];
        if (!p.prayer) continue;
        var at = momentOf(todayKey, today.times[p.key]);
        if (at > now) return { p: p, key: todayKey, at: at };
      }
    }
    var tomorrow = days[tomorrowKey];
    return tomorrow ? { p: PRAYERS[0], key: tomorrowKey, at: momentOf(tomorrowKey, tomorrow.times.Fajr) } : null;
  }

  function currentPrayer(now, todayKey) {
    var today = days[todayKey], found = null;
    if (!today) return null;
    PRAYERS.forEach(function (p) {
      var at = momentOf(todayKey, today.times[p.key]);
      if (p.prayer && at <= now) found = { p: p, key: todayKey, at: at };
    });
    return found;
  }

  // ---- Hijri date: Umm al-Qura from the browser, Aladhan's value as fallback ----
  var hijriFormat = null;
  try {
    hijriFormat = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',
      { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
    if (!hijriFormat.formatToParts || hijriFormat.resolvedOptions().calendar.indexOf('islamic') !== 0) hijriFormat = null;
  } catch (e) { hijriFormat = null; }

  var hijriOffset = store.get('hijriOffset') || 0;

  function hijriParts(todayKey) {
    var key = addDays(todayKey, hijriOffset);
    if (hijriFormat) {
      var p = parts(key), f = {};
      hijriFormat.formatToParts(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12))).forEach(function (x) { f[x.type] = x.value; });
      return [parseInt(f.day, 10), parseInt(f.month, 10), parseInt(f.year, 10)];
    }
    return days[key] ? days[key].hijri : null;
  }
  function hijriHtml(todayKey) {
    var h = hijriParts(todayKey);
    return h ? h[0] + ' ' + W('hm_' + h[1], 'gold') + ' ' + h[2] + ' ' + W('hijri_suffix', 'gold') : '';
  }
  function hijriText(todayKey) {
    var h = hijriParts(todayKey);
    return h ? h[0] + ' ' + T('hm_' + h[1]) + ' ' + h[2] + ' هـ' : '';
  }

  // ---- Weather (Open-Meteo) ----
  var weather = store.get('weather');

  var WEATHER_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + CFG.lat + '&longitude=' + CFG.lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
    'precipitation_probability_max,relative_humidity_2m_mean' +
    '&timezone=' + CFG.tz + '&forecast_days=4';

  function loadWeather() {
    getJson(WEATHER_URL).then(function (json) {
      weather = json;
      store.set('weather', json);
      renderWeather();
      setTimeout(loadWeather, 30 * MINUTE);
    }).catch(function (e) {
      console.warn('weather', e);
      setTimeout(loadWeather, 3 * MINUTE);
    });
  }

  // WMO weather code -> [label key, icon]
  function weatherInfo(code, night) {
    switch (code) {
      case 0: return ['wx_clear', night ? '🌙' : '☀️'];
      case 1: return ['wx_mostly', night ? '🌙' : '🌤️'];
      case 2: return ['wx_partly', '⛅'];
      case 3: return ['wx_cloudy', '☁️'];
      case 45: case 48: return ['wx_fog', '🌫️'];
      case 51: case 53: case 55: return ['wx_drizzle', '🌦️'];
      case 56: case 57: return ['wx_fdrizzle', '🌧️'];
      case 61: return ['wx_rain_l', '🌧️'];
      case 63: return ['wx_rain_m', '🌧️'];
      case 65: return ['wx_rain_h', '🌧️'];
      case 66: case 67: return ['wx_frain', '🌧️'];
      case 71: case 73: case 75: case 77: return ['wx_snow', '❄️'];
      case 80: case 81: return ['wx_showers', '🌦️'];
      case 82: return ['wx_showers_h', '⛈️'];
      case 85: case 86: return ['wx_snow_sh', '❄️'];
      case 95: return ['wx_storm', '⛈️'];
      case 96: case 99: return ['wx_storm_h', '⛈️'];
      default: return ['', '🌡️'];
    }
  }

  function isNight(now, todayKey) {
    var d = days[todayKey];
    if (!d) { var h = wall(now).getUTCHours(); return h < 6 || h >= 18; }
    return now < momentOf(todayKey, d.times.Sunrise) || now >= momentOf(todayKey, d.times.Maghrib);
  }

  function renderWeather() {
    if (!weather) return;
    var now = Date.now(), todayKey = keyOf(wall(now));
    var c = weather.current, d = weather.daily;
    var info = weatherInfo(c.weather_code, isNight(now, todayKey));
    var r = Math.round;
    var rain = c.precipitation >= 0.1 ? c.precipitation.toFixed(1) + ' مم' : d.precipitation_probability_max[0] + '%';
    var month = parts(todayKey)[1];
    // Kept deliberately short for reading from the sofa: now, humidity, rain, 3 days.
    var html =
      '<div class="w-now">' +
        '<div class="w-icon">' + info[1] + '</div>' +
        '<div><div class="w-temp">' + r(c.temperature_2m) + '°</div><div class="w-desc">' + W(info[0]) + '</div></div>' +
        '<div class="w-side">' +
          (month >= 6 && month <= 9 ? '<div class="khareef">' + W('w_khareef') + '</div>' : '') +
          '<div class="w-range">' + r(d.temperature_2m_max[0]) + '° / ' + r(d.temperature_2m_min[0]) + '°</div>' +
        '</div>' +
      '</div>' +
      '<div class="stats">' +
        stat(W('w_hum'), c.relative_humidity_2m + '%') +
        stat(W('w_rain'), rain) +
      '</div>' +
      '<div class="days">';
    for (var i = 1; i < Math.min(4, d.time.length); i++) {
      var di = weatherInfo(d.weather_code[i], false);
      html += '<div class="day">' +
        '<div class="n">' + W('wd_' + weekday(d.time[i])) + '</div>' +
        '<div class="i">' + di[1] + '</div>' +
        '<div class="t">' + r(d.temperature_2m_max[i]) + '° / ' + r(d.temperature_2m_min[i]) + '°</div>' +
        '<div class="x">' + W('w_rain') + ' ' + d.precipitation_probability_max[i] + '%</div>' +
      '</div>';
    }
    setHtml($('weather'), html + '</div>');
  }

  function stat(k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  // ---- News ticker (news.json is rebuilt by GitHub Actions every 30 minutes) ----
  var tickerAnimation = null;
  var tickerText = '';

  function loadNews() {
    getJson('news.json?t=' + Date.now()).then(function (json) {
      store.set('news', json);
      showNews(json);
      setTimeout(loadNews, 15 * MINUTE);
    }).catch(function (e) {
      console.warn('news', e);
      var cached = store.get('news');
      if (cached && !tickerText) showNews(cached);
      setTimeout(loadNews, 3 * MINUTE);
    });
  }

  function showNews(json) {
    var text = json.items.map(function (h) { return h.source + ': ' + h.title; }).join('     ◆     ');
    if (text && text !== tickerText) { tickerText = text; startTicker(text); }
  }

  // Arabic crawl: text enters from the left and moves right, so each headline's start is read first.
  function startTicker(text) {
    var el = $('tickerText');
    el.textContent = text;
    if (tickerAnimation) tickerAnimation.cancel();
    if (!el.animate) return;
    var width = el.offsetWidth, box = $('ticker').clientWidth;
    var pxPerSecond = 70 * Math.min(window.innerHeight / 540, window.innerWidth / 960);
    tickerAnimation = el.animate(
      [{ transform: 'translateX(' + (-width) + 'px)' }, { transform: 'translateX(' + box + 'px)' }],
      { duration: (box + width) / pxPerSecond * 1000, iterations: Infinity, easing: 'linear' }
    );
  }

  // ---- Sky background by time of day, cross-faded between two layers ----
  // Apple-style metallic graphite ("space gray") that only shifts in brightness and
  // a faint warm/cool cast through the day. [top, bottom, star opacity, glow A, B, C];
  // the soft glows sit behind the glass panels so the material has light to catch.
  var SKY = {
    night: ['#121214', '#232326', 0.5, '#5a5f70', '#3f4452', '#4a4658'],
    dawn: ['#2a2a2e', '#4a4446', 0.2, '#8a7a80', '#6a6e7c', '#9a8676'],
    morning: ['#4a4b50', '#6b6a6c', 0, '#a0a3ab', '#8c9099', '#b0a69a'],
    day: ['#505257', '#727479', 0, '#b4b8c0', '#959aa4', '#c2c5cb'],
    afternoon: ['#4b4b4f', '#6e6a66', 0, '#ada296', '#8d9199', '#b8a690'],
    sunset: ['#38363a', '#5c524e', 0, '#a8806a', '#7a6e78', '#b08a6e'],
    dusk: ['#1e1e22', '#38363c', 0.3, '#6e6680', '#545a6c', '#7a6a72'],
  };

  function skyBackground(s) {
    return 'linear-gradient(125deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0.04) 60%, rgba(255,255,255,0) 80%),' + // brushed-metal sheen
      'radial-gradient(38% 46% at 18% 30%, ' + s[3] + '99, transparent 70%),' +  // behind weather
      'radial-gradient(42% 36% at 62% 92%, ' + s[4] + '88, transparent 70%),' +  // behind prayer bar
      'radial-gradient(30% 34% at 88% 78%, ' + s[5] + '77, transparent 70%),' +  // behind next card
      'linear-gradient(to bottom, ' + s[0] + ', ' + s[1] + ')';
  }

  function skyPhase(now, todayKey) {
    var d = days[todayKey];
    if (!d) {
      var h = wall(now).getUTCHours();
      return h === 5 ? 'dawn' : h < 5 ? 'night' : h <= 8 ? 'morning' : h <= 14 ? 'day' : h <= 16 ? 'afternoon' :
        h === 17 ? 'sunset' : h === 18 ? 'dusk' : 'night';
    }
    function at(k) { return momentOf(todayKey, d.times[k]); }
    if (now < at('Fajr')) return 'night';
    if (now < at('Sunrise')) return 'dawn';
    if (now < at('Sunrise') + 120 * MINUTE) return 'morning';
    if (now < at('Asr')) return 'day';
    if (now < at('Maghrib') - 40 * MINUTE) return 'afternoon';
    if (now < at('Maghrib') + 20 * MINUTE) return 'sunset';
    if (now < at('Isha')) return 'dusk';
    return 'night';
  }

  var currentSky = null, skyFront = 'skyA';

  function setSky(name) {
    if (name === currentSky) return;
    var s = SKY[name], back = skyFront === 'skyA' ? 'skyB' : 'skyA';
    $(back).style.background = skyBackground(s);
    $(back).style.opacity = 1;
    $(skyFront).style.opacity = 0;
    skyFront = back;
    $('stars').style.opacity = s[2];
    currentSky = name;
  }

  function makeStars() {
    var html = '', seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 90; i++) {
      var size = 1.5 + rnd() * 3, alpha = 0.25 + rnd() * 0.55;
      html += '<i style="left:' + (rnd() * 100) + '%;top:' + (rnd() * 60) + '%;width:' + size + 'px;height:' + size +
        'px;opacity:' + alpha + '"></i>';
    }
    $('stars').innerHTML = html;
  }

  // ---- Rendering every second ----
  var renderedDay = null, renderedRow = '';

  function renderPrayerRow(now, rowKey, next) {
    var d = days[rowKey];
    if (!d) {
      var msg = prayersFailed ? 'تعذّر تحميل أوقات الصلاة — ستتم إعادة المحاولة' : 'جارٍ تحميل أوقات الصلاة…';
      if (renderedRow !== msg) { $('prayers').innerHTML = '<div class="muted loading">' + msg + '</div>'; renderedRow = msg; }
      return;
    }
    var html = PRAYERS.map(function (p) {
      var at = momentOf(rowKey, d.times[p.key]);
      var cls = next && next.p === p && next.key === rowKey ? 'next' : at <= now ? 'past' : !p.prayer ? 'minor' : '';
      return '<div class="pc ' + cls + '"><div class="n">' + W(label(p, rowKey), cls === 'next' ? 'ink' : '') +
        '</div><div class="t">' + time12(d.times[p.key]) + '</div></div>';
    }).join('');
    if (html !== renderedRow) { $('prayers').innerHTML = html; renderedRow = html; }
  }

  // "حان وقت صلاة العصر منذ 5 دقائق", with Arabic number agreement for minutes.
  function sinceHtml(prayerLabel, minutes) {
    var g = 'gold', tail;
    if (minutes === 0) tail = W('now', g);
    else if (minutes === 1) tail = W('since', g) + ' ' + W('min_1', g);
    else if (minutes === 2) tail = W('since', g) + ' ' + W('min_2', g);
    else if (minutes <= 10) tail = W('since', g) + ' ' + minutes + ' ' + W('min_few', g);
    else tail = W('since', g) + ' ' + minutes + ' ' + W('min_1', g);
    return W('now_prefix', g) + ' ' + W(prayerLabel, g) + ' ' + tail;
  }

  function tick() {
    var now = Date.now(), w = wall(now), todayKey = keyOf(w);
    ensurePrayers(todayKey);

    var h = w.getUTCHours();
    $('hm').textContent = (h % 12 || 12) + ':' + pad(w.getUTCMinutes());
    setHtml($('ampm'), W(h < 12 ? 'am' : 'pm'));
    setHtml($('greeting'), W(h < 12 ? 'g_morning' : 'g_evening'));

    if (renderedDay !== todayKey) {
      var p = parts(todayKey);
      setHtml($('greg'), W('wd_' + weekday(todayKey)) + ' ' + p[2] + ' ' + W('gm_' + p[1]) + ' ' + p[0]);
      renderedDay = todayKey;
    }
    setHtml($('hijri'), hijriHtml(todayKey));

    var next = nextPrayer(now, todayKey);
    if (next) {
      var left = Math.max(0, Math.floor((next.at - now) / 1000));
      setHtml($('nextName'), W(label(next.p, next.key)) + ' ' + time12(days[next.key].times[next.p.key]));
      $('countdown').textContent = pad(Math.floor(left / 3600)) + ':' + pad(Math.floor(left % 3600 / 60)) + ':' + pad(left % 60);
    }
    var cur = currentPrayer(now, todayKey);
    var since = cur ? Math.floor((now - cur.at) / MINUTE) : -1;
    setHtml($('nowBanner'), cur && since < 20 ? sinceHtml(label(cur.p, cur.key), since) : '');

    // After Isha the row switches to tomorrow's times, with Fajr highlighted.
    renderPrayerRow(now, next && next.key !== todayKey ? next.key : todayKey, next);
    setSky(skyPhase(now, todayKey));

    // Reload once a night as a fallback for long-running TVs.
    if (h === 3 && now - startedAt > 6 * 3600 * 1000) location.reload();
  }

  // The TV keeps the app open, so a new deploy would otherwise never be seen.
  // A new URL (?v=) skips the browser's cached index.html.
  function checkVersion() {
    getJson('version.json?t=' + Date.now()).then(function (json) {
      if (VERSION !== '__V__' && json.v && json.v !== VERSION) {
        location.replace(location.pathname + '?v=' + json.v);
      }
    }).catch(function () { /* offline: try again later */ }).then(function () {
      setTimeout(checkVersion, 5 * MINUTE);
    });
  }

  // ---- Remote control: OK opens settings, arrows move, Back closes ----
  var KEY = { enter: 13, left: 37, up: 38, right: 39, down: 40 };
  var BACK_KEYS = [8, 27, 461, 10009];

  function settingsOpen() { return !$('settings').classList.contains('hidden'); }
  function buttons() { return Array.prototype.slice.call(document.querySelectorAll('#settings .btn')); }

  function openSettings() {
    $('settings').classList.remove('hidden');
    updateSettings();
    var current = document.querySelector('#settings [data-offset="' + hijriOffset + '"]');
    (current || buttons()[0]).focus();
  }
  function closeSettings() {
    $('settings').classList.add('hidden');
    if (document.activeElement) document.activeElement.blur();
  }
  function updateSettings() {
    buttons().forEach(function (b) {
      var o = b.getAttribute('data-offset');
      if (o !== null) b.textContent = (+o === hijriOffset ? '✓ ' : '') + b.textContent.replace(/^✓ /, '');
    });
    $('hijriPreview').textContent = 'التاريخ الهجري: ' + hijriText(keyOf(wall(Date.now())));
  }

  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    if (!settingsOpen()) {
      if (code === KEY.enter) { e.preventDefault(); openSettings(); }
      return;
    }
    if (BACK_KEYS.indexOf(code) >= 0) { e.preventDefault(); closeSettings(); return; }
    var list = buttons(), i = list.indexOf(document.activeElement);
    // Some TV engines don't turn OK into a button click, so do it here.
    if (code === KEY.enter) { e.preventDefault(); if (i >= 0) list[i].click(); return; }
    // In RTL the first button is on the right, so Left/Down move forward.
    if (code === KEY.left || code === KEY.down) { e.preventDefault(); list[Math.min(list.length - 1, i + 1)].focus(); }
    if (code === KEY.right || code === KEY.up) { e.preventDefault(); list[Math.max(0, i - 1)].focus(); }
  });

  $('settings').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.btn') : e.target;
    if (!b) return;
    var offset = b.getAttribute('data-offset'), action = b.getAttribute('data-action');
    if (offset !== null) {
      hijriOffset = +offset;
      store.set('hijriOffset', hijriOffset);
      updateSettings();
      tick();
    } else if (action === 'refresh') {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf('prayers_') === 0) localStorage.removeItem(k); });
      } catch (err) { /* storage unavailable */ }
      location.reload();
    } else if (action === 'close') {
      closeSettings();
    }
  });

  // ---- Start ----
  var startedAt = Date.now();
  Array.prototype.forEach.call(document.querySelectorAll('[data-w]'), function (el) {
    el.innerHTML = W(el.getAttribute('data-w'));
  });
  makeStars();
  renderWeather();
  tick();
  setTimeout(function () { $('hint').style.opacity = 0; }, 12000);
  loadWeather();
  loadNews();
  setTimeout(checkVersion, MINUTE);
  (function loop() { tick(); setTimeout(loop, 1000 - Date.now() % 1000); })();
  window.addEventListener('resize', function () { if (tickerText) startTicker(tickerText); });
})();
