/*
 * Information
 * Creator / Developer: Dani Ramdani (Dani Techno.) - FullStack Engineer
 * Contact creator / Developer: 0895 1254 5999 (WhatsApp), contact@danitechno.com (Email)
*/

const {
  makeWASocket,
  useMultiFileAuthState,
  PHONENUMBER_MCC,
  makeCacheableSignalKeyStore,
  jidDecode,
  downloadContentFromMessage,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const {
  Boom
} = require('@hapi/boom');
const pino = require('pino');
const chalk = require('chalk');
const fs = require('fs');
const FileType = require('file-type');

const config = require('./config/settings.js');

const {
  smsg,
  fetchJson,
  fetchBuffer,
  writeExifImage,
  writeExifVideo,
  imageToWebp,
  videoToWebp
} = require('./utils/functionsUtils.js');

const store = {
  contacts: {},
  bind: () => {}
};

async function startServer() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./' + config.session_folder_name);

    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: config.browser || ["Ubuntu", "Chrome", "20.0.04"]
    });

    // توليد كود الاقتران أوتوماتيكياً للرقم الأول المكتوب في قائمة المالكين (owner.number)
    if (config.pairing_mode && !sock.authState.creds.registered) {
      let phoneNumber = config.owner.number[0].replace(/[^0-9]/g, '');

      setTimeout(async () => {
        try {
          let code = await sock.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          
          console.log(chalk.bold.green('\n========================================='));
          console.log(chalk.bold.yellow(`  PAIRING CODE : ${code}`));
          console.log(chalk.bold.green('=========================================\n'));
        } catch (err) {
          console.error('Gagal mendapatkan pairing code:', err);
        }
      }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        let reason = new Boom(lastDisconnect.error).output.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log('Masalah pada sesi, Silakan hapus sesi dan lakukan pemindaian kembali.');
        } else if (reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost) {
          console.log('Koneksi ditutup atau terputus, melakukan koneksi ulang...');
          startServer();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log('Perangkat keluar, Silakan lakukan pemindaian lagi.');
        } else if (reason === DisconnectReason.restartRequired || reason === DisconnectReason.timedOut) {
          console.log('Perlu me-restart, Merestart...');
          startServer();
        } else {
          startServer();
        }
      } else if (connection === 'open') {
        console.log(chalk.bold.cyan('• Bot Berhasil Terhubung!'));
      }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
      try {
        const mek = chatUpdate.messages[0];
        if (!mek.message) return;
        mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
        if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
        const messages = smsg(sock, mek, store);
        const client = sock;
        require('./includes/client.js')({ client, messages });
      } catch (error) {
        console.error(error.message);
      }
    });

    sock.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {};
        return decode.user && decode.server && decode.user + '@' + decode.server || jid;
      } else return jid;
    };

    sock.public = config.public_mode;
    sock.serializeM = (m) => smsg(sock, m, store);
    
    return sock;
  } catch (error) {
    console.error(error);
  }
}

startServer();
