const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'http://localhost:11434' });

// Modelo a usar (llama3 = más inteligente, llama3.2 = más rápido)
const MODELO = 'llama3:latest';

// Personalidad del agente
const SISTEMA = `Eres un asistente personal inteligente.
Respondes siempre en el mismo idioma que te escribe el usuario.
Eres útil, amigable y conciso. No uses markdown en tus respuestas, solo texto plano.`;

// Memoria de conversaciones por usuario
const historiales = new Map();
const MAX_MENSAJES = 20;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'agente-ia' }),
  puppeteer: {
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

client.on('qr', (qr) => {
  console.log('\n📱 Escanea este código QR con tu WhatsApp:');
  console.log('   (Ajustes → Dispositivos vinculados → Vincular dispositivo)\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp autenticado');
});

client.on('ready', () => {
  console.log(`\n🤖 Agente IA listo! Usando modelo: ${MODELO}`);
  console.log('💬 Ahora responderé automáticamente los mensajes de WhatsApp\n');
});

client.on('message', async (message) => {
  if (message.fromMe) return;

  // En grupos solo responde si el mensaje empieza con !ia
  if (message.from.includes('@g.us')) {
    if (!message.body.startsWith('!ia')) return;
    message.body = message.body.replace('!ia', '').trim();
  }

  const chatId = message.from;
  const texto = message.body.trim();

  if (!texto) return;

  // Comandos especiales
  if (texto === '/reset' || texto === '/reiniciar') {
    historiales.delete(chatId);
    await message.reply('🔄 Conversación reiniciada.');
    return;
  }

  if (texto === '/ayuda' || texto === '/help') {
    await message.reply(
      '🤖 Comandos:\n\n' +
      '/reset — borra el historial\n' +
      '/ayuda — muestra esta ayuda\n\n' +
      'En grupos escribe !ia antes de tu pregunta.'
    );
    return;
  }

  // Inicializar historial si no existe
  if (!historiales.has(chatId)) {
    historiales.set(chatId, []);
  }
  const historial = historiales.get(chatId);

  historial.push({ role: 'user', content: texto });

  // Limitar tamaño del historial
  if (historial.length > MAX_MENSAJES) {
    historial.splice(0, historial.length - MAX_MENSAJES);
  }

  try {
    const chat = await message.getChat();
    await chat.sendStateTyping();

    console.log(`[${new Date().toLocaleTimeString()}] Mensaje de ${chatId}: ${texto.substring(0, 60)}`);

    const respuesta = await ollama.chat({
      model: MODELO,
      messages: [
        { role: 'system', content: SISTEMA },
        ...historial
      ]
    });

    const textoRespuesta = respuesta.message.content;

    historial.push({ role: 'assistant', content: textoRespuesta });

    await message.reply(textoRespuesta);

    console.log(`[${new Date().toLocaleTimeString()}] Respuesta enviada (${textoRespuesta.length} chars)`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      await message.reply('❌ El servidor de IA no está disponible. Asegúrate de que Ollama está corriendo.');
    } else {
      await message.reply('❌ Error al procesar tu mensaje. Intenta de nuevo.');
    }
  }
});

client.on('disconnected', (reason) => {
  console.log('📵 Desconectado:', reason);
  console.log('Reconectando en 5 segundos...');
  setTimeout(() => client.initialize(), 5000);
});

console.log('🚀 Iniciando agente WhatsApp con IA local (Ollama)...');
client.initialize();
