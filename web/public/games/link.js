// GameLink: messages between the TV (host) and phones (players), with no server of our own.
// Two transports run side by side:
//  - p2p:  WebRTC data channel, direct over the home Wi-Fi (PeerJS cloud only does signalling).
//  - mqtt: relay through a free public MQTT broker over WebSocket; slower, works almost anywhere.
// Messages are small JSON objects. Room ids are random, but the broker is public: send game
// data only, never anything personal.
// Needs peerjs.min.js and mqtt.min.js loaded first.
(function () {
  'use strict';

  var BROKER = 'wss://broker.hivemq.com:8884/mqtt';
  var PREFIX = 'salalahtv-';

  function topic(room, dir) { return 'salalahtv/' + room + '/' + dir; }
  function randomId(n) {
    var s = '', abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    for (var i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function startMqtt(room, subscribeDir, onMessage, onState) {
    if (!window.mqtt) { onState('mqtt', 'unsupported'); return null; }
    var client = window.mqtt.connect(BROKER, { clientId: PREFIX + randomId(10), reconnectPeriod: 2000, connectTimeout: 8000 });
    client.on('connect', function () { client.subscribe(topic(room, subscribeDir)); onState('mqtt', 'open'); });
    client.on('close', function () { onState('mqtt', 'closed'); });
    client.on('error', function () { onState('mqtt', 'error'); });
    client.on('message', function (_t, payload) {
      try { onMessage(JSON.parse(payload.toString()), 'mqtt'); } catch (e) { /* ignore malformed */ }
    });
    return client;
  }

  // TV side. onMessage(msg, via); onState(transport, state).
  function host(room, onMessage, onState) {
    var conns = {};    // PeerJS peer id -> connection
    var byPlayer = {}; // player id (msg.from) -> connection, learned from their messages
    var api = {
      room: room,
      // Send to one player ({to: id}) or everyone, over the given transport or the best one.
      send: function (msg, via) {
        var useP2p = via !== 'mqtt';
        var sentP2p = false;
        if (useP2p && msg.to) {
          var c = byPlayer[msg.to];
          if (c && c.open) { c.send(msg); sentP2p = true; }
        } else if (useP2p) {
          Object.keys(conns).forEach(function (id) { if (conns[id].open) { conns[id].send(msg); sentP2p = true; } });
        }
        if ((via === 'mqtt' || (!via && !sentP2p)) && mqttClient && mqttClient.connected) {
          mqttClient.publish(topic(room, 'down'), JSON.stringify(msg));
        }
      },
      publish: function (dir, msg) {
        if (mqttClient && mqttClient.connected) mqttClient.publish(topic(room, dir), JSON.stringify(msg));
      },
    };

    if (window.Peer && window.RTCPeerConnection) {
      var peer = new window.Peer(PREFIX + room, { debug: 0 });
      peer.on('open', function () { onState('p2p', 'ready'); });
      peer.on('error', function (e) { onState('p2p', 'error:' + (e && e.type)); });
      peer.on('connection', function (conn) {
        conn.on('open', function () { conns[conn.peer] = conn; onState('p2p', 'open'); });
        conn.on('data', function (d) { if (d && d.from) byPlayer[d.from] = conn; onMessage(d, 'p2p'); });
        conn.on('close', function () {
          delete conns[conn.peer];
          Object.keys(byPlayer).forEach(function (id) { if (byPlayer[id] === conn) delete byPlayer[id]; });
        });
      });
    } else {
      onState('p2p', 'unsupported');
    }
    var mqttClient = startMqtt(room, 'up', onMessage, onState);
    return api;
  }

  // Phone side.
  function join(room, onMessage, onState) {
    var conn = null;
    var api = {
      id: randomId(8),
      via: function () { return conn && conn.open ? 'p2p' : 'mqtt'; },
      send: function (msg, via) {
        msg.from = api.id;
        var v = via || api.via();
        if (v === 'p2p' && conn && conn.open) conn.send(msg);
        else if (mqttClient && mqttClient.connected) mqttClient.publish(topic(room, 'up'), JSON.stringify(msg));
      },
    };
    if (window.Peer && window.RTCPeerConnection) {
      var peer = new window.Peer({ debug: 0 });
      peer.on('open', function () {
        conn = peer.connect(PREFIX + room, { serialization: 'json' });
        conn.on('open', function () { onState('p2p', 'open'); });
        conn.on('data', function (d) { onMessage(d, 'p2p'); });
        conn.on('close', function () { onState('p2p', 'closed'); });
        conn.on('error', function () { onState('p2p', 'error'); });
      });
      peer.on('error', function (e) { onState('p2p', 'error:' + (e && e.type)); });
    } else {
      onState('p2p', 'unsupported');
    }
    var mqttClient = startMqtt(room, 'down', function (msg, via) {
      if (!msg.to || msg.to === api.id) onMessage(msg, via);
    }, onState);
    return api;
  }

  window.GameLink = { host: host, join: join, randomId: randomId };
})();
