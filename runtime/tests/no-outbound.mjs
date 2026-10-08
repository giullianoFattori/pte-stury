import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

const forbidden = () => { throw new Error('Outbound network is forbidden in runtime shell tests.'); };
globalThis.fetch = forbidden;
http.get = http.request = https.get = https.request = forbidden;
net.connect = net.createConnection = net.Socket.prototype.connect = forbidden;
syncBuiltinESMExports();
